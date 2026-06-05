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
      .select('*')
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

  const setStatus = async (id, status, extra = {}) => {
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status, ...extra } : a));
    const { error } = await supabase.from('appointments')
      .update({ status, ...extra }).eq('id', id).eq('tenant_id', tenantId);
    if (!error) await fetchAll();
    return { error };
  };

  const remove = async (id) => {
    const { error } = await supabase.from('appointments').delete().eq('id', id).eq('tenant_id', tenantId);
    if (!error) await fetchAll();
    return { error };
  };

  return { appointments, loading, refresh: fetchAll, book, setStatus, remove };
}
