import React from 'react';
import { formatINR } from '../../utils/financialCalculations';

/**
 * Classic financial-statement renderer (Balance Sheet, P&L, …).
 *
 * sections: [{
 *   title, accent ('amber'|'rose'|'emerald'|'ink'),
 *   groups: [{ title, lines: [{ label, value, bold }], subtotalLabel }],
 *   total, totalLabel
 * }]
 * grandTotal: { label, value } (optional, rendered at the very bottom)
 * note: optional footer note
 *
 * Two-column ledger layout: Particulars (left) · Amount (right, monospace).
 */
const accentText = { amber: 'text-amber-700', rose: 'text-rose-600', emerald: 'text-emerald-700', ink: 'text-ink-primary' };
const accentBar  = { amber: 'bg-amber-500', rose: 'bg-rose-500', emerald: 'bg-emerald-500', ink: 'bg-ink-primary' };

const Amount = ({ v, className = '' }) => (
  <span className={`font-mono tabular-nums ${className}`}>{formatINR(v)}</span>
);

const StatementTable = ({ sections = [], grandTotal, note }) => (
  <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
    <table className="w-full">
      <thead>
        <tr className="border-b border-black/10 bg-canvas/40">
          <th className="px-6 py-3 text-left font-mono text-[10px] font-bold uppercase tracking-widest text-gray-400">Particulars</th>
          <th className="px-6 py-3 text-right font-mono text-[10px] font-bold uppercase tracking-widest text-gray-400">Amount</th>
        </tr>
      </thead>
      <tbody>
        {sections.map((sec, si) => {
          const acc = sec.accent || 'ink';
          return (
            <React.Fragment key={si}>
              {/* Section header */}
              <tr>
                <td colSpan={2} className="px-6 pt-5 pb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-1 h-4 rounded-full ${accentBar[acc]}`} />
                    <span className={`text-[12px] font-black uppercase tracking-widest ${accentText[acc]}`}>{sec.title}</span>
                  </div>
                </td>
              </tr>
              {(sec.groups || []).map((g, gi) => {
                const subtotal = g.lines.reduce((a, l) => a + (Number(l.value) || 0), 0);
                return (
                  <React.Fragment key={gi}>
                    {g.title && (
                      <tr>
                        <td className="px-6 pt-2.5 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-500" colSpan={2}>{g.title}</td>
                      </tr>
                    )}
                    {g.lines.map((l, li) => (
                      <tr key={li} className="hover:bg-amber-500/[0.03] transition-colors">
                        <td className="pl-10 pr-6 py-1.5 text-[13px] font-medium text-ink-primary">{l.label}</td>
                        <td className="px-6 py-1.5 text-right text-[13px] font-semibold text-ink-primary"><Amount v={l.value} /></td>
                      </tr>
                    ))}
                    {/* group subtotal */}
                    <tr className="border-t border-black/[0.06]">
                      <td className="pl-10 pr-6 py-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-wide">{g.subtotalLabel || `Total ${g.title || ''}`.trim()}</td>
                      <td className="px-6 py-1.5 text-right"><Amount v={subtotal} className="text-[13px] font-bold text-gray-600" /></td>
                    </tr>
                  </React.Fragment>
                );
              })}
              {/* section total */}
              <tr className="border-t-2 border-black/15 bg-canvas/30">
                <td className={`px-6 py-2.5 text-[12px] font-black uppercase tracking-widest ${accentText[acc]}`}>{sec.totalLabel || `Total ${sec.title}`}</td>
                <td className="px-6 py-2.5 text-right"><Amount v={sec.total} className={`text-[15px] font-black ${accentText[acc]}`} /></td>
              </tr>
            </React.Fragment>
          );
        })}
        {grandTotal && (
          <tr className="border-t-2 border-ink-primary bg-ink-primary/[0.03]">
            <td className="px-6 py-3 text-[13px] font-black uppercase tracking-widest text-ink-primary">{grandTotal.label}</td>
            <td className="px-6 py-3 text-right"><Amount v={grandTotal.value} className="text-[16px] font-black text-ink-primary" /></td>
          </tr>
        )}
      </tbody>
    </table>
    {note && <div className="px-6 py-3 border-t border-black/5 text-[10px] font-medium text-gray-400">{note}</div>}
  </div>
);

export default StatementTable;
