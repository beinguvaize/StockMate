import React, { useState } from 'react';
import { Receipt, ChevronDown, Banknote, Trash2, Calendar, Users } from 'lucide-react';

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

const PayHistory = ({ payrollRecords, currencySymbol, openPayRun, deletePayrollRecord }) => {
  const [expandedRecord, setExpandedRecord] = useState(null);
  const sym = currencySymbol || '₹';

  if (payrollRecords.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-16 text-center">
        <div className="w-12 h-12 rounded-xl bg-canvas flex items-center justify-center mx-auto mb-4">
          <Receipt size={20} className="text-gray-300" />
        </div>
        <p className="text-sm font-semibold text-ink-primary mb-1">No pay history</p>
        <p className="text-[11px] text-gray-400 mb-6">Process a payroll run to see records here.</p>
        <button className="btn-signature !h-10 !px-6 !text-xs mx-auto" onClick={openPayRun}>Run Payroll</button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-black/5 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Pay Runs</span>
        <span className="text-[10px] font-semibold text-gray-400">{payrollRecords.length} record{payrollRecords.length !== 1 ? 's' : ''}</span>
      </div>

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
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${type === 'Weekly' ? 'bg-blue-50 text-blue-500' : 'bg-gray-100 text-gray-400'}`}>
                        {type}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {runDate && (
                      <span className="text-[10px] text-gray-400 flex items-center gap-1">
                        <Calendar size={9} /> {runDate}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400 flex items-center gap-1">
                      <Users size={9} /> {empCount} employee{empCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-base font-bold text-ink-primary tabular-nums">{sym}{(record.totalNet || 0).toLocaleString('en-IN')}</div>
                  <div className="text-[9px] text-gray-400 font-medium uppercase">Net paid</div>
                </div>

                <div className={`w-7 h-7 rounded-full border border-black/10 flex items-center justify-center transition-all shrink-0 ${isExpanded ? 'bg-ink-primary text-white rotate-180' : 'text-gray-400'}`}>
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
                        <div className="text-[9px] font-semibold text-gray-400 uppercase mb-1">{s.label}</div>
                        <div className={`text-sm font-bold tabular-nums ${s.color}`}>
                          {s.prefix || ''}{sym}{s.value.toLocaleString('en-IN')}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Staff table */}
                  <div className="bg-white rounded-xl border border-black/5 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-black/5 flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Staff breakdown</span>
                      <button
                        className="w-6 h-6 rounded flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors"
                        title="Delete record"
                        onClick={e => { e.stopPropagation(); deletePayrollRecord(record.id); }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-canvas/50">
                          <th className="px-4 py-2 text-[9px] font-semibold text-gray-400 uppercase">Employee</th>
                          <th className="px-4 py-2 text-right text-[9px] font-semibold text-gray-400 uppercase">Base</th>
                          <th className="px-4 py-2 text-right text-[9px] font-semibold text-gray-400 uppercase">Extras</th>
                          <th className="px-4 py-2 text-right text-[9px] font-semibold text-gray-400 uppercase">Deductions</th>
                          <th className="px-4 py-2 text-right text-[9px] font-semibold text-gray-400 uppercase">Net Pay</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {(record.items || []).map(item => (
                          <tr key={item.employeeId} className="hover:bg-canvas/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="text-sm font-semibold text-ink-primary">{item.employeeName}</div>
                              <div className="text-[9px] text-gray-400">{item.department} · {item.payType}</div>
                            </td>
                            <td className="px-4 py-3 text-right text-xs font-semibold text-gray-600 tabular-nums">{sym}{Math.round(item.basePay || 0).toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3 text-right text-xs font-semibold text-emerald-600 tabular-nums">+{sym}{Math.round((item.overtime || 0) + (item.commission || 0) + (item.bonus || 0)).toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3 text-right text-xs font-semibold text-red-500 tabular-nums">-{sym}{Math.round(item.deductions || 0).toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3 text-right text-sm font-bold text-ink-primary tabular-nums">{sym}{Math.round(item.netPay || 0).toLocaleString('en-IN')}</td>
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
    </div>
  );
};

export default PayHistory;
