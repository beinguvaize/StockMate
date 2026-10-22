import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Upload, ShieldCheck, AlertTriangle, Database, Loader2, Undo2, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import {
  buildBackup, backupFileName, inspectBackup, uploadPlan, describeRestoreError, CHUNK_SIZE,
} from '../lib/backupFile';
import { isTransportFailure } from '../lib/writeOutcome';

/**
 * The shop's own copy of its books, and the way back to it.
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

const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');

const Card = ({ children }) => (
  <div className="bg-card border border-border rounded-2xl p-5">{children}</div>
);

const BackupRestore = () => {
  const { currentTenantId, currentTenant } = useTenant();
  const { isOwner } = useAuth();
  const { addNotification } = useNotifications();

  const [busy, setBusy] = useState('');           // '' | 'backup' | 'restore' | 'undo'
  const [progress, setProgress] = useState('');
  const [check, setCheck] = useState(null);       // inspectBackup result + parsed
  const [confirmText, setConfirmText] = useState('');
  const [outcome, setOutcome] = useState(null);   // { kind: 'done'|'error', title, detail, rows? }
  const [last, setLast] = useState(null);         // the newest applied restore, for Undo
  const fileRef = useRef(null);

  const shopName = currentTenant?.name || 'this shop';

  const loadLast = useCallback(async () => {
    if (!currentTenantId || !isOwner) return;
    const { data, error } = await supabase.rpc('restore_last', { p_tenant_id: currentTenantId });
    if (!error) setLast(data || null);
  }, [currentTenantId, isOwner]);

  useEffect(() => { loadLast(); }, [loadLast]);

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
        setProgress(`${m.table} (${done} of ${manifest.length})`);
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
      addNotification(`Backup saved — ${rows.toLocaleString('en-IN')} rows across ${manifest.length} tables`, 'success');
    } catch (err) {
      console.error('[backup] failed:', err);
      addNotification(`Backup failed: ${err.message || err}`, 'error');
    } finally {
      setBusy('');
      setProgress('');
    }
  };

  // ── check ───────────────────────────────────────────────────────────────
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCheck(null);
    setOutcome(null);
    setConfirmText('');
    try {
      const parsed = JSON.parse(await f.text());
      setCheck({ ...inspectBackup(parsed, { tenantId: currentTenantId }), parsed });
    } catch (err) {
      setCheck({ ok: false, errors: [`That file could not be read: ${err.message || err}`], warnings: [] });
    }
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
      for (let i = 0; i < plan.length; i += 1) {
        const c = plan[i];
        setProgress(`Uploading ${i + 1} of ${plan.length}`);
        const { error } = await supabase.rpc('restore_stage', {
          p_job_id: jobId, p_table: c.table, p_chunk_no: c.chunkNo, p_rows: c.rows,
        });
        if (error) throw error;
      }

      setProgress('Restoring — this replaces the shop in one step');
      const { data: res, error: aErr } = await supabase.rpc('restore_apply', { p_job_id: jobId });
      if (aErr) throw aErr;

      const rows = Object.values(res?.restored || {}).reduce((a, b) => a + Number(b || 0), 0);
      await afterChange(
        'Restored',
        `The shop now holds the books as they were on ${fmtWhen(check.parsed.takenAt)}.`,
        rows,
      );
      setCheck(null);
      setConfirmText('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      console.error('[restore] failed:', err);
      if (isTransportFailure(err) && jobId) {
        // The connection dropped. The restore may have committed or not;
        // the server knows, so ask it instead of guessing either way.
        const { data } = await supabase.rpc('restore_last', { p_tenant_id: currentTenantId });
        if (data?.id === jobId) {
          await afterChange('Restored', 'The connection dropped, but the server confirms the restore finished.', data.rows);
        } else {
          setOutcome({ kind: 'error', title: 'The restore did not finish', detail: 'The connection dropped before it completed, and the server shows no restore, so nothing was changed. You can try again.' });
        }
      } else {
        const d = describeRestoreError(err);
        setOutcome({ kind: 'error', title: d.title, detail: `${d.detail}${d.unchanged ? ' Nothing in the shop was changed.' : ''}` });
      }
    } finally {
      setBusy('');
      setProgress('');
    }
  };

  const undo = async () => {
    if (!last || busy) return;
    setBusy('undo');
    setOutcome(null);
    try {
      const { data: res, error } = await supabase.rpc('restore_undo', { p_job_id: last.id });
      if (error) throw error;
      const rows = Object.values(res?.restored || {}).reduce((a, b) => a + Number(b || 0), 0);
      await afterChange('Restore undone', 'The shop is back exactly as it was just before that restore.', rows);
    } catch (err) {
      console.error('[restore] undo failed:', err);
      const d = describeRestoreError(err);
      setOutcome({ kind: 'error', title: d.title, detail: `${d.detail}${d.unchanged ? ' Nothing in the shop was changed.' : ''}` });
    } finally {
      setBusy('');
    }
  };

  if (!isOwner) {
    return (
      <div className="p-6 max-w-[760px] mx-auto">
        <Card>
          <p className="text-[14px] font-bold">Only the owner can take or restore a backup.</p>
          <p className="text-[13px] text-muted-foreground mt-1">
            It contains every customer, price and payment in the shop.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-[860px] mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Backup &amp; restore</h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          A copy of this shop&rsquo;s books, in a file you keep.
        </p>
      </div>

      {outcome && (
        <div
          data-testid="restore-outcome"
          className={`rounded-2xl border p-4 flex items-start gap-3 ${
            outcome.kind === 'done' ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
          }`}
        >
          {outcome.kind === 'done'
            ? <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 shrink-0" />
            : <AlertTriangle size={18} className="text-rose-600 mt-0.5 shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className={`text-[14px] font-bold ${outcome.kind === 'done' ? 'text-emerald-800' : 'text-rose-700'}`}>
              {outcome.title}
            </p>
            <p className={`text-[13px] mt-0.5 ${outcome.kind === 'done' ? 'text-emerald-800/90' : 'text-rose-700/90'}`}>
              {outcome.detail}
              {outcome.rows != null && ` ${outcome.rows.toLocaleString('en-IN')} rows written.`}
            </p>
            {outcome.kind === 'done' && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-3 inline-flex items-center gap-2 px-4 h-9 rounded-pill bg-card border border-emerald-300 text-[13px] font-bold text-emerald-800"
              >
                Reload the app to see it
              </button>
            )}
          </div>
        </div>
      )}

      <Card>
        <div className="flex items-start gap-3">
          <Database size={18} className="mt-0.5 text-accent-text shrink-0" />
          <div className="flex-1">
            <div className="font-bold text-[15px]">Take a backup</div>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Every table this shop has — items, parties, bills, payments, payroll, the ledger and
              the accounts — in one file. Keep it somewhere that is not this computer.
            </p>
            <button
              type="button"
              onClick={takeBackup}
              disabled={!!busy}
              className="mt-3 inline-flex items-center gap-2 px-5 h-11 rounded-pill bg-accent-signature hover:bg-accent-signature-hover text-white
                         text-[14px] font-bold disabled:opacity-50 disabled:pointer-events-none
                         transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              {busy === 'backup'
                ? <><Loader2 size={16} className="animate-spin" /> Saving {progress}…</>
                : <><Download size={16} /> Download backup</>}
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <ShieldCheck size={18} className="mt-0.5 text-accent-text shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[15px]">Check or restore a backup</div>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Choose a backup file. It is checked first; nothing changes until you confirm.
            </p>
            <input
              ref={fileRef}
              data-testid="backup-file"
              type="file"
              accept=".json"
              onChange={onFile}
              disabled={!!busy}
              className="block w-full text-[13px] text-muted-foreground mt-3 file:mr-3 file:px-4 file:h-10
                         file:rounded-pill file:border-0 file:bg-canvas file:border file:border-border
                         file:font-bold file:cursor-pointer"
            />

            {check && (
              <div className="mt-4 flex flex-col gap-2" data-testid="backup-check">
                {check.errors.map((e) => (
                  <p key={e} className="text-[13px] text-rose-600 flex items-start gap-2">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {e}
                  </p>
                ))}
                {check.warnings.map((w) => (
                  <p key={w} className="text-[13px] text-amber-700 flex items-start gap-2">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {w}
                  </p>
                ))}

                {check.ok && (
                  <>
                    <p className="text-[13px] text-emerald-700 font-semibold" data-testid="backup-ok">
                      This backup is good — {check.summary.rows.toLocaleString('en-IN')} rows in{' '}
                      {check.summary.tables} tables, taken {fmtWhen(check.summary.takenAt)}
                      {check.summary.tenantName ? ` from ${check.summary.tenantName}` : ''}.
                    </p>

                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4" data-testid="restore-panel">
                      <p className="text-[13px] font-bold text-amber-900">Restoring replaces this shop&rsquo;s books</p>
                      <p className="text-[13px] text-amber-900/90 mt-1 leading-relaxed">
                        Everything in {shopName} goes back to how it was on {fmtWhen(check.summary.takenAt)}.
                        Anything entered since then is removed. You can undo it straight afterwards.
                        Users, your plan and e-invoices already registered with the GST portal are not changed.
                      </p>
                      <label htmlFor="restore-confirm" className="block text-[12px] font-semibold text-amber-900 mt-3">
                        Type the shop&rsquo;s name to confirm: <span className="font-bold">{shopName}</span>
                      </label>
                      <input
                        id="restore-confirm"
                        data-testid="restore-confirm"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        disabled={!!busy}
                        autoComplete="off"
                        className="mt-1 w-full max-w-sm h-10 px-3 rounded-md border border-amber-300 bg-card text-[14px] outline-none focus:ring-2 focus:ring-amber-400/40"
                      />
                      <div>
                        <button
                          type="button"
                          data-testid="restore-go"
                          onClick={restore}
                          disabled={!canRestore || !!busy}
                          className="mt-3 inline-flex items-center gap-2 px-5 h-11 rounded-pill bg-rose-600 text-white
                                     text-[14px] font-bold disabled:opacity-40 disabled:pointer-events-none
                                     transition-[background-color,transform] duration-150 active:scale-[0.97]"
                        >
                          {busy === 'restore'
                            ? <><Loader2 size={16} className="animate-spin" /> {progress || 'Restoring'}…</>
                            : <><Upload size={16} /> Restore this backup</>}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {last && (
        <Card>
          <div className="flex items-start gap-3" data-testid="last-restore">
            <Undo2 size={18} className="mt-0.5 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <div className="font-bold text-[15px]">
                {last.source === 'UNDO' ? 'Last change: a restore was undone' : 'Last restore'}
              </div>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                {fmtWhen(last.applied_at)} · {Number(last.rows || 0).toLocaleString('en-IN')} rows
              </p>
              <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">
                Undo puts the shop back exactly as it was just before this. Anything entered since
                then is removed too.
              </p>
              <button
                type="button"
                data-testid="restore-undo"
                onClick={undo}
                disabled={!!busy}
                className="mt-3 inline-flex items-center gap-2 px-5 h-10 rounded-pill bg-card border border-border
                           text-[13px] font-bold disabled:opacity-50 disabled:pointer-events-none"
              >
                {busy === 'undo' ? <><Loader2 size={15} className="animate-spin" /> Undoing…</> : <><Undo2 size={15} /> Undo</>}
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default BackupRestore;
