import React, { useState } from 'react';
import { Receipt, ChevronDown, Banknote, Trash2, Calendar, Users, FileText } from 'lucide-react';
import PaySlip from './PaySlip';

const formatPeriod = (period) => {
  if (!period) return '—';
  if (period.includes('/')) {
    const [s, e] = period.split('/');
    const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `${fmt(s)} – ${fmt(e)}`;
  }
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
};

const periodType = (period) => {
  if (!period) return '';
  return period.includes('/') ? 'Weekly' : 'Monthly';
};

const PayHistory = ({ payrollRecords, currencySymbol, openPayRun, deletePayrollRecord,
                     employees = [], business }) => {
  const [expandedRecord, setExpandedRecord] = useState(null);
  // The slip to print: one employee of one run. Held here rather than in the
  // row so closing it does not collapse the run underneath.
  const [slipTarget, setSlipTarget] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const sym = currencySymbol || '₹';

  // Deleting a run now also reverses its salary expenses, so this takes money
  // out of DayBook and the P&L. Name the amount before doing it — silently
  // pulling ₹7,200 out of a closed month is its own kind of surprise.
  const confirmDelete = async (record) => {
    const amount = `${sym}${Number(record.totalNet || 0).toLocaleString('en-IN')}`;
    const ok = window.confirm(
      `Delete the pay run for ${formatPeriod(record.period)}?\n\n` +
      `This also reverses ${amount} of salary expenses, so DayBook, the P&L and the cash account will all drop by that much.`
    );
    if (!ok) return;

    setDeleting(record.id); setDeleteError('');
    const res = await deletePayrollRecord(record.id);
    setDeleting(null);
    if (res && res.success === false) setDeleteError(res.message || res.error?.message || 'The pay run could not be deleted.');
  };

  if (payrollRecords.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-16 text-center">
        <div className="w-12 h-12 rounded-xl bg-canvas flex items-center justify-center mx-auto mb-4">
          <Receipt size={20} className="text-muted-foreground" />
        </div>
        <p className="text-sm font-semibold text-ink-primary mb-1">No pay history</p>
        <p className="text-[11px] text-muted-foreground mb-6">Process a payroll run to see records here.</p>
        <button className="btn-signature !h-10 !px-6 !text-xs mx-auto" onClick={openPayRun}>Run Payroll</button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-black/5 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Pay Runs</span>
        <span className="text-[10px] font-semibold text-muted-foreground">{payrollRecords.length} record{payrollRecords.length !== 1 ? 's' : ''}</span>
      </div>

      {deleteError && (
        <div className="mx-5 mt-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] font-semibold text-rose-700">
          {deleteError}
        </div>
      )}

      <div className="divide-y divide-black/5">
        {payrollRecords.map(record => {
          const isExpanded = expandedRecord === record.id;
          const label = formatPeriod(record.period);
          const type = periodType(record.period);
          const empCount = (record.items || []).length;
          const runDate = record.processed_at
            ? new Date(record.processed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            : null;

          return (
            <div key={record.id}>
              {/* Row */}
              <div
                onClick={() => setExpandedRecord(isExpanded ? null : record.id)}
                className="flex items-center gap-4 px-5 py-4 hover:bg-canvas/60 cursor-pointer transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-ink-primary/5 flex items-center justify-center shrink-0">
                  <Receipt size={15} className="text-ink-primary/40" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink-primary">{label}</span>
                    {type && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${type === 'Weekly' ? 'bg-blue-50 text-blue-500' : 'bg-muted text-muted-foreground'}`}>
                        {type}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {runDate && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar size={9} /> {runDate}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Users size={9} /> {empCount} employee{empCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-base font-bold text-ink-primary tabular-nums">{sym}{(record.totalNet || 0).toLocaleString('en-IN')}</div>
                  <div className="text-[9px] text-muted-foreground font-medium uppercase">Net paid</div>
                </div>

                <div className={`w-7 h-7 rounded-full border border-black/10 flex items-center justify-center transition-all shrink-0 ${isExpanded ? 'bg-ink-primary text-white rotate-180' : 'text-muted-foreground'}`}>
                  <ChevronDown size={13} />
                </div>
              </div>

              {/* Expanded */}
              {isExpanded && (
                <div className="px-5 pb-4 bg-canvas/40 border-t border-black/5 animate-fade-in">
                  {/* Summary chips */}
                  <div className="grid grid-cols-4 gap-3 py-4">
                    {[
                      { label: 'Base Pay',   value: record.totalBase        || 0, color: 'text-ink-primary' },
                      { label: 'Extras',     value: (record.totalOvertime || 0) + (record.totalCommission || 0) + (record.totalBonus || 0), color: 'text-emerald-600', prefix: '+' },
                      { label: 'Deductions', value: record.totalDeductions  || 0, color: 'text-red-500', prefix: '-' },
                      { label: 'Net Total',  value: record.totalNet         || 0, color: 'text-ink-primary', bold: true },
                    ].map(s => (
                      <div key={s.label} className="bg-white rounded-xl border border-black/5 px-4 py-3 shadow-sm">
                        <div className="text-[9px] font-semibold text-muted-foreground uppercase mb-1">{s.label}</div>
                        <div className={`text-sm font-bold tabular-nums ${s.color}`}>
                          {s.prefix || ''}{sym}{s.value.toLocaleString('en-IN')}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Staff table */}
                  <div className="bg-white rounded-xl border border-black/5 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-black/5 flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Staff breakdown</span>
                      <button
                        className="w-6 h-6 rounded flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors disabled:opacity-40"
                        title="Delete this run and reverse its salary expenses"
                        disabled={deleting === record.id}
                        onClick={e => { e.stopPropagation(); confirmDelete(record); }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-canvas/50">
                          <th className="px-4 py-2 text-[9px] font-semibold text-muted-foreground uppercase">Employee</th>
                          <th className="px-4 py-2 text-right text-[9px] font-semibold text-muted-foreground uppercase">Base</th>
                          <th className="px-4 py-2 text-right text-[9px] font-semibold text-muted-foreground uppercase">Extras</th>
                          <th className="px-4 py-2 text-right text-[9px] font-semibold text-muted-foreground uppercase">Deductions</th>
                          <th className="px-4 py-2 text-right text-[9px] font-semibold text-muted-foreground uppercase">Net Pay</th>
                          <th className="px-4 py-2 text-right text-[9px] font-semibold text-muted-foreground uppercase">Slip</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {(record.items || []).map(item => (
                          <tr key={item.employeeId} className="hover:bg-canvas/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="text-sm font-semibold text-ink-primary">{item.employeeName}</div>
                              <div className="text-[9px] text-muted-foreground">{item.department} · {item.payType}</div>
                            </td>
                            <td className="px-4 py-3 text-right text-xs font-semibold text-ink-secondary tabular-nums">{sym}{Math.round(item.basePay || 0).toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3 text-right text-xs font-semibold text-emerald-600 tabular-nums">+{sym}{Math.round((item.overtime || 0) + (item.commission || 0) + (item.bonus || 0)).toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3 text-right text-xs font-semibold text-red-500 tabular-nums">-{sym}{Math.round(item.deductions || 0).toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3 text-right text-sm font-bold text-ink-primary tabular-nums">{sym}{Math.round(item.netPay || 0).toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3 text-right">
                              {/* One employee's slip, from what this run froze. */}
                              <button
                                onClick={e => { e.stopPropagation(); setSlipTarget({ run: record, item }); }}
                                title={`Salary slip for ${item.employeeName}`}
                                className="w-7 h-7 rounded-lg border border-black/10 inline-flex items-center justify-center text-muted-foreground hover:text-ink-primary hover:bg-canvas transition-colors"
                              >
                                <FileText size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {slipTarget && (
        <PaySlip
          run={slipTarget.run}
          item={slipTarget.item}
          employee={employees.find(e => e.id === slipTarget.item.employeeId)}
          business={business}
          onClose={() => setSlipTarget(null)}
        />
      )}
    </div>
  );
};

export default PayHistory;
