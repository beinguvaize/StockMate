// Stage C — Services vertical: appointments.
import { useState, useEffect, useCallback } from 'react';
import { supabase, restRpc } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { todayISOInAppTZ } from '../lib/utils';

export function useAppointments(tenantId) {
  const { currentUser } = useAuth();
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

  /**
   * Mark a booking done AND record the money, in one server-side transaction.
   *
   * Completing used to write a status and nothing else, so the service, the
   * client and the price had to be re-keyed into the POS by hand — with
   * nothing stopping a booking being billed twice, or never.
   *
   * The RPC calls process_sale itself, so the money path is unchanged and the
   * sale is built from the product rather than from whatever this client
   * believed when the slot was booked. Pressing Complete twice returns the
   * same sale id instead of billing again.
   */
  const complete = async ({ id, paymentMethod = 'CASH', paidAmount = null, locationId = null } = {}) => {
    if (!currentUser?.id) return { error: new Error('You are not signed in.') };
    const { data, error } = await restRpc('complete_appointment', {
      p_appointment_id: id,
      p_user_id: currentUser.id,
      p_payment_method: paymentMethod,
      p_paid_amount: paidAmount,
      p_location_id: locationId,
      p_date: todayISOInAppTZ(),
    });
    // The status is only true once the sale exists, so nothing is painted
    // optimistically here — a failure must not leave COMPLETED on screen.
    if (!error) await fetchAll();
    return { error, saleId: data };
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

  return { appointments, loading, refresh: fetchAll, book, update, complete, setStatus, remove };
}
