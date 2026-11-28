import React, { useCallback, useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import { supabase } from '../../lib/supabase';
import { buttonVariants, Button } from '../../components/ui/button';
import { PanelHead, Stack, SCard, Note } from './parts';
import { reminderLink, rupees0 } from './lib/settingsLib';
import { cn } from '../../lib/utils';

/**
 * Payment reminders (approved settings-10): clients who owe, largest first,
 * each with a WhatsApp link that has the name and amount filled in. Nothing
 * is sent from here; WhatsApp opens and the owner presses send.
 */
export default function RemindersPanel() {
  const { currentTenantId: tenantId, businessProfile } = useTenant();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true); setErr('');
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, phone, outstanding_balance')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gt('outstanding_balance', 0)
      .order('outstanding_balance', { ascending: false });
    if (error) { console.error('[settings] reminders read failed', error); setErr(error.message || String(error)); }
    setRows(data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const total = rows.reduce((s, c) => s + (Number(c.outstanding_balance) || 0), 0);

  return (
    <div>
      <PanelHead title="Payment reminders" sub="Clients who owe money, with a ready WhatsApp reminder." />
      <Stack>
        <SCard title="Outstanding balances" sub="Opens WhatsApp with the client's name and amount filled in. Nothing is sent until you press send in WhatsApp."
          footer={!loading && !err && rows.length > 0
            ? <span className="mr-auto text-[12.5px] text-body tabular-nums">{rows.length.toLocaleString('en-IN')} client{rows.length === 1 ? '' : 's'} owe {rupees0(total)} in all · largest first</span>
            : null}>
          {loading ? (
            <p className="py-4 text-center text-[13px] text-mute">Loading…</p>
          ) : err ? (
            <div className="py-3.5">
              <Note tone="rd" role="alert">Could not load balances: {err}</Note>
              <Button variant="secondary" size="sm" className="mt-2.5" onClick={load}>Try again</Button>
            </div>
          ) : rows.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-mute">No outstanding balances.</p>
          ) : (
            <div className="-mx-5 max-h-[480px] overflow-y-auto px-5">
              {rows.map((c) => (
                <div key={c.id} className="flex items-center gap-3 border-t border-sep py-3 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <b className="block truncate font-tight text-[13.5px] font-semibold text-ink">{c.name}</b>
                    <small className="block text-[12px] text-mute">{c.phone || 'No phone on file'}</small>
                  </div>
                  <span className="shrink-0 font-tight text-[14px] font-semibold tabular-nums text-ink">{rupees0(c.outstanding_balance)}</span>
                  {c.phone ? (
                    <a href={reminderLink(c, businessProfile?.name)} target="_blank" rel="noreferrer"
                      className={cn(buttonVariants({ variant: 'outline', size: 'xs' }), 'w-[132px]')}>
                      <MessageCircle aria-hidden="true" />Send reminder
                    </a>
                  ) : (
                    <span className="w-[132px] text-center text-[12.5px] text-mute">—</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </SCard>
      </Stack>
    </div>
  );
}
