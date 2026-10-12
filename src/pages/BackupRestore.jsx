import React, { useRef, useState } from 'react';
import { Download, Upload, ShieldCheck, AlertTriangle, Database, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchAllPages } from '../lib/fetchAllPages';
import { useTenant } from '../context/TenantContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import {
  ALL_BACKUP_TABLES, buildBackup, backupFileName, inspectBackup, restorePlan,
  DERIVED_TABLES,
} from '../lib/backupFile';

/**
 * The shop's own copy of its books.
 *
 * There are two backups and this is the second one. The nightly pg_dump to R2
 * covers every tenant, is ours to run, and has never once succeeded because
 * its secrets were never added. This one belongs to the shop: one button, one
 * file, no dependency on our schedule or our continued existence.
 *
 * RESTORE IS DELIBERATELY NARROW IN THIS VERSION.
 *
 * Writing a sale back fires the ledger triggers, so a file's saved
 * account_transactions must never be written too or every payment lands twice
 * (backupFile.js carries that rule and its tests). Restoring OVER a shop that
 * already has data additionally needs an ordered delete inside one
 * transaction, which is server work, not a loop in a browser.
 *
 * So: restore is offered only into an empty shop, and says so plainly rather
 * than appearing to work and leaving two of everything. Verifying a file is
 * always available, because "is my backup any good" is the question that
 * actually matters between now and the day it is needed.
 */
const BackupRestore = () => {
  const { currentTenantId, currentTenant } = useTenant();
  const { isOwner } = useAuth();
  const { addNotification } = useNotifications();

  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState('');
  const [check, setCheck] = useState(null);
  const fileRef = useRef(null);

  const takeBackup = async () => {
    if (!currentTenantId) return;
    setBusy('backup');
    const tables = {};
    try {
      for (const table of ALL_BACKUP_TABLES) {
        setProgress(table);
        // Paged, like every other whole-table read in this app: a backup that
        // silently stops at PostgREST's 1000-row ceiling is the worst kind of
        // backup, because it looks complete.
        const { data, error, complete } = await fetchAllPages(
          () => supabase.from(table).select('*').eq('tenant_id', currentTenantId),
          { label: `backup:${table}` },
        );
        if (error) {
          // A table this tenant cannot read (or does not have) is recorded as
          // absent rather than silently empty.
          console.warn(`[backup] ${table}:`, error.message || error);
          continue;
        }
        if (!complete) throw new Error(`${table} is larger than the backup ceiling — tell support before relying on this file`);
        tables[table] = data;
      }

      const payload = buildBackup({
        tenantId: currentTenantId,
        tenantName: currentTenant?.name || 'shop',
        tables,
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
      addNotification(`Backup saved — ${rows.toLocaleString('en-IN')} rows`, 'success');
    } catch (err) {
      addNotification(`Backup failed: ${err.message || err}`, 'error');
    } finally {
      setBusy('');
      setProgress('');
    }
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCheck(null);
    try {
      const parsed = JSON.parse(await f.text());
      const res = inspectBackup(parsed, { tenantId: currentTenantId });
      setCheck({ ...res, parsed, plan: res.ok ? restorePlan(parsed) : null });
    } catch (err) {
      setCheck({ ok: false, errors: [`That file could not be read: ${err.message || err}`], warnings: [] });
    }
  };

  const Card = ({ children }) => (
    <div className="bg-card border border-border rounded-2xl p-5">{children}</div>
  );

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

      <Card>
        <div className="flex items-start gap-3">
          <Database size={18} className="mt-0.5 text-accent-text shrink-0" />
          <div className="flex-1">
            <div className="font-bold text-[15px]">Take a backup</div>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Everything this shop has entered — items, parties, bills, payments — plus the
              ledger as it stands, in one file. Keep it somewhere that is not this computer.
            </p>
            <button
              type="button"
              onClick={takeBackup}
              disabled={busy === 'backup'}
              className="mt-3 inline-flex items-center gap-2 px-5 h-11 rounded-pill bg-accent-solid text-white
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
          <div className="flex-1">
            <div className="font-bold text-[15px]">Check a backup file</div>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Worth checking <em>before</em> the day you need it, not on it.
            </p>
            <input
              ref={fileRef}
              data-testid="backup-file"
              type="file"
              accept=".json"
              onChange={onFile}
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
                  <p key={w} className="text-[13px] text-amber-600 flex items-start gap-2">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {w}
                  </p>
                ))}

                {check.ok && (
                  <>
                    <p className="text-[13px] text-emerald-700 font-semibold" data-testid="backup-ok">
                      This backup is good — {check.summary.rows.toLocaleString('en-IN')} rows,
                      taken {new Date(check.summary.takenAt).toLocaleString('en-IN')}
                      {check.summary.tenantName ? ` from ${check.summary.tenantName}` : ''}.
                    </p>
                    <div className="mt-1 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
                      {Object.entries(check.summary.counts)
                        .filter(([, n]) => n > 0)
                        .sort((a, b) => b[1] - a[1])
                        .map(([t, n]) => (
                          <div key={t} className="flex justify-between gap-2">
                            <span className="truncate">{t}</span>
                            <span className="tabular-nums">{n.toLocaleString('en-IN')}</span>
                          </div>
                        ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <Upload size={18} className="mt-0.5 text-muted-foreground shrink-0" />
          <div className="flex-1">
            <div className="font-bold text-[15px]">Restoring</div>
            <p className="text-[13px] text-muted-foreground mt-0.5 leading-relaxed">
              Not from this screen yet, and the reason is worth knowing rather than discovering.
              Writing a sale back makes the database post its payment to the ledger again — so a
              restore that also wrote the saved ledger rows would record every payment twice.
              Restoring over a shop that already has data needs the old rows removed in one
              transaction on the server, which is the next piece of work.
            </p>
            <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">
              Your file is complete and readable today: it holds{' '}
              {DERIVED_TABLES.length} computed tables for the record, and support can restore it
              for you. The check above tells you it will be there when it is needed.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default BackupRestore;
