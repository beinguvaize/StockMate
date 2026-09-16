import React, { useState } from 'react';
import { Bug, X, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useBugReports } from '../hooks/useBugReports';

const SEVERITIES = [
  { id: 'LOW',      label: 'Low',      desc: 'Cosmetic / nice-to-have' },
  { id: 'NORMAL',   label: 'Normal',   desc: 'Annoying but workable' },
  { id: 'HIGH',     label: 'High',     desc: 'Blocks daily work' },
  { id: 'CRITICAL', label: 'Critical', desc: 'Data loss / app down' },
];

const ReportIssueButton = () => {
  // All hooks run unconditionally — React requires stable hook order.
  const { currentTenantId } = useTenant();
  // Listing the tenant's own reports as well as submitting, so someone who
  // reported something can see what came of it. RLS returns their rows and,
  // on them, only the notes marked for the customer.
  const { submit, data: myReports, notes: myNotes } = useBugReports(currentTenantId);
  const [showMine, setShowMine] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('NORMAL');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  // Don't render on guest screens (login/welcome) — no tenant context.
  if (!currentTenantId) return null;

  const reset = () => {
    setTitle(''); setDescription(''); setSeverity('NORMAL');
    setDone(false); setError(null); setSubmitting(false);
  };

  const close = () => { setOpen(false); setTimeout(reset, 300); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await submit({ title, description, severity });
    if (error) {
      setError(error.message || 'Failed to send. Try again.');
      setSubmitting(false);
      return;
    }
    setDone(true);
    setSubmitting(false);
    setTimeout(close, 1800);
  };

  return (
    <>
      {/* Floating launcher */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Report an issue"
        className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 px-4 py-3 rounded-full bg-ink-primary text-white shadow-2xl hover:scale-105 transition-transform no-print"
      >
        <Bug size={16} />
        <span className="text-xs font-black uppercase tracking-widest hidden sm:inline">Report</span>
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl border border-black/5 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center">
                  <Bug size={16} className="text-rose-500" />
                </div>
                <div>
                  <h2 className="text-base font-black text-ink-primary leading-none">Report an Issue</h2>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Sent to support</p>
                </div>
              </div>
              <button onClick={close} className="text-muted-foreground hover:text-ink-primary">
                <X size={18} />
              </button>
            </div>

            {done ? (
              <div className="px-6 py-10 flex flex-col items-center gap-3 text-center">
                <CheckCircle2 size={40} className="text-emerald-500" />
                <div className="text-sm font-black text-ink-primary">Report submitted</div>
                <div className="text-xs text-muted-foreground">Our team has been notified.</div>
              </div>
            ) : (
              <>
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-ink-secondary uppercase tracking-wider mb-2">Title</label>
                  <input
                    type="text"
                    required
                    maxLength={200}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Short summary"
                    className="w-full bg-white border border-border shadow-sm rounded-xl px-3.5 py-3 text-xs font-bold text-ink-primary placeholder:text-muted-foreground outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-ink-secondary uppercase tracking-wider mb-2">What happened?</label>
                  <textarea
                    required
                    maxLength={4000}
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Steps to reproduce, what you expected, what actually happened"
                    className="w-full bg-white border border-border shadow-sm rounded-xl px-3.5 py-3 text-xs font-medium text-ink-primary placeholder:text-muted-foreground outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10 transition-all resize-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-ink-secondary uppercase tracking-wider mb-2">Severity</label>
                  <div className="grid grid-cols-2 gap-2">
                    {SEVERITIES.map(s => (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => setSeverity(s.id)}
                        className={`text-left px-3 py-2 rounded-xl border transition-all ${
                          severity === s.id
                            ? 'bg-ink-primary text-white border-ink-primary shadow-md'
                            : 'bg-white border-border text-ink-primary hover:border-accent-signature/40'
                        }`}
                      >
                        <div className="text-[11px] font-black uppercase tracking-wider">{s.label}</div>
                        <div className={`text-[10px] mt-0.5 ${severity === s.id ? 'text-white/70' : 'text-muted-foreground'}`}>{s.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-bold">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-signature text-button-text text-sm font-black disabled:opacity-60 transition-all"
                >
                  {submitting ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : 'Send Report'}
                </button>
              </form>

              {/* What happened to what they reported before. */}
              {(myReports || []).length > 0 && (
                <div className="border-t border-black/5 px-5 py-4">
                  <button type="button" onClick={() => setShowMine(v => !v)}
                    className="w-full flex items-center justify-between text-[11px] font-black uppercase tracking-wide text-muted-foreground hover:text-ink-primary">
                    <span>Your reports ({myReports.length})</span>
                    <span>{showMine ? '−' : '+'}</span>
                  </button>

                  {showMine && (
                    <div className="mt-3 flex flex-col gap-2.5 max-h-64 overflow-y-auto">
                      {myReports.map(r => (
                        <div key={r.id} className="rounded-lg border border-black/8 px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[11.5px] font-bold text-ink-primary">{r.title}</span>
                            <span className="ml-auto text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-canvas text-muted-foreground">
                              {String(r.status || 'OPEN').replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-[9.5px] text-muted-foreground mt-0.5">
                            {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>

                          {(myNotes?.[r.id] || []).map(n => (
                            <div key={n.id} className="mt-2 rounded bg-emerald-50/70 border border-emerald-200 px-2.5 py-1.5">
                              <div className="text-[9px] font-black uppercase tracking-wide text-emerald-700 mb-0.5">
                                Update from support
                              </div>
                              <div className="text-[11px] text-ink-primary whitespace-pre-wrap">{n.body}</div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default ReportIssueButton;
