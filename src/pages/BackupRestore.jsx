import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download, Upload, AlertTriangle, Loader2, Undo2, CheckCircle2, Database, FileJson, RotateCcw,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import {
  buildBackup, backupFileName, inspectBackup, uploadPlan, describeRestoreError, CHUNK_SIZE,
} from '../lib/backupFile';
import {
  replacedGroups, restoreSteps, fmtSize, fmtWhen, pickedLine,
} from '../lib/backupView';
import { isTransportFailure } from '../lib/writeOutcome';
import { Button } from '../components/ui/button';
import Dialog from '../components/ui/Dialog';
import {
  PanelHead, SCard, FormRow, Note, CheckNote, Progress, Steps, KV, SubHead, Bullets, fieldCls, redOutline,
} from '../components/backup/parts';
import { cn } from '../lib/utils';

/**
 * The shop's own copy of its books, and the way back to it.
 * Web redesign: approved mockups backup-01 to 13. Look only: every call,
 * the file format and every check are as they were before the redesign.
 *
 * Backup and restore read the same table list from the server
 * (shop_backup_tables), so nothing can be restorable but not backed up, or the
 * reverse. Restore runs on the server in ONE transaction: snapshot the shop as
 * it stands (that is what Undo puts back), wipe, write the file back exactly,
 * verify. Any failure rolls the whole thing back. See
 * supabase/migrations/20261022_restore_a_shop_exactly.sql for why a restore
 * must put rows back exactly rather than let triggers rebuild them.
 */

/**
 * After a restore or an undo, every copy of the shop held in this browser is
 * from before it. Clearing them makes the reload fetch the restored books
 * instead of showing the old ones until something revalidates.
 *
 * The offline outbox is deliberately NOT cleared: it holds sales and payments
 * made on this machine that never reached the server, and throwing those away
 * would lose real work.
 */
async function forgetCachedShopData() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('ledgr_') && k !== 'ledgr_cache_version')
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* storage blocked: the reload still refetches */ }
  try {
    const { clearAll } = await import('../lib/offline/cache.js');
    await clearAll();
  } catch { /* no local database on this platform */ }
}

/** The real reason from a failed edge-function call, not the generic wrapper. */
async function driveErrorText(error, data) {
  if (data && data.message) return data.message;
  try {
    const body = await error?.context?.json?.();
    if (body?.message) return body.message;
  } catch { /* body was not JSON */ }
  return error?.message || String(error);
}

const driveCall = async (action, extra = {}) => {
  const { data, error } = await supabase.functions.invoke('drive-backup', { body: { action, ...extra } });
  if (error || data?.ok === false) throw new Error(await driveErrorText(error, data));
  return data;
};

const Spin = () => <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />;

const NOT_CHANGED = [
  'Logins and their permissions',
  'Your plan',
  'E-invoices already registered with the GST portal',
  'Sales on this computer that have not synced yet',
];

// inRail: shown inside the Settings rail, which already pads the page.
const BackupRestore = ({ inRail = false } = {}) => {
  const wrapCls = inRail ? 'min-w-0' : 'mx-auto max-w-[860px] p-4 sm:p-6';
  const { currentTenantId, currentTenant } = useTenant();
  const { isOwner } = useAuth();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();

  const [busy, setBusy] = useState('');           // '' | 'backup' | 'restore' | 'undo'
  const [progress, setProgress] = useState('');
  const [pct, setPct] = useState(0);              // real progress 0..1, from table / chunk counts
  const [phase, setPhase] = useState('');         // restore: '' | 'upload' | 'apply'
  const [parts, setParts] = useState(0);          // restore: upload calls in the plan
  const [check, setCheck] = useState(null);       // inspectBackup result + parsed
  const [picked, setPicked] = useState(null);     // { name, size, source } of the checked file
  const [confirmText, setConfirmText] = useState('');
  // { kind: 'done'|'error', tone?: 'am', server?: bool, title, detail, rows? }
  const [outcome, setOutcome] = useState(null);
  const [last, setLast] = useState(null);         // the newest applied restore, for Undo
  const [undoAsk, setUndoAsk] = useState(false);
  const fileRef = useRef(null);
  const [drive, setDrive] = useState(null);      // drive_backup_status() result
  const [driveBusy, setDriveBusy] = useState('');
  const [driveFiles, setDriveFiles] = useState(null);
  const [search, setSearch] = useSearchParams();

  const shopName = currentTenant?.name || 'this shop';

  const loadLast = useCallback(async () => {
    if (!currentTenantId || !isOwner) return;
    const { data, error } = await supabase.rpc('restore_last', { p_tenant_id: currentTenantId });
    if (!error) setLast(data || null);
  }, [currentTenantId, isOwner]);

  useEffect(() => { loadLast(); }, [loadLast]);

  // ── google drive ────────────────────────────────────────────────────────
  const loadDrive = useCallback(async () => {
    if (!currentTenantId || !isOwner) return;
    const { data, error } = await supabase.rpc('drive_backup_status');
    if (error) { console.error('[drive] status failed:', error); return; }
    setDrive(data);
  }, [currentTenantId, isOwner]);

  useEffect(() => { loadDrive(); }, [loadDrive]);

  // Google sends the owner back here as /backup?drive=connected|error.
  useEffect(() => {
    const flag = search.get('drive');
    if (!flag) return;
    if (flag === 'connected') {
      setOutcome({ kind: 'done', title: 'Google Drive connected', detail: 'A backup will be saved to your Drive every night. You can also back up now.' });
    } else {
      const reason = search.get('reason') || 'unknown reason';
      console.error('[drive] connect failed:', reason);
      setOutcome({ kind: 'error', title: 'Google Drive was not connected', detail: reason === 'drive_not_configured' ? 'Google Drive backup is not set up on the server yet.' : reason });
    }
    loadDrive();
    setSearch({}, { replace: true });
  }, [search, setSearch, loadDrive]);

  const driveAction = async (name, fn) => {
    setDriveBusy(name);
    try { await fn(); } catch (err) {
      console.error(`[drive] ${name} failed:`, err);
      setOutcome({ kind: 'error', title: 'Google Drive', detail: err.message || String(err) });
    } finally { setDriveBusy(''); }
  };

  const driveConnect = () => driveAction('connect', async () => {
    const { url } = await driveCall('start');
    window.location.assign(url);
  });
  const driveBackupNow = () => driveAction('run', async () => {
    const r = await driveCall('run');
    addNotification(`Backed up to Google Drive (${fmtSize(r.bytes || 0)})`, 'success');
    await loadDrive();
  });
  const driveDisconnect = () => driveAction('disconnect', async () => {
    if (!window.confirm('Disconnect Google Drive? Nightly backups stop. Files already in your Drive stay there.')) return;
    await driveCall('disconnect');
    setDriveFiles(null);
    await loadDrive();
  });
  const driveList = () => driveAction('list', async () => {
    const r = await driveCall('list');
    setDriveFiles(r.files);
  });
  // The downloaded file goes through the same inspect + typed-name confirmation as an uploaded one.
  const drivePick = (f) => driveAction('download', async () => {
    const parsed = await driveCall('download', { fileId: f.id });
    setOutcome(null);
    setConfirmText('');
    setCheck({ ...inspectBackup(parsed, { tenantId: currentTenantId }), parsed });
    setPicked({ name: f.name, size: Number(f.size) || 0, source: 'drive' });
    setDriveFiles(null);
  });

  // ── backup ──────────────────────────────────────────────────────────────
  const takeBackup = async () => {
    if (!currentTenantId) return;
    setBusy('backup');
    setOutcome(null);
    try {
      const { data: manifest, error: mErr } = await supabase.rpc('shop_backup_manifest', { p_tenant_id: currentTenantId });
      if (mErr) throw mErr;

      const tables = {};
      let done = 0;
      for (const m of manifest) {
        done += 1;
        setProgress(`Saving ${m.table}, ${done} of ${manifest.length} tables`);
        setPct((done - 1) / manifest.length);
        const rows = [];
        // Paged by the server in primary-key order, so pages neither overlap
        // nor skip, and no single call approaches the time limit.
        for (let offset = 0; ; offset += CHUNK_SIZE) {
          const { data, error } = await supabase.rpc('export_shop_table', {
            p_tenant_id: currentTenantId, p_table: m.table, p_offset: offset, p_limit: CHUNK_SIZE,
          });
          if (error) throw error;
          rows.push(...(data || []));
          if (!data || data.length < CHUNK_SIZE) break;
        }
        tables[m.table] = rows;
      }

      const payload = buildBackup({
        tenantId: currentTenantId,
        tenantName: currentTenant?.name || 'shop',
        tables,
        manifest,
        appVersion: import.meta?.env?.VITE_APP_VERSION || '',
      });

      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFileName(currentTenant?.name, new Date());
      a.click();
      URL.revokeObjectURL(url);

      const rows = Object.values(payload.counts).reduce((x, y) => x + y, 0);
      addNotification(`Backup saved: ${rows.toLocaleString('en-IN')} rows across ${manifest.length} tables`, 'success');
    } catch (err) {
      console.error('[backup] failed:', err);
      addNotification(`Backup failed: ${err.message || err}`, 'error');
    } finally {
      setBusy('');
      setProgress('');
      setPct(0);
    }
  };

  // ── check ───────────────────────────────────────────────────────────────
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCheck(null);
    setOutcome(null);
    setConfirmText('');
    setPicked({ name: f.name, size: f.size, source: 'file' });
    try {
      const parsed = JSON.parse(await f.text());
      setCheck({ ...inspectBackup(parsed, { tenantId: currentTenantId }), parsed });
    } catch (err) {
      setCheck({ ok: false, errors: [`That file could not be read: ${err.message || err}`], warnings: [] });
    }
  };

  const browse = () => {
    if (fileRef.current) { fileRef.current.value = ''; fileRef.current.click(); }
  };

  // ── restore ─────────────────────────────────────────────────────────────
  const canRestore = check?.ok && confirmText.trim().toLowerCase() === shopName.trim().toLowerCase();

  const afterChange = async (title, detail, rows) => {
    setOutcome({ kind: 'done', title, detail, rows });
    await forgetCachedShopData();
    await loadLast();
  };

  const restore = async () => {
    if (!canRestore || busy) return;
    setBusy('restore');
    setOutcome(null);
    let jobId = null;
    try {
      const { data: job, error: bErr } = await supabase.rpc('restore_begin', {
        p_tenant_id: currentTenantId,
        p_meta: { takenAt: check.parsed.takenAt, rows: check.summary.rows, file: 'upload' },
      });
      if (bErr) throw bErr;
      jobId = job;

      const plan = uploadPlan(check.parsed);
      setPhase('upload');
      setParts(plan.length);
      for (let i = 0; i < plan.length; i += 1) {
        const c = plan[i];
        setProgress(`Uploading ${i + 1} of ${plan.length}`);
        const { error } = await supabase.rpc('restore_stage', {
          p_job_id: jobId, p_table: c.table, p_chunk_no: c.chunkNo, p_rows: c.rows,
        });
        if (error) throw error;
        setPct((i + 1) / plan.length);
      }

      setPhase('apply');
      setProgress('Restoring, this replaces the shop in one step');
      const { data: res, error: aErr } = await supabase.rpc('restore_apply', { p_job_id: jobId });
      if (aErr) throw aErr;

      const rows = Object.values(res?.restored || {}).reduce((a, b) => a + Number(b || 0), 0);
      await afterChange(
        'Restored.',
        `The shop now holds the books as they were on ${fmtWhen(check.parsed.takenAt)}.`,
        rows,
      );
      setCheck(null);
      setPicked(null);
      setConfirmText('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      console.error('[restore] failed:', err);
      if (isTransportFailure(err) && jobId) {
        // The connection dropped. The restore may have committed or not;
        // the server knows, so ask it instead of guessing either way.
        const { data } = await supabase.rpc('restore_last', { p_tenant_id: currentTenantId });
        if (data?.id === jobId) {
          await afterChange('Restored.', 'The connection dropped, but the server confirms the restore finished.', data.rows);
        } else {
          setOutcome({ kind: 'error', tone: 'am', title: 'The restore did not finish.', detail: 'The connection dropped before it completed, and the server shows no restore, so nothing was changed. You can try again.' });
        }
      } else {
        const d = describeRestoreError(err);
        setOutcome({ kind: 'error', server: true, title: d.title, detail: `${d.detail}${d.unchanged ? ' Nothing in the shop was changed.' : ''}` });
      }
    } finally {
      setBusy('');
      setProgress('');
      setPct(0);
      setPhase('');
    }
  };

  const undo = async () => {
    if (!last || busy) return;
    setUndoAsk(false);
    setBusy('undo');
    setOutcome(null);
    try {
      const { data: res, error } = await supabase.rpc('restore_undo', { p_job_id: last.id });
      if (error) throw error;
      const rows = Object.values(res?.restored || {}).reduce((a, b) => a + Number(b || 0), 0);
      await afterChange('Restore undone.', 'The shop is back exactly as it was just before that restore.', rows);
    } catch (err) {
      console.error('[restore] undo failed:', err);
      const d = describeRestoreError(err);
      setOutcome({ kind: 'error', server: true, title: d.title, detail: `${d.detail}${d.unchanged ? ' Nothing in the shop was changed.' : ''}` });
    } finally {
      setBusy('');
    }
  };

  if (!isOwner) {
    return (
      <div className={wrapCls}>
        <PanelHead title="Backup & restore" sub="A copy of this shop's books, in a file you keep, and the way back to it." />
        <SCard testId="backup-owner-only">
          <div className="px-5 py-14 text-center">
            <div className="mx-auto mb-3.5 grid h-[52px] w-[52px] place-items-center rounded-2xl bg-tile text-ink-2">
              <Database size={22} aria-hidden="true" />
            </div>
            <h4 className="font-tight text-[16px] font-semibold text-ink">Only the owner can take or restore a backup</h4>
            <p className="mx-auto mb-4 mt-1 max-w-[46ch] text-[13.5px] text-body">It contains every customer, price and payment in the shop.</p>
            <Button variant="secondary" onClick={() => navigate(-1)}>Go back</Button>
          </div>
        </SCard>
      </div>
    );
  }

  const groups = check?.ok ? replacedGroups(check.parsed) : null;
  const takenAt = check?.ok ? fmtWhen(check.summary.takenAt) : '';
  const restoring = busy === 'restore';

  return (
    <div className={wrapCls}>
      <PanelHead title="Backup & restore" sub="A copy of this shop's books, in a file you keep, and the way back to it." />
      <div className="grid gap-4">

        {outcome && (
          <Note
            testId="restore-outcome"
            role={outcome.kind === 'error' ? 'alert' : 'status'}
            tone={outcome.kind === 'done' ? 'gr' : outcome.tone || 'rd'}
            icon={outcome.kind === 'done' ? CheckCircle2 : AlertTriangle}
            className="m-rise"
          >
            <b className="font-semibold">{outcome.title}</b>{' '}
            {outcome.detail}
            {outcome.rows != null && ` ${Number(outcome.rows).toLocaleString('en-IN')} rows written.`}
            {outcome.server && (
              <span className="mt-0.5 block text-[12px] text-mute">The server&rsquo;s own words are kept so support can see what went wrong.</span>
            )}
            {outcome.kind === 'done' && (
              <div><Button variant="dark" size="xs" className="mt-2.5" onClick={() => window.location.reload()}>Reload the app to see it</Button></div>
            )}
          </Note>
        )}

        {/* Take a backup */}
        <SCard
          title="Take a backup"
          sub="One file with the whole shop in it."
          pad
          footer={(
            <Button onClick={takeBackup} disabled={!!busy} data-testid="backup-go">
              {busy === 'backup' ? <>Saving…</> : <><Download /> Download backup</>}
            </Button>
          )}
        >
          {busy === 'backup' ? (
            <div className="mt-0.5">
              <Progress value={pct} label={progress || 'Saving'} />
              <p className="mt-2 text-[12px] text-mute">Keep this tab open. The file downloads when every table is in.</p>
            </div>
          ) : (
            <p className="text-[13px] text-mute">
              Every table this shop has (items, parties, bills, payments, payroll, the ledger and the accounts) in one file.
              Keep it somewhere that is not this computer.
            </p>
          )}
        </SCard>

        {/* Google Drive */}
        <div data-testid="drive-card">
          {!drive?.connected ? (
            <SCard
              title="Google Drive"
              sub="Saves a backup to your Google Drive every night. bookledger can only see the files it creates."
              pad
              footer={(
                <Button variant="outline" onClick={driveConnect} disabled={!!driveBusy || !drive || !!busy}>
                  {driveBusy === 'connect' ? <><Spin /> Opening Google…</> : 'Connect Google Drive'}
                </Button>
              )}
            >
              <p className="text-[13px] text-mute">{drive ? 'Not connected.' : 'Checking…'}</p>
            </SCard>
          ) : (
            <SCard
              title="Google Drive"
              sub="A backup every night, to your own Drive."
              footer={(
                <>
                  <Button variant="outline" className={cn('mr-auto', redOutline)} onClick={driveDisconnect} disabled={!!driveBusy || !!busy}>
                    Disconnect
                  </Button>
                  <Button variant="outline" onClick={driveList} disabled={!!driveBusy || !!busy}>
                    {driveBusy === 'list' || driveBusy === 'download' ? <><Spin /> Loading…</> : 'Restore from Drive'}
                  </Button>
                  <Button variant="dark" onClick={driveBackupNow} disabled={!!driveBusy || !!busy}>
                    {driveBusy === 'run' ? <><Spin /> Backing up…</> : 'Back up now'}
                  </Button>
                </>
              )}
            >
              <FormRow label="Connected as">{drive.google_email || 'your Google account'}</FormRow>
              <FormRow label="Last backup" hint="Runs every night.">
                <span data-testid="drive-last">
                  {drive.last_status === 'error'
                    ? <span className="text-bad-text">Failed: {drive.last_error}</span>
                    : drive.last_backup_at
                      ? <>{fmtWhen(drive.last_backup_at)} <span className="font-semibold text-good-text">· saved</span></>
                      : <span className="text-body">No backup yet. The first one runs tonight, or press Back up now.</span>}
                </span>
              </FormRow>
              {driveFiles && (
                <div className="mb-3.5 grid gap-1.5" data-testid="drive-files">
                  {driveFiles.length === 0 && <p className="text-[13px] text-body">No backups in your Drive folder yet.</p>}
                  {driveFiles.map((f) => (
                    <button
                      key={f.id} type="button" data-card onClick={() => drivePick(f)} disabled={!!driveBusy || !!busy}
                      className="flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition-colors duration-[var(--dur-hover)] hover:bg-tile disabled:opacity-50 motion-reduce:transition-none"
                    >
                      <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-tile text-ink-2"><FileJson size={16} aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1">
                        <b className="block font-tight text-[13.5px] font-semibold text-ink">{fmtWhen(f.createdTime)}</b>
                        <small className="block truncate text-[12px] text-mute">{fmtSize(f.size)} · {f.name}</small>
                      </span>
                      <span className="font-tight text-[13px] font-semibold text-amber-text">Check this one</span>
                    </button>
                  ))}
                </div>
              )}
            </SCard>
          )}
        </div>

        {/* Check or restore a backup */}
        <SCard title="Check or restore a backup" sub="Choose a backup file. It is checked first; nothing changes until you confirm." pad>
          <input
            ref={fileRef}
            data-testid="backup-file"
            type="file"
            accept=".json"
            onChange={onFile}
            disabled={!!busy}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
          <div className={cn('flex items-center gap-3 rounded-xl px-3.5 py-3',
            picked ? 'border border-line bg-surface' : 'border-[1.5px] border-dashed border-faint bg-tile')}>
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-tile text-ink-2">
              {picked ? <FileJson size={16} aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1">
              <b className="block truncate font-tight text-[13.5px] font-semibold text-ink">{picked ? picked.name : 'Choose backup file'}</b>
              <small className="block text-[12px] text-mute">
                {picked ? pickedLine({ ...picked, parsed: check?.parsed }) : 'A .json file from Download backup or from Google Drive'}
              </small>
            </div>
            <Button variant="outline" onClick={browse} disabled={!!busy}>{picked ? 'Choose another' : 'Browse'}</Button>
          </div>

          {check && (
            <div className="mt-3 grid gap-1.5" data-testid="backup-check">
              {check.errors.map((e) => <CheckNote key={e} tone="rd" icon={AlertTriangle} msg={e} />)}
              {check.warnings.map((w) => <CheckNote key={w} tone="am" icon={AlertTriangle} msg={w} />)}
              {!check.ok && <p className="mt-1 text-[12px] text-mute">Nothing was uploaded and nothing in the shop changed.</p>}

              {check.ok && (
                <Note tone="gr" icon={CheckCircle2} className="px-3 py-[9px]" testId="backup-ok">
                  <b className="font-semibold">This backup is good.</b>{' '}
                  {check.summary.rows.toLocaleString('en-IN')} rows in {check.summary.tables} tables, taken {takenAt}
                  {check.summary.tenantName ? `, from ${check.summary.tenantName}` : ''}.
                </Note>
              )}
            </div>
          )}

          {check?.ok && (
            <div className="mt-3.5 overflow-hidden rounded-[14px] border-[1.5px] border-[#F5C2C2]" data-testid="restore-panel">
              <div className="bg-bad-soft px-4 py-3.5 text-[#991b1b]">
                <h5 className="font-tight text-[15px] font-semibold">Restoring replaces this shop&rsquo;s books</h5>
                <p className="mt-[3px] text-[13px]">
                  Everything in {shopName} goes back to how it was on {takenAt}. Anything entered since then is removed.
                  You can undo it straight afterwards.
                </p>
              </div>
              <div className="grid gap-4 px-4 py-3 sm:grid-cols-2">
                <div data-testid="restore-replaced">
                  <SubHead>Replaced with the file&rsquo;s copy</SubHead>
                  {groups.groups.map((g) => <KV key={g.key} k={g.label} v={g.rows.toLocaleString('en-IN')} />)}
                  <KV total k={`All ${groups.totalTables} tables`} v={`${groups.totalRows.toLocaleString('en-IN')} rows`} />
                </div>
                <div>
                  <SubHead>Not changed</SubHead>
                  <Bullets items={NOT_CHANGED} />
                </div>
              </div>
              <div className="border-t border-sep px-4 pb-4 pt-3">
                <label htmlFor="restore-confirm" className="block font-tight text-[12.5px] font-semibold text-ink-2">
                  Type the shop&rsquo;s name to confirm: <b className="text-ink">{shopName}</b>
                </label>
                <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                  <input
                    id="restore-confirm"
                    data-testid="restore-confirm"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    disabled={!!busy}
                    autoComplete="off"
                    spellCheck={false}
                    className={cn(fieldCls, 'max-w-[340px] flex-1')}
                  />
                  <Button variant="destructive" data-testid="restore-go" onClick={restore} disabled={!canRestore || !!busy}>
                    {restoring ? <>Restoring…</> : <><RotateCcw /> Restore this backup</>}
                  </Button>
                </div>
                {restoring && (
                  <div className="mt-3">
                    <Progress value={phase === 'apply' ? 1 : pct} label={progress || 'Restoring'} />
                    <Steps steps={restoreSteps(phase || 'upload', parts)} />
                    <p className="mt-2 text-[12px] text-mute">
                      Nothing in the shop changes before the Restoring step, and that step is all or nothing.
                      If anything fails, the shop stays exactly as it is.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </SCard>

        {last && (
          <SCard
            testId="last-restore"
            title={last.source === 'UNDO' ? 'Last change: a restore was undone' : 'Last restore'}
            sub={`${fmtWhen(last.applied_at)} · ${Number(last.rows || 0).toLocaleString('en-IN')} rows`}
            pad
            footer={(
              <Button variant="outline" data-testid="restore-undo" onClick={() => setUndoAsk(true)} disabled={!!busy}>
                {busy === 'undo' ? <><Spin /> Undoing…</> : <><Undo2 /> Undo</>}
              </Button>
            )}
          >
            <p className="text-[13px] text-mute">
              Undo puts the shop back exactly as it was just before this. Anything entered since then is removed too.
            </p>
          </SCard>
        )}
      </div>

      <Dialog
        open={undoAsk && !!last}
        onClose={() => setUndoAsk(false)}
        width={480}
        label="Undo the last restore?"
        header={(
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-soft text-amber-text"><Undo2 size={19} aria-hidden="true" /></span>
            <div>
              <h3 className="font-tight text-[18px] font-semibold tracking-[-0.01em]">
                {last?.source === 'UNDO' ? 'Undo the last change?' : 'Undo the last restore?'}
              </h3>
              <p className="mt-0.5 text-[13px] text-body">
                {last?.source === 'UNDO' ? 'Undo' : 'Restore'} on {fmtWhen(last?.applied_at)}
              </p>
            </div>
          </div>
        )}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setUndoAsk(false)}>Keep the restore</Button>
            <Button variant="destructive" data-testid="restore-undo-go" onClick={undo}>Undo restore</Button>
          </>
        )}
      >
        <p className="text-[14px] text-ink-2">
          The shop goes back exactly as it was just before that {last?.source === 'UNDO' ? 'change' : 'restore'}.
          Anything entered since then is removed too.
        </p>
      </Dialog>
    </div>
  );
};

export default BackupRestore;
