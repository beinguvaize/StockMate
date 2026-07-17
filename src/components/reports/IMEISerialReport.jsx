import React, { useMemo } from 'react';
import useReportData from './useReportData';
import PremiumReportView from './PremiumReportView';
import { Smartphone, CheckCircle2, Package } from 'lucide-react';

/**
 * IMEI / Serial Number report — every serialized unit and where it went.
 * A mobile/electronics shop uses this to answer "which IMEI did we sell, to
 * whom, on which bill" (warranty claims, theft/dispute lookups).
 */
const IMEISerialReport = () => {
  const { data: serials, loading } = useReportData({
    table: 'serial_numbers',
    select: 'id, product_id, serial, status, sale_id, purchase_id, created_at',
  });
  const { data: products } = useReportData({ table: 'products', select: 'id, name, sku' });
  const { data: sales } = useReportData({ table: 'sales', select: 'id, "shopId", date' });
  const { data: clients } = useReportData({ table: 'clients', select: 'id, name, phone' });

  const rows = useMemo(() => {
    const prod = Object.fromEntries((products || []).map(p => [p.id, p]));
    const sale = Object.fromEntries((sales || []).map(s => [s.id, s]));
    const cli = Object.fromEntries((clients || []).map(c => [c.id, c]));
    return (serials || [])
      .filter(s => !s.deleted_at)
      .map(s => {
        const sl = s.sale_id ? sale[s.sale_id] : null;
        const buyer = sl?.shopId ? cli[sl.shopId] : null;
        return {
          ...s,
          _product: prod[s.product_id]?.name || s.product_id,
          _saleRef: s.sale_id ? '#' + String(s.sale_id).split('-').pop() : '—',
          _date: sl?.date || (s.created_at ? String(s.created_at).slice(0, 10) : '—'),
          _buyer: buyer ? `${buyer.name}${buyer.phone ? ' · ' + buyer.phone : ''}` : (sl ? 'Walk-in' : '—'),
        };
      })
      .sort((a, b) => String(b._date).localeCompare(String(a._date)));
  }, [serials, products, sales, clients]);

  const sold = rows.filter(r => (r.status || '').toUpperCase() === 'SOLD').length;
  const inStock = rows.filter(r => (r.status || '').toUpperCase() === 'IN_STOCK').length;

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const aoa = [
      ['IMEI / Serial Number Report'],
      [],
      ['IMEI / Serial', 'Product', 'Status', 'Sale', 'Date', 'Buyer'],
      ...rows.map(r => [r.serial, r._product, r.status, r._saleRef, r._date, r._buyer]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'IMEI');
    XLSX.writeFile(wb, 'imei-serial-report.xlsx');
  };

  const tab = {
    id: 'IMEI_SERIAL',
    label: 'IMEI / Serial',
    icon: <Smartphone size={18} />,
    data: rows,
    loading,
    onExport: exportExcel,
    columns: [
      { key: 'serial', label: 'IMEI / Serial', sortable: true, width: 200, render: (v) => <span className="font-mono text-[11px] font-bold text-ink-primary">{v}</span> },
      { key: '_product', label: 'Product', sortable: true, width: 200, render: (v) => <span className="font-semibold text-gray-700">{v}</span> },
      { key: 'status', label: 'Status', width: 110, render: (v) => {
        const s = (v || '').toUpperCase();
        const sold = s === 'SOLD';
        return <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-black uppercase ${sold ? 'bg-emerald-50 text-emerald-600' : 'bg-accent-signature/10 text-accent-signature'}`}>{v || '—'}</span>;
      } },
      { key: '_saleRef', label: 'Sale', width: 100, render: (v) => <span className="font-mono text-[11px] text-gray-500">{v}</span> },
      { key: '_date', label: 'Date', width: 110, render: (v) => <span className="text-xs font-semibold text-gray-500">{v}</span> },
      { key: '_buyer', label: 'Buyer', width: 200, render: (v) => <span className="text-xs font-semibold text-gray-700">{v}</span> },
    ],
    kpis: [
      { id: 'total', label: 'Total Units', value: rows.length, isCount: true, trendDir: 'none', color: 'indigo', chartData: [] },
      { id: 'sold', label: 'Sold', value: sold, isCount: true, trendDir: 'none', color: 'emerald', chartData: [] },
      { id: 'stock', label: 'In Stock', value: inStock, isCount: true, trendDir: 'none', color: 'amber', chartData: [] },
    ],
  };

  return <PremiumReportView title="IMEI / Serial Numbers" tabs={[tab]} />;
};

export default IMEISerialReport;
