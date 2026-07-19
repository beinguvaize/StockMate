/**
 * DataTable — minimal report table primitive.
 *
 * Design contract (approved report redesign):
 *   - Theme tokens only (foreground / muted-foreground / border / card /
 *     muted) so every theme — amber, Zinc, dark — renders correctly. No
 *     hardcoded slate/hex.
 *   - System sans everywhere; numbers align via tabular-nums, not a mono font.
 *   - th: 11px medium muted, sentence case. td: 13px. Money right-aligned.
 *   - Optional `totalsRow`: a final semibold muted row inside the table
 *     (replaces the old separate totals strip).
 *   - Hover tint, optional expandable nested row. Flat, hairline borders.
 *
 * Usage:
 *   <DataTable
 *     title="Machine P&L"
 *     columns={[
 *       { key: 'name',    label: 'Machine',  align: 'left' },
 *       { key: 'revenue', label: 'Revenue',  align: 'right', numeric: true, fmt: inr },
 *       { key: 'margin',  label: 'Margin',   align: 'right', numeric: true,
 *         fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`,
 *         className: (v) => v >= 0 ? 'text-emerald-700' : 'text-rose-600' },
 *     ]}
 *     rows={machines}
 *     totalsRow={{ name: 'Totals', revenue: 171554, margin: 14.5 }}
 *     getRowKey={(r) => r.id}
 *     renderExpanded={(r) => <ProductBreakdown rows={r.products} />}
 *   />
 */
import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';

const NUM_CLS = 'tabular-nums';

const cellAlign = (a) =>
  a === 'right' ? 'text-right' :
  a === 'center' ? 'text-center' : 'text-left';

const Cell = ({ col, value, isHeader = false }) => {
  const align = cellAlign(col.align);
  const formatted = col.fmt ? col.fmt(value) : value;
  const colourFn = typeof col.className === 'function' ? col.className : null;
  const colourClass = colourFn ? colourFn(value) : (col.className || '');
  if (isHeader) {
    return (
      <th className={`text-[11px] font-medium text-muted-foreground py-2.5 px-4 ${align}`}>
        {col.label}
      </th>
    );
  }
  return (
    <td className={`text-[13px] py-2.5 px-4 ${align} ${col.numeric ? NUM_CLS : ''} text-foreground ${colourClass}`}>
      {formatted}
    </td>
  );
};

const DataTable = ({
  title,
  subtitle,
  columns,
  rows = [],
  totalsRow = null,          // optional { [colKey]: value } — rendered as final semibold row
  getRowKey = (r, i) => r?.id ?? i,
  renderExpanded,            // optional fn(row) → JSX inside expanded panel
  emptyMessage = 'No data',
  className = '',
}) => {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (k) =>
    setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const span = columns.length + (renderExpanded ? 1 : 0);

  return (
    <div className={`bg-card rounded-[10px] border border-border overflow-hidden ${className}`}>
      {(title || subtitle) && (
        <div className="px-4 pt-4 pb-2.5">
          {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {renderExpanded && <th className="w-8" />}
              {columns.map((c) => <Cell key={c.key} col={c} isHeader />)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={span} className="text-center text-sm text-muted-foreground py-12">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {rows.map((row, i) => {
              const k = getRowKey(row, i);
              const isOpen = open.has(k);
              return (
                <React.Fragment key={k}>
                  <tr
                    onClick={renderExpanded ? () => toggle(k) : undefined}
                    className={`border-b border-border/60 last:border-b-0 transition-colors
                                ${renderExpanded ? 'cursor-pointer hover:bg-muted/50' : 'hover:bg-muted/40'}
                                ${isOpen ? 'bg-muted/50' : ''}`}
                  >
                    {renderExpanded && (
                      <td className="w-8 pl-4 text-muted-foreground">
                        <ChevronRight
                          size={14}
                          className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}
                        />
                      </td>
                    )}
                    {columns.map((c) => (
                      <Cell key={c.key} col={c} value={row[c.key]} />
                    ))}
                  </tr>
                  {isOpen && renderExpanded && (
                    <tr className="bg-muted/40">
                      <td colSpan={span} className="px-4 py-3">
                        {renderExpanded(row)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {totalsRow && rows.length > 0 && (
              <tr className="bg-muted/40 border-t border-border">
                {renderExpanded && <td className="w-8" />}
                {columns.map((c) => {
                  const v = totalsRow[c.key];
                  const colourFn = typeof c.className === 'function' ? c.className : null;
                  const colour = v != null && colourFn ? colourFn(v) : '';
                  return (
                    <td key={c.key}
                        className={`text-[13px] font-semibold py-2.5 px-4 ${cellAlign(c.align)} ${c.numeric ? NUM_CLS : ''} text-foreground ${colour}`}>
                      {v == null ? '' : (c.fmt ? c.fmt(v) : v)}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/** Nested mini-table for the expanded row body — tighter padding. */
DataTable.Inner = ({ columns, rows = [], emptyMessage = 'No items' }) => (
  <div className="rounded-lg border border-border overflow-hidden bg-card">
    <table className="w-full">
      <thead>
        <tr className="border-b border-border">
          {columns.map((c) => (
            <th key={c.key}
                className={`text-[10px] font-medium text-muted-foreground py-2 px-3 ${cellAlign(c.align)}`}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr><td colSpan={columns.length} className="text-center text-xs text-muted-foreground py-5">{emptyMessage}</td></tr>
        )}
        {rows.map((row, i) => (
          <tr key={row?.id ?? i} className="border-b border-border/60 last:border-b-0">
            {columns.map((c) => {
              const v = row[c.key];
              const f = c.fmt ? c.fmt(v) : v;
              const colour = typeof c.className === 'function' ? c.className(v) : (c.className || '');
              return (
                <td key={c.key}
                    className={`text-xs py-2 px-3 ${cellAlign(c.align)} ${c.numeric ? NUM_CLS : ''} ${colour} text-foreground`}>
                  {f}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/** Helpers */
export const inr = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const pct = (n) => {
  const v = Number(n || 0);
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
};

export const signedColour = (v) => (Number(v) >= 0 ? 'text-emerald-700' : 'text-rose-600');

export default DataTable;
