// Estimates / Quotations — non-binding quotes that can convert into a sale.
// Mirrors invoice fields but never touches stock or payments. Status flow:
// DRAFT → SENT → ACCEPTED → CONVERTED (or REJECTED/EXPIRED).
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeNumericRows } from '../lib/numeric';

const NUMERIC = ['taxable_amount','tax_total','cgst_amount','sgst_amount','igst_amount','discount_total','round_off','grand_total'];

export function useEstimates(tenantId) {
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('estimates').select('*')
      .eq('tenant_id', tenantId).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(300);
    if (!error) setEstimates(normalizeNumericRows(data || [], NUMERIC));
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const nextNumber = () => {
    const yr = new Date().getFullYear();
    const n = estimates.length + 1;
    return `EST-${yr}-${String(n).padStart(4, '0')}`;
  };

  const create = async (est) => {
    const id = `EST-${Date.now().toString(36).toUpperCase()}`;
    const row = {
      id, tenant_id: tenantId,
      estimate_number: est.estimate_number || nextNumber(),
      estimate_date: est.estimate_date || new Date().toISOString().slice(0, 10),
      valid_until: est.valid_until || null,
      client_id: est.client_id || null,
      client_name: est.client_name || null,
      client_gstin: est.client_gstin || null,
      client_address: est.client_address || null,
      client_phone: est.client_phone || null,
      place_of_supply: est.place_of_supply || null,
      is_interstate: !!est.is_interstate,
      items: est.items || [],
      taxable_amount: est.taxable_amount || 0,
      tax_total: est.tax_total || 0,
      cgst_amount: est.cgst_amount || 0,
      sgst_amount: est.sgst_amount || 0,
      igst_amount: est.igst_amount || 0,
      discount_total: est.discount_total || 0,
      round_off: est.round_off || 0,
      grand_total: est.grand_total || 0,
      status: est.status || 'DRAFT',
      notes: est.notes || null,
    };
    const { error } = await supabase.from('estimates').insert(row);
    if (!error) await fetchAll();
    return { error, id };
  };

  const setStatus = async (id, status, extra = {}) => {
    const { error } = await supabase.from('estimates')
      .update({ status, updated_at: new Date().toISOString(), ...extra })
      .eq('id', id).eq('tenant_id', tenantId);
    if (!error) await fetchAll();
    return { error };
  };

  const remove = async (id) => {
    const { error } = await supabase.from('estimates')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id).eq('tenant_id', tenantId);
    if (!error) await fetchAll();
    return { error };
  };

  return { estimates, loading, refetch: fetchAll, nextNumber, create, setStatus, remove };
}
