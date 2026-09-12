/**
 * BugReportsAdmin — global-admin panel listing tenant-submitted bug
 * reports with severity/status filters and inline triage actions.
 */
import React, { useMemo, useState } from 'react';
import { Bug, AlertTriangle, ChevronDown, X, RefreshCw, ExternalLink, Loader2 } from 'lucide-react';
import { useBugReports } from '../../hooks/useBugReports';

const SEVERITY_COLOR = {
  LOW:      'bg-muted text-ink-secondary border-border',
  NORMAL:   'bg-sky-50 text-sky-600 border-sky-200',
  HIGH:     'bg-accent-signature/10 text-accent-signature-hover border-accent-signature/25',
  CRITICAL: 'bg-rose-50 text-rose-600 border-rose-200',
};
const STATUS_COLOR = {
  OPEN:        'bg-rose-50 text-rose-600 border-rose-200',
  TRIAGED:     'bg-accent-signature/10 text-accent-signature-hover border-accent-signature/25',
  IN_PROGRESS: 'bg-sky-50 text-sky-700 border-sky-200',
  RESOLVED:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  WONTFIX:     'bg-muted text-muted-foreground border-border',
};
const STATUSES = ['OPEN', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'WONTFIX'];

const fmtDate = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return iso; }
};

const BugReportsAdmin = ({ tenants = [] }) => {
  const { data, notes, loading, refetch, updateStatus, addNote, deleteNote } =
    useBugReports(null, { adminMode: true });
  const [noteDraft, setNoteDraft] = useState({});   // report id -> text
  const [noteBusy, setNoteBusy]   = useState(null);
  const [noteError, setNoteError] = useState('');

  const submitNote = async (reportId, visibility) => {
    const body = (noteDraft[reportId] || '').trim();
    if (!body) return;
    setNoteBusy(reportId + visibility); setNoteError('');
    const { error } = await addNote(reportId, body, visibility);
    setNoteBusy(null);
    // Never swallow it: a note the team believes was sent to the customer but
    // was not is worse than no note at all.
    if (error) { setNoteError(error.message || 'The note could not be saved.'); return; }
    setNoteDraft(d => ({ ...d, [reportId]: '' }));
  };
  const [statusFilter, setStatusFilter]   = useState('OPEN');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [openId, setOpenId] = useState(null);
  const [saving, setSaving] = useState(false);

  const tenantById = useMemo(() => {
    const m = new Map();
    tenants.forEach(t => m.set(t.id, t.name));
    return m;
  }, [tenants]);

  const filtered = useMemo(() => data.filter(r =>
    (statusFilter === 'ALL'   || r.status   === statusFilter) &&
    (severityFilter === 'ALL' || r.severity === severityFilter)
  ), [data, statusFilter, severityFilter]);

  const counts = useMemo(() => {
    const out = { ALL: data.length, OPEN: 0, TRIAGED: 0, IN_PROGRESS: 0, RESOLVED: 0, WONTFIX: 0 };
    data.forEach(r => { out[r.status] = (out[r.status] || 0) + 1; });
    return out;
  }, [data]);

  const setStatus = async (id, status) => {
    setSaving(true);
    const patch = { status };
    if (status === 'RESOLVED') patch.resolved_at = new Date().toISOString();
    await updateStatus(id, patch);
    setSaving(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-black/5 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
          <Bug size={18} className="text-rose-500" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-black text-ink-primary leading-none">Bug Reports</h2>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
            {data.length} total · {counts.OPEN} open
          </p>
        </div>
        <button onClick={refetch}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[11px] font-black text-ink-primary hover:bg-canvas">
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-black/5 bg-canvas/30">
        <div className="flex items-center gap-1 bg-white border border-border rounded-xl p-1">
          {['ALL', ...STATUSES].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                statusFilter === s ? 'bg-ink-primary text-white' : 'text-muted-foreground hover:text-ink-primary'
              }`}>
              {s.replace('_', ' ')}{counts[s] != null && <span className="ml-1 opacity-70">({counts[s]})</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-white border border-border rounded-xl p-1">
          {['ALL', 'LOW', 'NORMAL', 'HIGH', 'CRITICAL'].map(s => (
            <button key={s} onClick={() => setSeverityFilter(s)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                severityFilter === s ? 'bg-ink-primary text-white' : 'text-muted-foreground hover:text-ink-primary'
              }`}>{s}</button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="p-6 space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-canvas animate-pulse rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          <AlertTriangle size={28} className="mx-auto mb-2 text-muted-foreground" />
          No reports for this filter
        </div>
      ) : (
        <div className="divide-y divide-black/5">
          {filtered.map(r => {
            const isOpen = openId === r.id;
            return (
              <div key={r.id}>
                <button onClick={() => setOpenId(isOpen ? null : r.id)}
                  className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-canvas/40 transition-colors">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black border ${SEVERITY_COLOR[r.severity] || SEVERITY_COLOR.NORMAL}`}>
                    {r.severity}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black border ${STATUS_COLOR[r.status] || STATUS_COLOR.OPEN}`}>
                    {r.status.replace('_', ' ')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-black text-ink-primary truncate">{r.title}</div>
                    <div className="text-[10px] font-bold text-muted-foreground mt-0.5 truncate">
                      {tenantById.get(r.tenant_id) || 'Unknown tenant'} · {r.user_email || 'anon'} · {r.source_app}
                    </div>
                  </div>
                  <div className="text-[10px] font-bold text-muted-foreground tabular-nums whitespace-nowrap">{fmtDate(r.created_at)}</div>
                  <ChevronDown size={14} className={`text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <div className="px-6 py-4 bg-canvas/40 border-t border-black/5 space-y-3">
                    <div className="whitespace-pre-wrap text-xs font-medium text-ink-primary bg-white rounded-xl border border-black/5 p-3 max-h-64 overflow-y-auto">
                      {r.description}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[10px] font-bold text-muted-foreground">
                      <div><span className="text-muted-foreground uppercase tracking-widest mr-2">Tenant</span>{tenantById.get(r.tenant_id) || r.tenant_id}</div>
                      <div><span className="text-muted-foreground uppercase tracking-widest mr-2">App</span>{r.source_app} · {r.app_version || '—'}</div>
                      <div className="truncate" title={r.page_url}>
                        <span className="text-muted-foreground uppercase tracking-widest mr-2">Page</span>
                        {r.page_url
                          ? <a href={r.page_url} target="_blank" rel="noreferrer" className="text-accent-signature inline-flex items-center gap-1 truncate">{r.page_url} <ExternalLink size={10} /></a>
                          : '—'}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-black/5">
                      {STATUSES.map(s => (
                        <button key={s} disabled={saving || r.status === s}
                          onClick={() => setStatus(r.id, s)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border ${
                            r.status === s
                              ? 'bg-ink-primary text-white border-ink-primary'
                              : 'bg-white border-border text-ink-primary hover:border-accent-signature/40'
                          } disabled:opacity-50`}>
                          {saving && r.status !== s ? <Loader2 size={11} className="animate-spin" /> : `Mark ${s.replace('_', ' ')}`}
                        </button>
                      ))}
                    </div>

                    {/* Notes. Two buttons rather than a visibility dropdown:
                        the destination is the decision, and a dropdown lets a
                        mis-set default send an internal remark to a customer. */}
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="text-[10px] font-black uppercase tracking-wide text-muted-foreground mb-2">
                        Notes
                      </div>

                      {(notes[r.id] || []).length === 0 && (
                        <div className="text-[11px] text-muted-foreground mb-2">No notes yet.</div>
                      )}

                      <div className="flex flex-col gap-1.5 mb-3">
                        {(notes[r.id] || []).map(n => (
                          <div key={n.id}
                            className={`rounded-lg border px-3 py-2 ${
                              n.visibility === 'PUBLIC'
                                ? 'bg-emerald-50/60 border-emerald-200'
                                : 'bg-amber-50/50 border-amber-200'}`}>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`text-[9px] font-black uppercase tracking-wide ${
                                n.visibility === 'PUBLIC' ? 'text-emerald-700' : 'text-amber-700'}`}>
                                {n.visibility === 'PUBLIC' ? 'Customer can see this' : 'Internal only'}
                              </span>
                              <span className="text-[9px] text-muted-foreground">
                                {n.author_name || 'staff'} · {new Date(n.created_at).toLocaleString('en-IN')}
                              </span>
                              <button onClick={() => deleteNote(n.id)}
                                className="ml-auto text-[9px] font-bold text-muted-foreground hover:text-red-600">
                                Remove
                              </button>
                            </div>
                            <div className="text-[11.5px] text-ink-primary whitespace-pre-wrap">{n.body}</div>
                          </div>
                        ))}
                      </div>

                      <textarea
                        rows={2}
                        value={noteDraft[r.id] || ''}
                        onChange={e => setNoteDraft(d => ({ ...d, [r.id]: e.target.value }))}
                        placeholder="Write a note…"
                        className="w-full rounded-lg border border-border px-3 py-2 text-[11.5px] outline-none focus:ring-2 focus:ring-accent-signature/20"
                      />
                      {noteError && (
                        <div className="mt-1.5 text-[11px] font-semibold text-red-600">{noteError}</div>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          disabled={!!noteBusy || !(noteDraft[r.id] || '').trim()}
                          onClick={() => submitNote(r.id, 'INTERNAL')}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-black border bg-white border-border text-ink-primary hover:border-amber-400 disabled:opacity-40">
                          Add internal note
                        </button>
                        <button
                          disabled={!!noteBusy || !(noteDraft[r.id] || '').trim()}
                          onClick={() => submitNote(r.id, 'PUBLIC')}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-black border bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">
                          Send to customer
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BugReportsAdmin;
