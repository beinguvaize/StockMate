// R3 KOT — create kitchen order tickets from a table order.
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

// KDS live feed — active tickets (not yet served), polled. Returns tickets +
// updateStatus. NEW → PREPARING → READY → SERVED.
export function useKDS(tenantId, { pollMs = 8000 } = {}) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const timer = useRef(null);

  const fetchActive = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('kot_tickets')
      .select('*')
      .eq('tenant_id', tenantId)
      .neq('status', 'SERVED')
      .order('created_at', { ascending: true });
    if (!error) setTickets(data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    fetchActive();
    timer.current = setInterval(fetchActive, pollMs);
    return () => clearInterval(timer.current);
  }, [fetchActive, pollMs]);

  const updateStatus = async (id, status) => {
    // optimistic
    setTickets(prev => status === 'SERVED'
      ? prev.filter(t => t.id !== id)
      : prev.map(t => t.id === id ? { ...t, status } : t));
    await supabase.from('kot_tickets').update({ status }).eq('id', id).eq('tenant_id', tenantId);
    fetchActive();
  };

  return { tickets, loading, refresh: fetchActive, updateStatus };
}

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
