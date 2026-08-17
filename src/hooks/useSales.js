import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, restRpc, restUpdate, restInsert } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { readCacheThenRevalidate, queueMutation, isOfflineError, decrementCachedStock, isElectron, upsertCachedRow } from '../lib/offline/hookAdapter';
import { generateRef, todayISOInAppTZ } from '../lib/utils';
import useRefetchOnFocus from './useRefetchOnFocus';
import { getPlanLimits } from '../lib/tenancy';
import { monthBounds } from '../lib/reportPeriods';

// Postgres `numeric` -> JS string over the wire. Coerce on fetch so downstream
// `reduce(sum + x, 0)` doesn't string-concat and `.toFixed` doesn't throw.
const NUMERIC_SALE_COLS = ['totalAmount', 'subtotal', 'tax', 'discount', 'totalCogs', 'paidAmount'];

// Every sales column EXCEPT the items JSONB. items is ~65% of a sale row's
// bytes (~460 B/sale), and screens that only show totals/status/dates — the
// dashboard, revenue trend, clients list — never read it. A lean select drops
// it, cutting the sales payload ~3x. Web only: desktop keeps the full fetch so
// the shared offline cache under the 'sales' key never loses items for the POS
// list, which does need them (edit, return, reprint).
const SALE_LEAN_COLS = '"id", "shopId", "customerInfo", "paymentMethod", "paymentStatus", "routeId", "subtotal", "discount", "tax", "totalAmount", "totalCogs", "date", "salesRepId", "bookedBy", "status", "scheduledDate", "deliveredBy", "note", "paidAmount", "lastPaymentDate", "created_at", "payment_type", "is_seed", "vehicleid", "vehicleId", "tenant_id", "delivery_method", "fulfillment_status", "sale_type", "route_id", "invoice_id", "place_of_supply", "billing_address", "shipping_address", "terms_id", "eway_bill_number", "transport_name", "vehicle_number", "lr_number", "tds_amount", "tcs_amount", "round_off", "is_pos", "cashier_id", "updated_at", "deleted_at", "source_app", "voided_at", "void_reason", "location_id", "amount_received"';
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

export const useSales = (tenantId, { plan = 'STARTER', lean = false } = {}) => {
  const { currentUser } = useAuth();
  const [data, setData] = useState([]);
  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [salesReturns, setSalesReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const tabId = useRef(Math.random().toString(36).slice(2, 8));
  const initialLoadDone = useRef(false);
  const fetchRef = useRef(null);

  const fetchSales = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    if (!initialLoadDone.current) setLoading(true);
    setError(null);
    try {
      const [sales, clients, invoicesRows, returns] = await Promise.all([
        readCacheThenRevalidate('sales',
          // Lean (items-less) only on web — desktop keeps '*' so the shared
          // 'sales' cache stays complete for the POS list that needs items.
          () => supabase.from('sales').select(lean && !isElectron() ? SALE_LEAN_COLS : '*').is('deleted_at', null).eq('tenant_id', tenantId).order('created_at', { ascending: false, nullsFirst: false }).limit(500),
          (fresh) => setData(fresh.map(r => normalizeRow(r, NUMERIC_SALE_COLS))),
        ),
        readCacheThenRevalidate('clients',
          () => supabase.from('clients').select('*').is('deleted_at', null).eq('tenant_id', tenantId).order('name'),
          (fresh) => setClients(fresh.map(r => normalizeRow(r, NUMERIC_CLIENT_COLS))),
        ),
        readCacheThenRevalidate('invoices',
          () => supabase.from('invoices').select('*').eq('tenant_id', tenantId).is('deleted_at', null).order('created_at', { ascending: false }).limit(500),
          (fresh) => setInvoices(fresh.map(r => normalizeRow(r, NUMERIC_INVOICE_COLS))),
        ),
        readCacheThenRevalidate('sales_returns',
          () => supabase.from('sales_returns').select('*').is('deleted_at', null).eq('tenant_id', tenantId).order('date', { ascending: false }).limit(500),
          (fresh) => setSalesReturns(fresh),
        ),
      ]);

      setData(sales.map(r => normalizeRow(r, NUMERIC_SALE_COLS)));
      setClients(clients.map(r => normalizeRow(r, NUMERIC_CLIENT_COLS)));
      setInvoices(invoicesRows.map(r => normalizeRow(r, NUMERIC_INVOICE_COLS)));
      setSalesReturns(returns);
    } catch (err) {
      console.error("useSales Fetch Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
      initialLoadDone.current = true;
    }
  }, [tenantId, lean]);

  fetchRef.current = fetchSales;

  useEffect(() => { initialLoadDone.current = false; fetchRef.current?.(); }, [tenantId]);

  // Re-fetch when tab becomes visible after idle (handles stale data after lock-screen / sleep)
  useRefetchOnFocus(fetchSales);

  // ── Realtime — invoices + sales ───────────────────────────────────────
  // Desktop is offline-first: no live websocket — fresh data arrives via
  // the sync engine's pullDeltas (auto every 10 min / Sync Now / reconnect).
  useEffect(() => {
    if (!tenantId || isElectron()) return;
    const channel = supabase
      .channel(`sales-realtime-${tenantId}-${tabId.current}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'invoices',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => fetchRef.current?.())
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'sales',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => fetchRef.current?.())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId]);

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
    const { error: rpcError } = await restRpc('process_sale', {
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
    const { error } = await restUpdate('sales', updates, { id, tenant_id: tenantId });
    if (!error) await fetchSales();
    return { error };
  };

  // Delete a sale through delete_sale, which reverses the stock (FIFO batches,
  // inventory, movement log), reverses the client's outstanding, and cancels the
  // linked invoice — then hides the sale. A bare soft-delete used to leave stock
  // missing and the invoice showing as a phantom bill.
  const remove = async (id) => {
    const { error } = await restRpc('delete_sale', {
      p_id: id, p_tenant_id: tenantId, p_user_id: currentUser?.id || null,
    });
    if (!error) await fetchSales();
    return { error };
  };

  const settlePayment = async (saleId, amount) => {
     // ... logic to update paidAmount and status
     const { error } = await restRpc('settle_sale_payment', {
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
        // Snapshot tax rate at sale-time so invoices keep correct GST
        // even if the product master is later edited. Default 0 if the
        // caller didn't include it (walk-in non-GST sale).
        taxRate: Number(i.taxRate ?? i.tax_rate ?? 0),
        // Compensation cess rate (ad-valorem %) snapshotted per line for
        // cess goods (autos, aerated drinks, tobacco). 0 for everything else.
        cess: Number(i.cess ?? i.cess_rate ?? 0),
        hsn: i.hsn || i.hsn_code || null,
      }));
      const totalAmount = sale.totalAmount ?? 0;
      const paymentStatus = sale.status === 'COMPLETED' ? 'PAID'
                          : sale.status === 'PARTIAL'   ? 'PARTIAL'
                          : (sale.status || 'PENDING');
      // Caller may pass an explicit paidAmount; let the RPC's
      // p_paid_amount path recompute status + push outstanding balance.
      const paidAmount = typeof sale.paidAmount === 'number' ? sale.paidAmount : null;

      const sourceApp =
        typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)
          ? 'DESKTOP'
          : 'WEB';

      const rpcParams = {
        p_id: id,
        p_shop_id: clientId,
        p_items: items,
        p_total_amount: totalAmount,
        p_discount: Number(sale.discount) || 0,
        p_payment_method: sale.paymentMethod || 'CASH',
        p_payment_status: paymentStatus,
        p_date: sale.date || todayISOInAppTZ(),
        p_user_id: currentUser.id,
        p_location_id: sale.locationId || null,
        p_route_id: sale.routeId || null,
        p_tenant_id: tenantId || null,
        p_delivery_method: sale.fulfillmentType === 'DELIVERY' ? 'DELIVERY' : 'PICKUP',
        p_source_app: sourceApp,
        p_paid_amount: paidAmount,   // null when not set — RPC recomputes from payment_status
      };

      // Desktop is offline-first: never wait for the network at the counter.
      // Queue the RPC + decrement cached stock immediately; the sync engine
      // pushes it on the next auto/manual sync.
      if (isElectron()) {
        try {
          await queueMutation({ table: 'process_sale', type: 'rpc', payload: rpcParams });
          await decrementCachedStock(items);
          const discountAmt = Number(sale.discount) || 0;
          if (discountAmt > 0) {
            await queueMutation({ table: 'sales', type: 'update', payload: { id, discount: discountAmt } });
          }
          // Optimistic sale row so lists/DayBook reflect it before sync.
          const optimisticPaid = paidAmount ?? (paymentStatus === 'PAID' ? totalAmount : 0);
          await upsertCachedRow('sales', {
            id, tenant_id: tenantId, shopId: clientId, items,
            totalAmount, discount: Number(sale.discount) || 0,
            paymentMethod: sale.paymentMethod || 'CASH', paymentStatus,
            paidAmount: optimisticPaid,
            date: sale.date || todayISOInAppTZ(), created_at: new Date().toISOString(),
          });
          // Credit/partial sale: bump the client's outstanding in state AND the
          // IDB cache so the balance survives reloads/offline reads before sync.
          const unpaid = Math.max(0, Number(totalAmount) - Number(optimisticPaid));
          if (clientId && unpaid > 0) {
            const curClient = clients.find(c => c.id === clientId);
            if (curClient) {
              const updated = { ...curClient, outstanding_balance: Number(curClient.outstanding_balance || 0) + unpaid };
              await upsertCachedRow('clients', updated);
              setClients(prev => prev.map(c => c.id === clientId ? updated : c));
            }
          }
          fetchSales();
          return { success: true, id, queued: true };
        } catch (qErr) {
          console.error('placeSale local-first queue error:', qErr);
          // fall through to the online path as a last resort
        }
      }

      const { error: rpcError } = await restRpc('process_sale', rpcParams);

      if (rpcError) {
        // Web safety net: on a network error, queue the sale so the cashier
        // doesn't lose the transaction (no-op on web where outbox is disabled).
        if (isOfflineError(rpcError)) {
          try {
            await queueMutation({ table: 'process_sale', type: 'rpc', payload: rpcParams });
            await decrementCachedStock(items);
            return { success: true, id, queued: true };
          } catch (qErr) {
            console.error('placeSale queue error:', qErr);
          }
        }
        console.error('placeSale RPC Error:', rpcError);
        return { error: rpcError };
      }

      // source_app is now persisted by process_sale itself — no follow-up update needed.
      // Discount is stored separately (process_sale takes the already-net total);
      // a tiny follow-up UPDATE records the discount amount for reporting/receipts.
      const discountAmt = Number(sale.discount) || 0;
      if (discountAmt > 0) {
        try { await restUpdate('sales', { discount: discountAmt }, { id }); }
        catch (e) { console.warn('discount persist skipped:', e?.message); }
      }
      fetchSales(); // fire-and-forget — don't block the checkout button reset
      return { success: true, id };
    },
    dispatchSale: async (saleId) => {
      if (!currentUser?.id) return { error: new Error('Not authenticated') };
      const { error } = await restRpc('dispatch_sale', {
        p_sale_id: saleId,
        p_user_id: currentUser.id,
      });
      if (error) return { error };
      await fetchSales();
      return { success: true };
    },
    updateSale: update,
    salesReturns,
    // Edit a posted sale with full stock/ledger re-sync. Maps the POS sale
    // shape onto edit_sale, which reverses the original sale's stock + FEFO
    // batch + auto-invoice effects then re-applies the new items atomically.
    editSale: async (id, sale) => {
      if (!id) return { error: new Error('editSale: id required') };
      if (!currentUser?.id) return { error: new Error('editSale: not authenticated') };
      const clientId = sale.clientId === 'WALKIN' ? null : (sale.clientId ?? null);
      const items = (sale.items || []).map(i => ({
        id: i.productId || i.id,
        quantity: i.quantity,
        name: i.name,
        rate: i.price ?? i.rate ?? 0,
        taxRate: Number(i.taxRate ?? i.tax_rate ?? 0),
        // Compensation cess rate (ad-valorem %) snapshotted per line for
        // cess goods (autos, aerated drinks, tobacco). 0 for everything else.
        cess: Number(i.cess ?? i.cess_rate ?? 0),
        hsn: i.hsn || i.hsn_code || null,
      }));
      const paymentStatus = sale.status === 'COMPLETED' ? 'PAID'
                          : sale.status === 'PARTIAL'   ? 'PARTIAL'
                          : (sale.status || 'PAID');
      const paidAmount = typeof sale.paidAmount === 'number' ? sale.paidAmount : null;
      const editParams = {
        p_id:             id,
        p_items:          items,
        p_total_amount:   sale.totalAmount ?? 0,
        p_payment_method: sale.paymentMethod || 'CASH',
        p_payment_status: paymentStatus,
        p_paid_amount:    paidAmount,
        p_date:           sale.date || todayISOInAppTZ(),
        p_shop_id:        clientId,
        p_user_id:        currentUser.id,
        p_tenant_id:      tenantId || null,
      };
      // Desktop offline-first: queue the edit RPC; sync engine replays it.
      if (isElectron()) {
        try {
          await queueMutation({ table: 'edit_sale', type: 'rpc', payload: editParams });
          const discountAmt = Number(sale.discount) || 0;
          if (discountAmt > 0) {
            await queueMutation({ table: 'sales', type: 'update', payload: { id, discount: discountAmt } });
          }
          fetchSales();
          return { success: true, id, queued: true };
        } catch (qErr) {
          console.error('editSale local-first queue error:', qErr);
        }
      }
      const { error } = await restRpc('edit_sale', editParams);
      if (error) { console.error('editSale RPC Error:', error); return { error }; }
      // Record discount for reporting/receipts (edit_sale takes the net total).
      const discountAmt = Number(sale.discount) || 0;
      try { await restUpdate('sales', { discount: discountAmt }, { id, tenant_id: tenantId }); }
      catch (e) { console.warn('discount persist skipped:', e?.message); }
      await fetchSales();
      return { success: true, id };
    },
    deleteSale: remove,
    settleSale: settlePayment,
    // --- Invoice API ---
    // Invoices table stores GST-billing metadata separate from sales/POS. The
    // Invoices page composes a rich draft (grand_total, cgst/sgst/igst, HSN
    // line items). We whitelist fields that match the public.invoices schema
    // and drop anything else (amount_in_words, notes, paymentMethod, etc.)
    // so the insert doesn't fail on unknown columns.
    invoices,
    // Delivery details for an invoice process_sale already wrote. Updating that
    // row is what keeps a credit delivery to ONE invoice -- writing a second
    // document just to carry the address is how the duplicates started.
    updateInvoiceDelivery: async (invoiceId, fields) => {
      if (!tenantId) return { error: new Error('updateInvoiceDelivery: no tenant') };
      const { error } = await restUpdate('invoices', fields, { id: invoiceId, tenant_id: tenantId });
      if (error) {
        console.error('updateInvoiceDelivery error:', error);
        return { error };
      }
      setInvoices(prev => prev.map(i => (i.id === invoiceId ? { ...i, ...fields } : i)));
      return { success: true };
    },

    createInvoice: async (draft) => {
      if (!tenantId) return { error: new Error('createInvoice: no tenant') };

      // ── Plan limit enforcement ──
      const { maxInvoices } = getPlanLimits(plan);
      if (maxInvoices !== -1) {
        const now = new Date();
        const { from: monthStart, to: monthEnd } = monthBounds(now);
        const { count } = await supabase
          .from('sales')
          .select('id', { count: 'exact', head: true }).is('deleted_at', null)
          .eq('tenant_id', tenantId)
          .gte('date', monthStart)
          .lte('date', monthEnd);
        if ((count || 0) >= maxInvoices) {
          return {
            error: new Error(
              `Monthly invoice limit reached (${maxInvoices} invoices on ${plan} plan). Upgrade to Professional for unlimited invoices.`
            ),
            limitReached: true,
          };
        }
      }
      const id = draft.id || generateRef('INV');
      // Always mint canonical INV/<FY>/<NNNN> via the shared issuer RPC.
      // Old path hand-rolled "#<TAIL>" which produced rows like "#UK8OC9"
      // and broke search / sort / GST filings. Fall back to the legacy
      // tail format only if the RPC fails (offline, rare).
      let invoiceNumber = draft.invoice_number;
      if (!invoiceNumber) {
        try {
          const { data: issued, error: issueErr } = await restRpc(
            'issue_invoice_number',
            { p_tenant_id: tenantId, p_series: 'INV' }
          );
          if (issueErr) throw issueErr;
          invoiceNumber = issued;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[createInvoice] issue_invoice_number failed, falling back', e);
          invoiceNumber = `INV-${id.split('-').pop()}`;
        }
      }
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
        // Delivery tracking
        delivery_required: draft.delivery_required ?? false,
        delivery_status:   draft.delivery_status   ?? null,
        delivery_address:  draft.delivery_address  ?? null,
        delivery_zone:     draft.delivery_zone      ?? null,
        delivery_date:     draft.delivery_date      ?? null,
        delivery_notes:    draft.delivery_notes     ?? null,
        delivery_fee:      draft.delivery_fee       ?? 0,
        is_interstate:     draft.is_interstate      ?? false,
      };
      const { error: insErr } = await restInsert('invoices', row);
      if (insErr) {
        console.error('createInvoice error:', insErr);
        return { error: insErr };
      }
      // We built the row locally — show it optimistically; fetchSales reconciles.
      setInvoices(prev => [row, ...prev]);
      return { success: true, data: row };
    },
    // Manually trigger e-invoice IRN generation for a given invoice.
    // Idempotent — re-running on an invoice with a queued/successful job
    // returns the existing job.
    enqueueIrn: async (invoiceId) => {
      if (!invoiceId) return { error: new Error('enqueueIrn: invoiceId required') };
      if (!currentUser?.id) return { error: new Error('enqueueIrn: not authenticated') };
      const { data, error } = await restRpc('enqueue_irn_request', {
        p_invoice_id: invoiceId,
        p_user_id:    currentUser.id,
      });
      if (error) return { error };
      await fetchSales();
      return { success: true, ...data };
    },

    // Convert an existing POS sale into a full GST invoice.
    // Atomic + idempotent via SQL RPC. Re-running on a sale that already has
    // an invoice returns the existing invoice without burning a number.
    convertSaleToInvoice: async (saleId, opts = {}) => {
      if (!saleId) return { error: new Error('convertSaleToInvoice: saleId required') };
      if (!currentUser?.id) return { error: new Error('convertSaleToInvoice: not authenticated') };
      const { data, error } = await restRpc('convert_sale_to_invoice', {
        p_sale_id:         saleId,
        p_user_id:         currentUser.id,
        p_client_id:       opts.client_id        ?? null,
        p_client_name:     opts.client_name      ?? null,
        p_gstin:           opts.gstin            ?? null,
        p_address:         opts.address          ?? null,
        p_place_of_supply: opts.place_of_supply  ?? null,
        p_series:          opts.series           ?? 'INV',
        p_due_days:        opts.due_days         ?? 0,
        p_notes:           opts.notes            ?? null,
        p_phone:           opts.phone            ?? null,
      });
      if (error) return { error };
      await fetchSales();
      return { success: true, ...data };
    },
    processSalesReturn: async (ret) => {
      if (!tenantId) return { error: new Error('processSalesReturn: no tenant') };
      const { error: rpcErr } = await restRpc('process_sales_return', {
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
    // Undo a sales return — re-deducts the restocked qty, restores the
    // client's outstanding, and removes the credit note. Lets the original
    // sale be edited again (edit_sale refuses sales that still have a return).
    reverseSalesReturn: async (returnId) => {
      if (!tenantId) return { error: new Error('reverseSalesReturn: no tenant') };
      const { error } = await restRpc('reverse_sales_return', {
        p_return_id: returnId,
        p_tenant_id: tenantId,
      });
      if (error) return { error };
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
      const { error: updErr } = await restUpdate('invoices', {
        status: 'PAID',
        payment_status: 'PAID',
        paid_amount: inv?.grand_total ?? 0,
      }, { id, tenant_id: tenantId });
      if (updErr) return { error: updErr };
      setInvoices(prev => prev.map(i => i.id === id
        ? { ...i, status: 'PAID', payment_status: 'PAID', paid_amount: i.grand_total }
        : i));
      return { success: true };
    },
  };
};
