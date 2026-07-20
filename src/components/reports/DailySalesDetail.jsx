import React, { useState, useMemo } from 'react';
import { Calendar, ChevronDown, Truck } from 'lucide-react';
import { SectionHead } from './ReportBits';
import { formatCurrency } from '../../lib/utils';

/**
 * Per-day sales breakdown (products + clients), used by the standalone Daily
 * Sales report. It used to live inside BusinessReport and be imported from
 * there, which meant opening Daily Sales pulled the entire Business Report
 * module — a ~1,000-line component with nine queries — into the bundle.
 */
/* ─── Detailed daily breakdown ────────────────────────────────────────────── */
const PAY_BADGE = { CASH: 'bg-emerald-50 text-emerald-700', UPI: 'bg-accent-signature/10 text-accent-signature-hover', CREDIT: 'bg-accent-signature/10 text-accent-signature-hover', BANK: 'bg-muted text-muted-foreground' };

const APP_BADGE = {
  WEB:     'bg-muted text-muted-foreground border-border',
  DESKTOP: 'bg-muted text-muted-foreground border-border',
  MOBILE:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  VAN:     'bg-accent-signature/10 text-accent-signature-hover border-accent-signature/25',
};

const DailySalesDetail = ({ sales, clients, vehicles = [], users = [], loading }) => {
  const [openDates, setOpenDates] = useState({});

  const byDate = useMemo(() => {
    const map = {};
    sales.forEach(s => {
      const d = s.date || 'Unknown';
      if (!map[d]) map[d] = { date: d, sales: [], total: 0, orders: 0 };
      map[d].sales.push(s);
      map[d].total  += Number(s.totalAmount || 0);
      map[d].orders += 1;
    });
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [sales]);

  const toggle = (date) => setOpenDates(prev => ({ ...prev, [date]: !prev[date] }));

  if (loading) return (
    <div className="bg-card rounded-[10px] border border-border/60 shadow-sm p-6 space-y-3">
      {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-canvas animate-pulse rounded-xl" />)}
    </div>
  );
  if (byDate.length === 0) return null;

  return (
    <div className="bg-card rounded-[10px] border border-border/60 shadow-sm overflow-hidden">
      <div className="px-6 pt-6 pb-4 border-b border-border/60 flex items-center justify-between">
        <SectionHead title="Daily Sales Detail" sub="product & client breakdown" />
        <span className="text-[10px] font-semibold text-muted-foreground bg-canvas px-2 py-1 rounded-full">
          {byDate.length} days
        </span>
      </div>

      {byDate.map(day => {
        const isOpen = openDates[day.date] ?? (byDate.length === 1);
        return (
          <div key={day.date} className="border-b border-border/60 last:border-0">
            {/* Day header — click to expand */}
            <button
              className="w-full flex items-center gap-4 px-6 py-4 hover:bg-canvas/40 transition-colors text-left"
              onClick={() => toggle(day.date)}
            >
              <div className="w-9 h-9 rounded-xl bg-accent-signature/10 flex items-center justify-center shrink-0">
                <Calendar size={14} className="text-accent-signature" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="tabular-nums text-sm font-semibold text-foreground">{day.date}</div>
                <div className="text-[10px] text-muted-foreground font-medium mt-0.5">
                  {day.orders} {day.orders === 1 ? 'sale' : 'sales'}
                </div>
              </div>
              <div className="tabular-nums text-base font-semibold text-foreground tabular-nums shrink-0">
                {formatCurrency(day.total)}
              </div>
              <ChevronDown
                size={14}
                className={`text-muted-foreground shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Expanded sales for this day */}
            {isOpen && (
              <div className="bg-canvas/30 border-t border-border/60">
                {/* Column labels */}
                <div className="grid grid-cols-[1fr_180px_56px_72px_72px_110px_84px_120px] gap-3 px-8 py-2 border-b border-border/60 items-center">
                  {[['Client','justify-self-start'],['Products','justify-self-start'],['Items','justify-self-center'],['Source','justify-self-center'],['App','justify-self-center'],['By','justify-self-start'],['Method','justify-self-center'],['Amount','justify-self-end']].map(([h,a]) => (
                    <span key={h} className={`text-[9px] font-semibold text-muted-foreground uppercase tracking-widest ${a}`}>{h}</span>
                  ))}
                </div>

                {day.sales.map((s, si) => {
                  const cid      = s.customerInfo?.id || s.shopId || null;
                  const cname    = (cid && clients.find(c => c.id === cid)?.name) || s.customerInfo?.name || 'Walk-in';
                  const items    = Array.isArray(s.items) ? s.items : [];
                  const itemQty  = items.reduce((acc, it) => acc + Number(it.quantity || 0), 0);
                  const prodList = items.map(it => `${it.name}${it.quantity > 1 ? ` ×${it.quantity}` : ''}`).join(', ');
                  const method   = (s.paymentMethod || 'CASH').toUpperCase();
                  const badgeCls = PAY_BADGE[method] || 'bg-gray-100 text-gray-600';
                  const isVan    = !!(s.routeId || s.vehicleId) || s.source_app === 'VAN';
                  const vehicle  = isVan && s.vehicleId ? vehicles.find(v => v.id === s.vehicleId) : null;
                  const vanLabel = vehicle ? (vehicle.plateNumber || vehicle.name || 'VAN') : 'VAN';
                  const app      = (s.source_app || 'WEB').toUpperCase();
                  const appCls   = APP_BADGE[app] || APP_BADGE.WEB;
                  const userId   = s.cashier_id || s.bookedBy || s.salesRepId;
                  const user     = userId ? users.find(u => u.id === userId) : null;
                  const byLabel  = user?.name || (user?.email ? user.email.split('@')[0] : '—');

                  return (
                    <div key={s.id || si}
                      className="grid grid-cols-[1fr_180px_56px_72px_72px_110px_84px_120px] gap-3 px-8 py-3 border-b border-border/60 last:border-0 hover:bg-card/60 transition-colors items-center">

                      {/* Client */}
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-accent-signature/10 flex items-center justify-center shrink-0">
                          <span className="text-[9px] font-semibold text-accent-signature">{(cname[0]||'?').toUpperCase()}</span>
                        </div>
                        <span className="text-xs font-semibold text-foreground truncate">{cname}</span>
                      </div>

                      {/* Products */}
                      <div className="min-w-0">
                        {items.length === 0
                          ? <span className="text-xs text-muted-foreground italic">—</span>
                          : items.map((it, idx) => (
                            <div key={idx} className="text-[11px] font-medium text-ink-secondary leading-snug truncate">
                              {it.name}
                              <span className="text-muted-foreground ml-1">×{it.quantity} @ {formatCurrency(it.rate)}</span>
                            </div>
                          ))
                        }
                      </div>

                      {/* Total items */}
                      <span className="tabular-nums text-xs font-semibold text-foreground tabular-nums justify-self-center">{itemQty}</span>

                      {/* Source badge */}
                      {isVan
                        ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold w-fit bg-accent-signature/10 text-accent-signature-hover border border-accent-signature/25 justify-self-center">
                            <Truck size={9} /> {vanLabel}
                          </span>
                        )
                        : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold w-fit bg-muted text-muted-foreground border border-border justify-self-center">
                            POS
                          </span>
                        )
                      }

                      {/* App / channel */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold w-fit border justify-self-center ${appCls}`}>
                        {app}
                      </span>

                      {/* Sold by */}
                      <span className="text-[11px] font-semibold text-ink-secondary truncate justify-self-start" title={user?.email || ''}>
                        {byLabel}
                      </span>

                      {/* Payment method */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold w-fit justify-self-center ${badgeCls}`}>
                        {method}
                      </span>

                      {/* Amount */}
                      <span className="tabular-nums text-xs font-semibold text-foreground tabular-nums justify-self-end">{formatCurrency(s.totalAmount)}</span>
                    </div>
                  );
                })}

                {/* Day subtotal */}
                <div className="flex justify-end items-center px-8 py-2.5 border-t border-border/60 bg-card/40">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mr-4">Day Total</span>
                  <span className="tabular-nums text-sm font-semibold text-foreground tabular-nums">{formatCurrency(day.total)}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default DailySalesDetail;
export { DailySalesDetail };
