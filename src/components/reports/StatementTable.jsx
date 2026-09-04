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
const accentText = { amber: 'text-accent-signature-hover', rose: 'text-rose-600', emerald: 'text-emerald-700', ink: 'text-foreground' };
const accentBar  = { amber: 'bg-accent-signature', rose: 'bg-rose-500', emerald: 'bg-emerald-500', ink: 'bg-ink-primary' };

const Amount = ({ v, className = '' }) => (
  <span className={`tabular-nums ${className}`}>{formatINR(v)}</span>
);

const StatementTable = ({ sections = [], grandTotal, note }) => (
  <div className="bg-card rounded-[10px] border border-border/60 shadow-sm overflow-hidden">
    <table className="w-full">
      <thead>
        <tr className="border-b border-black/10 bg-canvas/40">
          <th className="px-6 py-3 text-left tabular-nums text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Particulars</th>
          <th className="px-6 py-3 text-right tabular-nums text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Amount</th>
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
                    <span className={`text-[12px] font-semibold uppercase tracking-widest ${accentText[acc]}`}>{sec.title}</span>
                  </div>
                </td>
              </tr>
              {(sec.groups || []).map((g, gi) => {
                const subtotal = g.lines.reduce((a, l) => a + (Number(l.value) || 0), 0);
                return (
                  <React.Fragment key={gi}>
                    {g.title && (
                      <tr>
                        <td className="px-6 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" colSpan={2}>{g.title}</td>
                      </tr>
                    )}
                    {g.lines.map((l, li) => (
                      <tr key={li} className="hover:bg-accent-signature/[0.03] transition-colors">
                        <td className="pl-10 pr-6 py-1.5 text-[13px] font-medium text-foreground">{l.label}</td>
                        <td className="px-6 py-1.5 text-right text-[13px] font-semibold text-foreground"><Amount v={l.value} /></td>
                      </tr>
                    ))}
                    {/* group subtotal */}
                    <tr className="border-t border-black/[0.06]">
                      <td className="pl-10 pr-6 py-1.5 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">{g.subtotalLabel || `Total ${g.title || ''}`.trim()}</td>
                      <td className="px-6 py-1.5 text-right"><Amount v={subtotal} className="text-[13px] font-semibold text-ink-secondary" /></td>
                    </tr>
                  </React.Fragment>
                );
              })}
              {/* section total */}
              <tr className="border-t-2 border-black/15 bg-canvas/30">
                <td className={`px-6 py-2.5 text-[12px] font-semibold uppercase tracking-widest ${accentText[acc]}`}>{sec.totalLabel || `Total ${sec.title}`}</td>
                <td className="px-6 py-2.5 text-right"><Amount v={sec.total} className={`text-[15px] font-semibold ${accentText[acc]}`} /></td>
              </tr>
            </React.Fragment>
          );
        })}
        {grandTotal && (
          <tr className="border-t-2 border-ink-primary bg-ink-primary/[0.03]">
            <td className="px-6 py-3 text-[13px] font-semibold uppercase tracking-widest text-foreground">{grandTotal.label}</td>
            <td className="px-6 py-3 text-right"><Amount v={grandTotal.value} className="text-[16px] font-semibold text-foreground" /></td>
          </tr>
        )}
      </tbody>
    </table>
    {note && <div className="px-6 py-3 border-t border-border/60 text-[10px] font-medium text-muted-foreground">{note}</div>}
  </div>
);

export default StatementTable;
