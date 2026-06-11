import React, { useEffect, useState } from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { goHref } from '../lib/nav';

// Dashboard alert: batches expired or expiring within 30 days.
// Hidden entirely when nothing is at risk (or no dated batches exist).
const ExpiryAlertCard = () => {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    (async () => {
      const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from('product_batches')
        .select('expiry_date, qty_remaining, unit_cost')
        .not('expiry_date', 'is', null)
        .gt('qty_remaining', 0)
        .lte('expiry_date', in30);
      if (!data?.length) return;
      const today = new Date().toISOString().slice(0, 10);
      const expired = data.filter(b => b.expiry_date < today).length;
      const soon = data.length - expired;
      const value = data.reduce((s, b) => s + Number(b.qty_remaining) * Number(b.unit_cost || 0), 0);
      setStats({ expired, soon, value });
    })();
  }, []);

  if (!stats) return null;

  return (
    <button
      onClick={() => goHref('/reports')}
      className="w-full text-left flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-red-50 border border-red-200 hover:bg-red-100/60 transition-colors"
    >
      <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
        <AlertTriangle size={17} className="text-red-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold text-red-700">
          {stats.expired > 0 && `${stats.expired} batch${stats.expired === 1 ? '' : 'es'} expired`}
          {stats.expired > 0 && stats.soon > 0 && ' · '}
          {stats.soon > 0 && `${stats.soon} expiring within 30 days`}
        </div>
        <div className="text-[11px] text-red-500">
          ₹{Math.round(stats.value).toLocaleString('en-IN')} of stock at risk — open Expiry Tracking to act.
        </div>
      </div>
      <ChevronRight size={16} className="text-red-400 shrink-0" />
    </button>
  );
};

export default ExpiryAlertCard;
