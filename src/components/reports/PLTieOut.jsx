import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';
import { formatCurrency } from '../../lib/utils';

/**
 * Reconciliation footer — compares a profit report's own totals against the
 * authoritative P&L RPC (get_pl_ranged) for the same period. A report that
 * silently disagrees with the books is how the ₹66k COGS shortfall stayed
 * invisible for weeks; with this, every profit report audits itself on load.
 *
 * revenue/cogs: the report's computed totals. note: expected benign causes
 * of small differences (e.g. bill-level discounts on SKU-level reports).
 */
const PLTieOut = ({ from, to, revenue, cogs = null, note }) => {
  const { currentTenantId } = useTenant();
  const [pl, setPl] = useState(null);

  useEffect(() => {
    if (!currentTenantId || !from || !to) return undefined;
    let dead = false;
    supabase
      .rpc('get_pl_ranged', { p_tenant_id: currentTenantId, p_from: from, p_to: to })
      .then(({ data }) => { if (!dead) setPl(Array.isArray(data) ? data[0] : data); })
      .catch(() => {});
    return () => { dead = true; };
  }, [currentTenantId, from, to]);

  if (!pl) return null;
  const dRev  = Number(revenue || 0) - Number(pl.revenue_net || 0);
  const dCogs = cogs != null ? Number(cogs) - Number(pl.cogs || 0) : 0;
  const ok = Math.abs(dRev) < 1 && Math.abs(dCogs) < 1;

  return (
    <div className={`mt-4 rounded-xl border px-4 py-2.5 text-[11px] font-bold flex flex-wrap items-center gap-x-4 gap-y-1 ${
      ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
         : 'border-accent-signature/25 bg-accent-signature/5 text-accent-signature-hover'}`}>
      <span>{ok ? '✓ Ties to P&L for this period' : '△ Differs from P&L'}</span>
      {!ok && Math.abs(dRev) >= 1 && (
        <span>revenue {dRev > 0 ? '+' : '−'}{formatCurrency(Math.abs(dRev))}</span>
      )}
      {!ok && cogs != null && Math.abs(dCogs) >= 1 && (
        <span>COGS {dCogs > 0 ? '+' : '−'}{formatCurrency(Math.abs(dCogs))}</span>
      )}
      {!ok && note && <span className="font-medium opacity-80">{note}</span>}
    </div>
  );
};

export default PLTieOut;
