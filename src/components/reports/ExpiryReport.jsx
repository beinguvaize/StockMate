import React, { useMemo } from 'react';
import useReportData from './useReportData';
import PremiumReportView from './PremiumReportView';
import { Download, AlertTriangle } from 'lucide-react';
import { round2 } from '../../utils/financialCalculations';

// Expiry tracking — dated batches with qty remaining, bucketed by urgency.
// Value at risk = qty_remaining × unit_cost.

const daysTo = (d) => Math.ceil((new Date(d) - Date.now()) / 86400000);

const BUCKETS = [
  { id: 'EXPIRED', label: 'Expired',   test: (n) => n < 0,            color: 'text-red-600 bg-red-50 border-red-200' },
  { id: 'D30',     label: '≤ 30 days', test: (n) => n >= 0 && n <= 30, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { id: 'D60',     label: '31–60 days', test: (n) => n > 30 && n <= 60, color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
  { id: 'D90',     label: '61–90 days', test: (n) => n > 60 && n <= 90, color: 'text-blue-600 bg-blue-50 border-blue-200' },
];

const ExpiryReport = () => {
  const { data: batches, loading } = useReportData({
    table: 'product_batches',
    select: 'id, product_id, expiry_date, qty_remaining, unit_cost, received_date, supplier_id',
  });
  const { data: products } = useReportData({ table: 'products', select: 'id, name, sku' });

  const rows = useMemo(() => (batches || [])
    .filter(b => b.expiry_date && Number(b.qty_remaining) > 0)
    .map(b => {
      const p = products.find(x => x.id === b.product_id) || {};
      const days = daysTo(b.expiry_date);
      const bucket = BUCKETS.find(bk => bk.test(days));
      return {
        ...b,
        _product: p.name || b.product_id,
        _sku: p.sku || '',
        _days: days,
        _bucket: bucket?.label || '> 90 days',
        _bucketColor: bucket?.color || 'text-gray-500 bg-gray-50 border-gray-200',
        _value: round2(Number(b.qty_remaining) * Number(b.unit_cost || 0)),
      };
    })
    .filter(r => r._days <= 90)
    .sort((a, b) => a._days - b._days), [batches, products]);

  const kpiFor = (id) => rows.filter(r => BUCKETS.find(b => b.id === id)?.test(r._days));
  const valueAtRisk = rows.filter(r => r._days <= 30).reduce((s, r) => s + r._value, 0);

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const aoa = [
      ['Expiry Report — batches expiring within 90 days'],
      [],
      ['Product', 'SKU', 'Expiry Date', 'Days Left', 'Bucket', 'Qty Remaining', 'Unit Cost', 'Value at Risk'],
      ...rows.map(r => [r._product, r._sku, r.expiry_date, r._days, r._bucket, r.qty_remaining, r.unit_cost, r._value]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expiry');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Expiry_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const tab = {
    id: 'expiry',
    label: 'Expiring batches',
    kpis: [
      { id: 'expired', label: 'Expired', value: kpiFor('EXPIRED').length, format: 'number' },
      { id: 'd30', label: 'Expiring ≤30d', value: kpiFor('D30').length, format: 'number' },
      { id: 'risk', label: 'Value at risk (≤30d)', value: valueAtRisk, format: 'currency' },
      { id: 'tracked', label: 'Tracked batches', value: rows.length, format: 'number' },
    ],
    columns: [
      {
        key: '_product', label: 'Product', sortable: true, width: 220,
        render: (v, r) => (
          <div>
            <div className="font-semibold text-ink-primary">{v}</div>
            {r._sku && <div className="text-[10px] text-gray-400">{r._sku}</div>}
          </div>
        ),
      },
      { key: 'expiry_date', label: 'Expiry', type: 'date', sortable: true, width: 120 },
      {
        key: '_days', label: 'Days left', sortable: true, width: 110,
        render: (v, r) => (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${r._bucketColor}`}>
            {v < 0 && <AlertTriangle size={10} />}
            {v < 0 ? `${Math.abs(v)}d ago` : `${v}d`}
          </span>
        ),
      },
      { key: 'qty_remaining', label: 'Qty left', align: 'right', sortable: true },
      { key: '_value', label: 'Value at risk', type: 'currency', align: 'right', sortable: true },
      { key: 'received_date', label: 'Received', type: 'date', width: 110 },
    ],
    data: rows,
    loading,
  };

  return (
    <>
      <div className="no-print flex items-center justify-end gap-2 mb-3">
        <button onClick={exportExcel}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black transition-colors">
          <Download size={13} /> Excel
        </button>
      </div>
      <p className="no-print text-[11px] text-gray-400 mb-2 text-right">
        Batches get expiry dates from the Add Purchase form — only dated batches with stock appear here.
      </p>
      <PremiumReportView title="Expiry Tracking" subtitle="Batches expiring within 90 days" tabs={[tab]} />
    </>
  );
};

export default ExpiryReport;
