import React, { useMemo } from 'react';
import useReportData from './useReportData';
import PremiumReportView from './PremiumReportView';
import { Download, AlertTriangle, RefreshCw } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import { useTenant } from '../../context/TenantContext';

// Stock whose cost no supplier bill supports.
//
// Every batch now records where it came from and how its cost was set. The ones
// costed by hand — opening stock, adjustments — are guesses until a bill or a
// physical count confirms them, and they feed COGS exactly like real costs do.
// This is the standing view of that exposure, so it is monitored rather than
// rediscovered months later by query.
//
// Reads the stock_unverified_cost view: the server does the join and the ageing,
// so this screen and any DB-side check can never disagree.

// Age is the real signal. A hand-typed cost from this morning is a loose end;
// the same cost still unconfirmed after three months is a number nobody is ever
// going to be able to verify.
const AGE_BANDS = [
  { id: 'FRESH', label: '< 30 days',  test: (n) => n < 30,             cls: 'text-blue-600 bg-blue-50 border-blue-200' },
  { id: 'D60',   label: '30–59 days', test: (n) => n >= 30 && n < 60,  cls: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
  { id: 'D90',   label: '60–89 days', test: (n) => n >= 60 && n < 90,  cls: 'text-accent-signature bg-accent-signature/10 border-accent-signature/25' },
  { id: 'STALE', label: '90+ days',   test: (n) => n >= 90,            cls: 'text-red-600 bg-red-50 border-red-200' },
];

const ORIGIN_LABEL = {
  OPENING:    'Opening stock',
  ADJUSTMENT: 'Adjustment',
  PRODUCTION: 'Production',
  TRANSFER:   'Transfer',
  PURCHASE:   'Purchase',
};

const BASIS_LABEL = {
  ESTIMATED:  { text: 'Typed by hand', cls: 'text-red-600 bg-red-50 border-red-200' },
  LAST_KNOWN: { text: 'Last buy price', cls: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
  DERIVED:    { text: 'Computed',      cls: 'text-blue-600 bg-blue-50 border-blue-200' },
};

const UnverifiedCostReport = () => {
  const { businessProfile } = useTenant();
  const currency = businessProfile?.currencySymbol || '₹';

  const { data: batches, loading, refetch } = useReportData({
    table: 'stock_unverified_cost',
    select: 'batch_id, product_id, product_name, origin, cost_basis, received_date, age_days, unit_cost, qty_remaining, value_at_risk, sold_rows',
    dateColumn: 'received_date',
  });

  const rows = useMemo(() => (batches || []).map(b => {
    const age = Number(b.age_days) || 0;
    const band = AGE_BANDS.find(x => x.test(age));
    return {
      ...b,
      _age: age,
      _band: band?.label || '—',
      _bandCls: band?.cls || 'text-muted-foreground bg-muted border-border',
      _origin: ORIGIN_LABEL[b.origin] || b.origin || '—',
      _basis: BASIS_LABEL[b.cost_basis] || { text: b.cost_basis || '—', cls: 'text-muted-foreground bg-muted border-border' },
      _value: Number(b.value_at_risk) || 0,
      _sold: Number(b.sold_rows) || 0,
    };
  }).sort((a, b) => b._value - a._value), [batches]);

  const totalValue = rows.reduce((s, r) => s + r._value, 0);
  const staleValue = rows.filter(r => r._age >= 90).reduce((s, r) => s + r._value, 0);
  // Batches that have already been sold from: their guessed cost is no longer
  // just sitting on the balance sheet, it has been booked into profit.
  const bookedRows = rows.filter(r => r._sold > 0);
  const bookedValue = bookedRows.reduce((s, r) => s + r._value, 0);

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const aoa = [
      ['Unverified stock cost — batches with no supplier bill behind their cost'],
      [`Generated ${new Date().toISOString().slice(0, 10)}`],
      [],
      ['Product', 'Origin', 'Cost basis', 'Received', 'Age (days)', 'Unit cost', 'Qty left', 'Value at risk', 'Sold from'],
      ...rows.map(r => [r.product_name, r._origin, r.cost_basis, r.received_date, r._age,
        Number(r.unit_cost), Number(r.qty_remaining), r._value, r._sold]),
      [],
      ['Total', '', '', '', '', '', '', totalValue, ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 28 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 11 }, { wch: 11 }, { wch: 10 }, { wch: 14 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Unverified cost');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Unverified_Stock_Cost_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const tab = {
    id: 'unverified',
    label: 'Unverified cost',
    kpis: [
      { id: 'value',  label: 'Unsupported stock value', value: totalValue,  format: 'currency' },
      { id: 'stale',  label: 'Unconfirmed 90+ days',    value: staleValue,  format: 'currency' },
      { id: 'booked', label: 'Already sold from',       value: bookedValue, format: 'currency' },
      { id: 'count',  label: 'Batches',                 value: rows.length, format: 'number' },
    ],
    columns: [
      {
        key: 'product_name', label: 'Product', sortable: true, width: 220,
        render: (v, r) => (
          <div>
            <div className="font-semibold text-foreground">{v}</div>
            <div className="text-[10px] text-muted-foreground">{r._origin}</div>
          </div>
        ),
      },
      {
        key: 'cost_basis', label: 'Cost basis', sortable: true, width: 140,
        render: (_v, r) => (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${r._basis.cls}`}>
            {r._basis.text}
          </span>
        ),
      },
      { key: 'received_date', label: 'Received', type: 'date', sortable: true, width: 110 },
      {
        key: '_age', label: 'Unconfirmed for', sortable: true, width: 130,
        render: (v, r) => (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${r._bandCls}`}>
            {v >= 90 && <AlertTriangle size={10} />}{v}d
          </span>
        ),
      },
      { key: 'unit_cost', label: 'Unit cost', type: 'currency', align: 'right', sortable: true },
      { key: 'qty_remaining', label: 'Qty left', align: 'right', sortable: true },
      { key: '_value', label: 'Value at risk', type: 'currency', align: 'right', sortable: true },
      {
        key: '_sold', label: 'Sold from', align: 'right', width: 100,
        render: (v) => v > 0
          ? <span className="text-[10px] font-semibold text-red-600">{v} sale{v > 1 ? 's' : ''}</span>
          : <span className="text-[10px] text-muted-foreground">—</span>,
      },
    ],
    data: rows,
    loading,
  };

  return (
    <>
      <div className="no-print flex items-center justify-end gap-2 mb-3">
        <button onClick={() => refetch?.()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-[11px] font-semibold text-ink-secondary hover:bg-card transition-colors">
          <RefreshCw size={13} /> Refresh
        </button>
        <button onClick={exportExcel}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent-signature hover:bg-accent-signature-hover text-white text-[11px] font-semibold transition-colors">
          <Download size={13} /> Excel
        </button>
      </div>

      {/* Say plainly what the number means — it is not a loss, and it is not an
          error. It is stock whose cost nobody has confirmed, which is a
          different and quieter problem. */}
      <div className="no-print mb-3 rounded-xl border border-border bg-card p-3.5">
        <div className="text-[11px] text-muted-foreground leading-relaxed">
          These batches carry a cost that <strong className="text-foreground">no supplier bill supports</strong> —
          opening stock and hand adjustments. The figures are not losses; they are guesses that
          feed profit exactly like real costs do. Confirm one by entering the purchase it came
          from, or by counting the stock and adjusting at a known price.
          {bookedRows.length > 0 && (
            <> <strong className="text-red-600">
              {bookedRows.length} of these {bookedRows.length === 1 ? 'has' : 'have'} already been sold from
              ({formatCurrency(bookedValue, currency)} still on hand), so a guessed cost has
              already reached the P&amp;L.
            </strong></>
          )}
        </div>
      </div>

      <PremiumReportView
        title="Unverified Stock Cost"
        subtitle="Stock whose cost no purchase bill supports"
        tabs={[tab]}
      />
    </>
  );
};

export default UnverifiedCostReport;
