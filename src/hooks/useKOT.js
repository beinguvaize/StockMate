// R3 KOT — create kitchen order tickets from a table order.
import { supabase } from '../lib/supabase';

export function useKOT(tenantId) {
  // Next per-tenant ticket number (simple max+1; fine at single-terminal scale).
  const nextTicketNo = async () => {
    const { data } = await supabase
      .from('kot_tickets')
      .select('ticket_no')
      .eq('tenant_id', tenantId)
      .order('ticket_no', { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data?.ticket_no || 0) + 1;
  };

  // items: [{ name, quantity, station, food_type, notes }]
  const createTicket = async ({ tableId = null, tableLabel = null, items }) => {
    const ticket_no = await nextTicketNo();
    const { data, error } = await supabase
      .from('kot_tickets')
      .insert({
        tenant_id: tenantId,
        table_id: tableId,
        table_label: tableLabel,
        ticket_no,
        items,
        status: 'NEW',
      })
      .select()
      .single();
    return { data, error };
  };

  return { createTicket, nextTicketNo };
}

// Group ticket items by kitchen station for the printed slip.
export function groupByStation(items) {
  const groups = {};
  (items || []).forEach((it) => {
    const st = it.station || 'Kitchen';
    (groups[st] ||= []).push(it);
  });
  return groups;
}
