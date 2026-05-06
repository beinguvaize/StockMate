import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { generateRef, todayISOInAppTZ } from '../lib/utils';

// Postgres `numeric` -> JS string over the wire. Coerce on fetch so downstream
// `reduce(sum + x, 0)` doesn't string-concat and `.toFixed` doesn't throw.
const NUMERIC_SALE_COLS = ['totalAmount', 'subtotal', 'tax', 'discount', 'totalCogs', 'paidAmount'];
const NUMERIC_CLIENT_COLS = ['outstanding_balance', 'credit_limit'];
const NUMERIC_INVOICE_COLS = ['amount', 'grand_total', 'taxable_amount', 'tax_total', 'discount_total', 'cgst_amount', 'sgst_amount', 'igst_amount', 'round_off', 'paid_amount'];

const normalizeRow = (row, cols) => {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const col of cols) {
    if (out[col] != null) out[col] = Number(out[col]);
  }
  return out;
};

export const useSales = (tenantId) => {
  const { currentUser } = useAuth();
  const [data, setData] = useState([]);
  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSales = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [
        { data: salesData, error: salesErr },
        { data: clientsData, error: clientsErr },
        { data: invoicesData, error: invoicesErr }
      ] = await Promise.all([
        supabase.from('sales').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false, nullsFirst: false }).limit(500),
        supabase.from('clients').select('*').eq('tenant_id', tenantId).order('name'),
        supabase.from('invoices').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(500)
      ]);

      if (salesErr) throw salesErr;
      if (clientsErr) throw clientsErr;
      if (invoicesErr) throw invoicesErr;

      setData((salesData || []).map(r => normalizeRow(r, NUMERIC_SALE_COLS)));
      setClients((clientsData || []).map(r => normalizeRow(r, NUMERIC_CLIENT_COLS)));
      setInvoices((invoicesData || []).map(r => normalizeRow(r, NUMERIC_INVOICE_COLS)));
    } catch (err) {
      console.error("useSales Fetch Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  // ── Realtime — invoices + sales ───────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`sales-realtime-${tenantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'invoices',
        filter: `tenant_id=eq.${tenantId}`,
      }, fetchSales)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'sales',
        filter: `tenant_id=eq.${tenantId}`,
      }, fetchSales)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, fetchSales]);

  // Deprecated in favor of placeSale() returned below, which matches the
  // actual process_sale RPC signature. Kept to preserve the update/remove
  // flow below — not exported. If future callers need a low-level add,
  // delegate to placeSale.
  const add = async (sale) => {
    if (!currentUser?.id) return { error: new Error('add: not authenticated') };
    const items = (sale.items || []).map(i => ({
      id: i.productId || i.id,
      quantity: i.quantity,
      name: i.name,
      rate: i.price ?? i.rate ?? 0,
    }));
    const { error: rpcError } = await supabase.rpc('process_sale', {
      p_id: sale.id,
      p_shop_id: sale.clientId === 'WALKIN' ? null : sale.clientId,
      p_items: items,
      p_total_amount: sale.totalAmount,
      p_payment_method: sale.paymentMethod || 'CASH',
      p_payment_status: sale.status === 'COMPLETED' ? 'PAID' : (sale.status || 'PENDING'),
      p_date: sale.date || todayISOInAppTZ(),
      p_user_id: currentUser.id,
      p_location_id: sale.locationId || null,
      p_tenant_id: tenantId || null,
    });
    if (rpcError) return { error: rpcError };
    await fetchSales();
    return { success: true };
  };

  const update = async (id, updates) => {
    const { error } = await supabase
      .from('sales')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (!error) await fetchSales();
    return { error };
  };

  const remove = async (id) => {
    const { error } = await supabase
      .from('sales')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (!error) await fetchSales();
    return { error };
  };

  const settlePayment = async (saleId, amount) => {
     // ... logic to update paidAmount and status
     const { error } = await supabase.rpc('settle_sale_payment', {
        p_sale_id: saleId,
        p_amount: amount,
        p_tenant_id: tenantId
     });
     if (!error) await fetchSales();
     return { error };
  };

  return { 
    data, 
    sales: data, 
    clients, 
    loading, 
    error, 
    refetch: fetchSales, 
    // Accepts a single sale object from the POS. Maps client-side sale shape
    // onto public.process_sale's actual RPC signature:
    //   (p_id, p_shop_id, p_items, p_total_amount, p_payment_method,
    //    p_payment_status, p_date, p_user_id, p_location_id).
    // The RPC resolves tenant_id internally from p_user_id -> users table, so
    // tenantId is not passed. Items must carry {id, quantity, name} — the RPC
    // reads those three keys when deducting stock, so productId is remapped
    // to id here. Errors are returned to the caller instead of swallowed.
    placeSale: async (sale) => {
      if (!sale || typeof sale !== 'object') {
        return { error: new Error('placeSale: sale payload required') };
      }
      if (!currentUser?.id) {
        return { error: new Error('placeSale: not authenticated') };
      }

      const id = sale.id || generateRef('SAL');
      const clientId = sale.clientId === 'WALKIN' ? null : (sale.clientId ?? null);
      const items = (sale.items || []).map(i => ({
        id: i.productId || i.id,
        quantity: i.quantity,
        name: i.name,
        rate: i.price ?? i.rate ?? 0,   // preserve unit price for returns/reports
      }));
      const totalAmount = sale.totalAmount ?? 0;
      const paymentStatus = sale.status === 'COMPLETED' ? 'PAID' : (sale.status || 'PENDING');

      const { error: rpcError } = await supabase.rpc('process_sale', {
        p_id: id,
        p_shop_id: clientId,
        p_items: items,
        p_total_amount: totalAmount,
        p_payment_method: sale.paymentMethod || 'CASH',
        p_payment_status: paymentStatus,
        p_date: sale.date || todayISOInAppTZ(),
        p_user_id: currentUser.id,
        p_location_id: sale.locationId || null,
        // Honor impersonation: GLOBAL_ADMIN acting on another tenant must
        // persist sales under that tenant, not the admin's home tenant.
        // RPC rejects the override for non-admins (defence-in-depth).
        p_tenant_id: tenantId || null,
      });

      if (rpcError) {
        console.error('placeSale RPC Error:', rpcError);
        return { error: rpcError };
      }

      await fetchSales();
      return { success: true, id };
    },
    updateSale: update,
    deleteSale: remove,
    settleSale: settlePayment,
    // --- Invoice API ---
    // Invoices table stores GST-billing metadata separate from sales/POS. The
    // Invoices page composes a rich draft (grand_total, cgst/sgst/igst, HSN
    // line items). We whitelist fields that match the public.invoices schema
    // and drop anything else (amount_in_words, notes, paymentMethod, etc.)
    // so the insert doesn't fail on unknown columns.
    invoices,
    createInvoice: async (draft) => {
      if (!tenantId) return { error: new Error('createInvoice: no tenant') };
      const id = draft.id || generateRef('INV');
      const invoiceNumber = draft.invoice_number || `#${id.split('-').pop()}`;
      const row = {
        id,
        tenant_id: tenantId,
        invoice_number: invoiceNumber,
        client_id: draft.client_id ?? draft.clientId ?? null,
        client_name: draft.client_name ?? null,
        sale_id: draft.sale_id ?? null,
        items: draft.items ?? [],
        taxable_amount: draft.taxable_amount ?? draft.subtotal ?? 0,
        discount_total: draft.discount_total ?? 0,
        tax_total: draft.tax_total ?? 0,
        cgst_amount: draft.cgst_amount ?? 0,
        sgst_amount: draft.sgst_amount ?? 0,
        igst_amount: draft.igst_amount ?? 0,
        round_off: draft.round_off ?? 0,
        grand_total: draft.grand_total ?? 0,
        amount: draft.grand_total ?? draft.amount ?? 0,
        paid_amount: draft.paid_amount ?? 0,
        status: draft.status ?? 'ISSUED',
        payment_status: draft.payment_status ?? 'UNPAID',
        invoice_date: draft.invoice_date ?? (draft.date || todayISOInAppTZ()),
        due_date: draft.due_date ?? draft.dueDate ?? null,
        date: draft.date ?? new Date().toISOString(),
      };
      const { data: inserted, error: insErr } = await supabase
        .from('invoices')
        .insert([row])
        .select()
        .single();
      if (insErr) {
        console.error('createInvoice error:', insErr);
        return { error: insErr };
      }
      setInvoices(prev => [inserted, ...prev]);
      return { success: true, data: inserted };
    },
    processSalesReturn: async (ret) => {
      if (!tenantId) return { error: new Error('processSalesReturn: no tenant') };
      const { error: rpcErr } = await supabase.rpc('process_sales_return', {
        p_id:           ret.id,
        p_tenant_id:    tenantId,
        p_sale_id:      ret.sale_id || null,
        p_invoice_id:   ret.invoice_id || null,
        p_client_id:    ret.client_id || null,
        p_client_name:  ret.client_name || null,
        p_items:        ret.items,
        p_total_amount: ret.total_amount,
        p_reason:       ret.reason || null,
        p_date:         ret.date,
      });
      if (rpcErr) return { error: rpcErr };
      await fetchSales();
      return { success: true };
    },
    markInvoicePaid: async (id) => {
      if (!id) return { error: new Error('markInvoicePaid: id required') };
      // Read grand_total first so paid_amount stays in sync with total.
      const { data: inv, error: readErr } = await supabase
        .from('invoices')
        .select('grand_total')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();
      if (readErr) return { error: readErr };
      const { error: updErr } = await supabase
        .from('invoices')
        .update({
          status: 'PAID',
          payment_status: 'PAID',
          paid_amount: inv?.grand_total ?? 0,
        })
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (updErr) return { error: updErr };
      setInvoices(prev => prev.map(i => i.id === id
        ? { ...i, status: 'PAID', payment_status: 'PAID', paid_amount: i.grand_total }
        : i));
      return { success: true };
    },
  };
};
