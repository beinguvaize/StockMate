import React, { useMemo } from 'react';
import { isCountableSale } from './reportUtils';
import useReportData from './useReportData';
import PremiumReportView from './PremiumReportView';
import { Smartphone, CheckCircle2, Package } from 'lucide-react';

/**
 * IMEI / Serial Number report — every serialized unit and where it went.
 * A mobile/electronics shop uses this to answer "which IMEI did we sell, to
 * whom, on which bill" (warranty claims, theft/dispute lookups).
 *
 * Reads sale_item_serials, which is the table the SERVER fills: write_sale_lines
 * pulls `imeis` out of the sale payload and inserts a row per unit. It used to
 * read `serial_numbers` and select `serial, sale_id, purchase_id` — none of
 * which are columns on that table (they are serial_number, sold_in_id and
 * purchased_in_id), so this report could only ever have errored. It never
 * surfaced because no product has track_serial enabled and both tables are
 * empty.
 *
 * Every row here is a SOLD unit by definition — sale_item_serials only exists
 * because something was billed. There is no in-stock serial inventory yet; the
 * KPI that claimed to count one was counting a column that did not exist.
 */
const IMEISerialReport = () => {
  const { data: serials, loading } = useReportData({
    table: 'sale_item_serials',
    select: 'id, serial, created_at, sale_items(sale_id, product_id, product_name)',
  });
  const { data: products } = useReportData({ table: 'products', select: 'id, name, sku' });
  const { data: salesRaw } = useReportData({ table: 'sales', select: 'id, "shopId", date, voided_at, status, paymentStatus' });
  // Voided and cancelled sales are not revenue and were being counted here.
  const sales = useMemo(() => (salesRaw || []).filter(isCountableSale), [salesRaw]);
  const { data: clients } = useReportData({ table: 'clients', select: 'id, name, phone' });

  const rows = useMemo(() => {
    const prod = Object.fromEntries((products || []).map(p => [p.id, p]));
    const sale = Object.fromEntries((sales || []).map(s => [s.id, s]));
    const cli = Object.fromEntries((clients || []).map(c => [c.id, c]));
    return (serials || [])
      .filter(s => !s.deleted_at)
      .map(s => {
        // The line carries both the sale and the product; product_name is the
        // snapshot taken at billing, so a renamed product still prints the
        // name the customer's bill showed.
        const line = s.sale_items || {};
        const saleId = line.sale_id || null;
        const sl = saleId ? sale[saleId] : null;
        const buyer = sl?.shopId ? cli[sl.shopId] : null;
        return {
          ...s,
          _product: prod[line.product_id]?.name || line.product_name || line.product_id || '—',
          _saleRef: saleId ? '#' + String(saleId).split('-').pop() : '—',
          _date: sl?.date || (s.created_at ? String(s.created_at).slice(0, 10) : '—'),
          _buyer: buyer ? `${buyer.name}${buyer.phone ? ' · ' + buyer.phone : ''}` : (sl ? 'Walk-in' : '—'),
        };
      })
      .sort((a, b) => String(b._date).localeCompare(String(a._date)));
  }, [serials, products, sales, clients]);


  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const aoa = [
      ['IMEI / Serial Number Report'],
      [],
      ['IMEI / Serial', 'Product', 'Sale', 'Date', 'Buyer'],
      ...rows.map(r => [r.serial, r._product, r._saleRef, r._date, r._buyer]),
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
      { key: 'serial', label: 'IMEI / Serial', sortable: true, width: 200, render: (v) => <span className="tabular-nums text-[11px] font-semibold text-foreground">{v}</span> },
      { key: '_product', label: 'Product', sortable: true, width: 200, render: (v) => <span className="font-semibold text-ink-secondary">{v}</span> },
      { key: '_saleRef', label: 'Sale', width: 100, render: (v) => <span className="tabular-nums text-[11px] text-muted-foreground">{v}</span> },
      { key: '_date', label: 'Date', width: 110, render: (v) => <span className="text-xs font-semibold text-muted-foreground">{v}</span> },
      { key: '_buyer', label: 'Buyer', width: 200, render: (v) => <span className="text-xs font-semibold text-ink-secondary">{v}</span> },
    ],
    kpis: [
      // One honest count. "Sold" and "In Stock" both read a `status` column
      // that does not exist on this table, so they rendered 0 and 0 forever.
      { id: 'total', label: 'Units Sold', value: rows.length, isCount: true, trendDir: 'none', color: 'indigo', chartData: [] },
    ],
  };

  return <PremiumReportView title="IMEI / Serial Numbers" tabs={[tab]} />;
};

export default IMEISerialReport;
