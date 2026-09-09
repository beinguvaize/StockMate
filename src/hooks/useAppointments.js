// Stage C — Services vertical: appointments.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useAppointments(tenantId) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('appointments')
      .select('*').is('deleted_at', null)
      .eq('tenant_id', tenantId)
      .order('start_at', { ascending: true });
    if (!error) setAppointments(data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const book = async (appt) => {
    const { error } = await supabase.from('appointments').insert({
      tenant_id: tenantId,
      client_id: appt.clientId || null,
      client_name: appt.clientName || null,
      service_id: appt.serviceId || null,
      service_name: appt.serviceName || null,
      staff_id: appt.staffId || null,
      start_at: appt.startAt,
      duration_min: Number(appt.durationMin) || 30,
      price: Number(appt.price) || 0,
      notes: appt.notes || null,
      status: 'BOOKED',
    });
    if (!error) await fetchAll();
    return { error };
  };

  /**
   * Edit a booking in place — reschedule, change the service, reassign staff.
   *
   * The page had no edit at all: setStatus took an `extra` object that nothing
   * ever passed, which is dead code sitting exactly where this belongs.
   *
   * Only the columns a person can actually change are accepted. Spreading a
   * whole row back would carry tenant_id and sale_id along with it, and the
   * update policy now has a WITH CHECK that would reject a moved tenant_id
   * rather than silently obey it.
   */
  const update = async (id, patch = {}) => {
    const allowed = [
      'client_id', 'client_name', 'service_id', 'service_name',
      'staff_id', 'start_at', 'duration_min', 'price', 'notes',
    ];
    const row = {};
    for (const k of allowed) if (k in patch) row[k] = patch[k];
    if (Object.keys(row).length === 0) return { error: null };

    const { error } = await supabase.from('appointments')
      .update(row).eq('id', id).eq('tenant_id', tenantId);
    // Refetch on success only. On failure the caller surfaces the real reason
    // and the list still shows what the database actually holds.
    if (!error) await fetchAll();
    return { error };
  };

  const setStatus = async (id, status) => {
    // Optimistic, but reverted on failure. It used to paint the new status and
    // leave it there when the write failed, so a booking could read COMPLETED
    // on screen while the database still said BOOKED.
    const before = appointments;
    setAppointments(prev => prev.map(a => (a.id === id ? { ...a, status } : a)));
    const { error } = await supabase.from('appointments')
      .update({ status }).eq('id', id).eq('tenant_id', tenantId);
    if (error) setAppointments(before);
    else await fetchAll();
    return { error };
  };

  const remove = async (id) => {
    const { error } = await supabase.from('appointments').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', tenantId);
    if (!error) await fetchAll();
    return { error };
  };

  return { appointments, loading, refresh: fetchAll, book, update, setStatus, remove };
}
