/**
 * DataTable — vendflow-style report table primitive.
 *
 * Design contract:
 *   - Plus Jakarta Sans (font-display via inline) for headers / titles.
 *   - Inter for body text (default sans).
 *   - JetBrains Mono w/ tabular-nums for every number cell so columns
 *     align without grid hacks.
 *   - Monochrome neutrals + a single accent colour per row family
 *     (green = positive, red = negative).
 *   - Hover row tint, optional expandable nested row.
 *   - No bg-card glassmorphism, no shadow on rows — flat + clean.
 *
 * Usage:
 *   <DataTable
 *     title="Machine P&L"
 *     subtitle="Click a row to expand product breakdown"
 *     columns={[
 *       { key: 'name',    label: 'Machine',  align: 'left' },
 *       { key: 'revenue', label: 'Revenue',  align: 'right', numeric: true, fmt: inr },
 *       { key: 'cogs',    label: 'COGS',     align: 'right', numeric: true, fmt: inr },
 *       { key: 'margin',  label: 'Margin',   align: 'right', numeric: true,
 *         fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`,
 *         className: (v) => v >= 0 ? 'text-emerald-600' : 'text-red-600' },
 *     ]}
 *     rows={machines}
 *     getRowKey={(r) => r.id}
 *     renderExpanded={(r) => <ProductBreakdown rows={r.products} />}
 *   />
 */
import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';

const NUM_CLS = 'font-mono tabular-nums';
const DISPLAY = '"Plus Jakarta Sans", Inter, sans-serif';

const cellAlign = (a) =>
  a === 'right' ? 'text-right' :
  a === 'center' ? 'text-center' : 'text-left';

const Cell = ({ col, value, isHeader = false }) => {
  const align = cellAlign(col.align);
  const numeric = col.numeric;
  const formatted = col.fmt ? col.fmt(value) : value;
  const colourFn = typeof col.className === 'function' ? col.className : null;
  const colourClass = colourFn ? colourFn(value) : (col.className || '');
  const base = isHeader
    ? `text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 py-3 px-4 ${align}`
    : `text-sm py-3.5 px-4 ${align} ${numeric ? NUM_CLS + ' text-slate-900' : 'text-slate-900'} ${colourClass}`;
  return isHeader
    ? <th className={base} style={{ fontFamily: DISPLAY }}>{col.label}</th>
    : <td className={base}>{formatted}</td>;
};

const DataTable = ({
  title,
  subtitle,
  columns,
  rows = [],
  getRowKey = (r, i) => r?.id ?? i,
  renderExpanded,            // optional fn(row) → JSX inside expanded panel
  emptyMessage = 'No data',
  className = '',
}) => {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (k) =>
    setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 overflow-hidden ${className}`}>
      {(title || subtitle) && (
        <div className="px-5 pt-5 pb-3">
          {title && (
            <h3 className="text-lg font-bold text-slate-900 tracking-tight"
                style={{ fontFamily: DISPLAY }}>{title}</h3>
          )}
          {subtitle && (
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 border-y border-slate-200">
            <tr>
              {renderExpanded && <th className="w-8" />}
              {columns.map((c) => <Cell key={c.key} col={c} isHeader />)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (renderExpanded ? 1 : 0)}
                    className="text-center text-sm text-slate-400 py-12">
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
                    className={`border-b border-slate-100 transition-colors
                                ${renderExpanded ? 'cursor-pointer hover:bg-slate-50' : ''}
                                ${isOpen ? 'bg-slate-50' : ''}`}
                  >
                    {renderExpanded && (
                      <td className="w-8 pl-4 text-slate-400">
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
                    <tr className="bg-slate-50/60">
                      <td colSpan={columns.length + 1} className="px-4 py-3">
                        {renderExpanded(row)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * Nested mini-table for the expanded row body — same vendflow aesthetic
 * but tighter padding + lighter header.
 */
DataTable.Inner = ({ columns, rows = [], emptyMessage = 'No items' }) => (
  <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
    <table className="w-full">
      <thead>
        <tr className="bg-slate-50 border-b border-slate-200">
          {columns.map((c) => (
            <th key={c.key}
                className={`text-[10px] font-semibold uppercase tracking-wider text-slate-500 py-2 px-3 ${cellAlign(c.align)}`}
                style={{ fontFamily: DISPLAY }}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr><td colSpan={columns.length} className="text-center text-xs text-slate-400 py-5">{emptyMessage}</td></tr>
        )}
        {rows.map((row, i) => (
          <tr key={row?.id ?? i} className="border-b border-slate-100 last:border-b-0">
            {columns.map((c) => {
              const v = row[c.key];
              const f = c.fmt ? c.fmt(v) : v;
              const colour = typeof c.className === 'function' ? c.className(v) : (c.className || '');
              return (
                <td key={c.key}
                    className={`text-xs py-2 px-3 ${cellAlign(c.align)} ${c.numeric ? NUM_CLS : ''} ${colour} text-slate-700`}>
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

export const signedColour = (v) => (Number(v) >= 0 ? 'text-emerald-600' : 'text-red-600');

export default DataTable;
