import React, { createContext, useContext, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { clientSchema, saleSchema } from '../lib/validation';
import { logError } from '../lib/errorLogger';
import { logAuditEvent, AUDIT_ACTIONS } from '../lib/auditLog';
import { generateUUID } from '../lib/utils';
import { useAuth } from './AuthContext';
import { useTenant } from './TenantContext';
import { useSync } from './SyncContext';
import { useNotifications } from './NotificationContext';
import { useInventory } from './InventoryContext';
import { useFinance } from './FinanceContext';

const SalesContext = createContext();

export const useSales = () => useContext(SalesContext);

export const SalesProvider = ({ children }) => {
  const [sales, setSales] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientPayments, setClientPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);

  const { currentUser } = useAuth();
  const { currentTenantId } = useTenant();
  const { setSyncStatus, setLastSyncedAt } = useSync();
  const { addNotification } = useNotifications();
  const {
    products, setProducts,
    inventoryLocations, inventoryBalances, setInventoryBalances,
    routes, MAIN_WAREHOUSE_ID,
  } = useInventory();
  const { setDayBook } = useFinance();

  // ---------- Clients ----------
  const addClient = async (client) => {
    const val = clientSchema.safeParse(client);
    if (!val.success) {
      addNotification('Validation failed:' + val.error.issues?.[0]?.message, 'error');
      return;
    }
    const newClient = {
      ...client,
      id: client.id || `CLI-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      outstanding_balance: client.outstanding_balance || 0,
      tenant_id: currentTenantId,
    };
    const { status, ...dbClient } = newClient;

    if (isSupabaseConfigured) {
      setSyncStatus('SYNCING');
      const { error } = await supabase.from('clients').upsert(dbClient);
      if (error) {
        console.error('Error adding client to Supabase:', error);
        setSyncStatus('ERROR');
        addNotification('Cloud Sync Delayed: Client saved locally', 'warning');
      } else {
        setSyncStatus('SYNCED');
        setLastSyncedAt(new Date().toISOString());
      }
    }
    setClients((prev) => [newClient, ...prev]);
  };

  const updateClient = async (updatedClient) => {
    const { status, ...dbClient } = updatedClient;

    if (isSupabaseConfigured) {
      setSyncStatus('SYNCING');
      const { error } = await supabase.from('clients').upsert(dbClient);
      if (error) {
        console.error('Error updating client in Supabase:', error);
        setSyncStatus('ERROR');
        addNotification('Failed to update client in cloud', 'error');
        return;
      }
      setSyncStatus('SYNCED');
      setLastSyncedAt(new Date().toISOString());
    }
    setClients((prev) => prev.map((c) => (c.id === updatedClient.id ? updatedClient : c)));
  };

  // Soft-delete: hard DELETE orphans sales/invoices/payments referencing this client.
  const deleteClient = async (clientId) => {
    if (isSupabaseConfigured) {
      setSyncStatus('SYNCING');
      const { error } = await supabase
        .from('clients')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', clientId)
        .eq('tenant_id', currentTenantId);
      if (error) {
        console.error('Error soft-deleting client:', error);
        logError({
          module: 'Clients',
          action: 'Soft Delete Client',
          error_code: error.code,
          error_message: error.message,
          severity: 'Medium',
        });
        setSyncStatus('ERROR');
        addNotification('Cloud Sync Delayed: Client removed locally', 'warning');
      } else {
        setSyncStatus('SYNCED');
        setLastSyncedAt(new Date().toISOString());
      }
    }
    setClients((prev) => prev.filter((c) => c.id !== clientId));
  };

  // ---------- Client Payments ----------
  const recordClientPayment = async (
    clientId,
    amount,
    paymentDate,
    notes,
    selectedInvoiceIds = [],
  ) => {
    const client = clients.find((c) => c.id === clientId);
    if (!client) return { success: false, error: 'Client not found' };

    const newBalance = Math.max(0, (client.outstanding_balance || 0) - amount);
    const updatedClient = { ...client, outstanding_balance: newBalance };

    if (isSupabaseConfigured) {
      setSyncStatus('SYNCING');

      const { error: clientError } = await supabase
        .from('clients')
        .upsert({ ...updatedClient, tenant_id: currentTenantId });

      if (selectedInvoiceIds.length > 0) {
        for (const invId of selectedInvoiceIds) {
          const inv = invoices.find((i) => i.id === invId);
          if (inv) {
            await supabase
              .from('invoices')
              .update({ payment_status: 'PAID', paid_amount: inv.grand_total })
              .eq('id', invId)
              .eq('tenant_id', currentTenantId);
          }
        }
      }

      if (clientError) {
        console.error('Error recording client payment:', clientError);
        logError({
          module: 'Clients',
          action: 'Record Client Payment (Balance Update)',
          error_code: clientError.code,
          error_message: clientError.message,
          severity: 'High',
        });
        setSyncStatus('ERROR');
        addNotification('Cloud Sync Delayed: Payment recorded locally', 'warning');
      }
    }

    const paymentRecord = {
      id: `CPAY-${Date.now()}`,
      client_id: clientId,
      amount,
      date: paymentDate || new Date().toISOString(),
      notes: notes || '',
      tenant_id: currentTenantId,
    };

    if (isSupabaseConfigured) {
      const { error: payErr } = await supabase.from('client_payments').insert(paymentRecord);
      if (payErr) {
        console.error('Error inserting client payment record:', payErr);
        logError({
          module: 'Clients',
          action: 'Record Client Payment (History Insert)',
          error_code: payErr.code,
          error_message: payErr.message,
          severity: 'Medium',
        });
      }
    }

    if (selectedInvoiceIds.length > 0) {
      setInvoices((prev) =>
        prev.map((inv) =>
          selectedInvoiceIds.includes(inv.id) ? { ...inv, payment_status: 'PAID' } : inv,
        ),
      );
    }

    setClients((prev) => prev.map((c) => (c.id === clientId ? updatedClient : c)));
    setClientPayments((prev) => [paymentRecord, ...prev]);
    addNotification(`Recorded payment of ${amount} from ${client.name}`, 'success');
    setSyncStatus('SYNCED');
    return { success: true };
  };

  // ---------- Invoices ----------
  const createInvoice = async (invoiceData) => {
    if (!isSupabaseConfigured) return;
    setSyncStatus('SYNCING');

    // Canonical issuer — returns INV/<FY>/<NNNN>. Replaces the legacy
    // get_next_invoice_number() that emitted "INV-YY-NNNN" and clashed
    // with the format the convert-to-invoice RPC produces.
    const { data: invNumber, error: rpcError } = await supabase.rpc(
      'issue_invoice_number',
      { p_tenant_id: currentTenantId, p_series: 'INV' }
    );
    if (rpcError) {
      console.error('Error getting invoice number:', rpcError);
      addNotification('Numbering system failure', 'error');
      return;
    }

    const newInvoice = {
      ...invoiceData,
      id: generateUUID(),
      invoice_number: invNumber,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tenant_id: currentTenantId,
    };

    const { error } = await supabase.from('invoices').insert(newInvoice);
    if (error) {
      console.error('Error creating invoice:', error);
      logError({
        module: 'Invoices',
        action: 'Create Invoice',
        error_code: error.code,
        error_message: error.message,
        severity: 'High',
      });
      setSyncStatus('ERROR');
      addNotification('Failed to save invoice to cloud', 'error');
      return;
    }

    setInvoices((prev) => [newInvoice, ...prev]);
    setSyncStatus('SYNCED');
    addNotification(`Invoice ${invNumber} generated!`, 'success');
    return newInvoice;
  };

  const markInvoicePaid = async (invoiceId) => {
    if (!isSupabaseConfigured) return;

    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return;

    setSyncStatus('SYNCING');

    const { error } = await supabase
      .from('invoices')
      .update({ payment_status: 'PAID' })
      .eq('id', invoiceId)
      .eq('tenant_id', currentTenantId);

    if (error) {
      console.error('Error marking invoice paid:', error);
      logError({
        module: 'Invoices',
        action: 'Mark Invoice Paid',
        error_code: error.code,
        error_message: error.message,
        severity: 'Medium',
      });
      setSyncStatus('ERROR');
      return;
    }

    if (inv.client_id && inv.client_id !== 'POS-WALKIN' && inv.client_id !== 'WALKIN') {
      await recordClientPayment(
        inv.client_id,
        inv.grand_total,
        new Date().toISOString(),
        `Payment for Invoice #${inv.invoice_number}`,
        [invoiceId],
      );
    }

    setInvoices((prev) =>
      prev.map((item) => (item.id === invoiceId ? { ...item, payment_status: 'PAID' } : item)),
    );
    setSyncStatus('SYNCED');
    addNotification(`Invoice ${inv.invoice_number} settled successfully`, 'success');
  };

  // ---------- Sale write ops ----------
  const reconcileSaleEffects = async (oldSale, newSale) => {
    const productDeltas = new Map();

    if (oldSale?.status === 'COMPLETED') {
      oldSale.items.forEach((i) =>
        productDeltas.set(i.productId, (productDeltas.get(i.productId) || 0) + i.quantity),
      );
    }
    if (newSale?.status === 'COMPLETED') {
      newSale.items.forEach((i) => {
        productDeltas.set(i.productId, (productDeltas.get(i.productId) || 0) - i.quantity);
        const product = products.find((p) => p.id === i.productId);
        if (product) i.cogs = (product.costPrice || 0) * i.quantity;
      });
      newSale.totalCogs = newSale.items.reduce((sum, i) => sum + (i.cogs || 0), 0);
    }

    const clientDeltas = new Map();
    if (oldSale?.paymentMethod?.toLowerCase() === 'credit') {
      const id = oldSale.clientId || oldSale.shopId;
      clientDeltas.set(id, (clientDeltas.get(id) || 0) - oldSale.totalAmount);
    }
    if (newSale?.paymentMethod?.toLowerCase() === 'credit') {
      const id = newSale.clientId || newSale.shopId;
      clientDeltas.set(id, (clientDeltas.get(id) || 0) + newSale.totalAmount);
    }

    if (productDeltas.size > 0) {
      setProducts((prev) =>
        prev.map((p) => {
          const delta = productDeltas.get(p.id);
          return delta ? { ...p, stock: Math.max(0, p.stock + delta) } : p;
        }),
      );
    }

    if (clientDeltas.size > 0) {
      setClients((prev) =>
        prev.map((c) => {
          const delta = clientDeltas.get(c.id);
          return delta
            ? { ...c, outstanding_balance: Math.max(0, (c.outstanding_balance || 0) + delta) }
            : c;
        }),
      );
    }

    // Atomic server-side delta RPCs prevent stale-state corruption under
    // concurrent sale edits / background sync races.
    if (isSupabaseConfigured) {
      const stockCalls = Array.from(productDeltas.entries()).map(([prodId, pDelta]) =>
        supabase.rpc('apply_product_stock_delta', {
          p_product_id: prodId,
          p_delta: pDelta,
          p_tenant_id: currentTenantId,
        }),
      );
      const balanceCalls = Array.from(clientDeltas.entries()).map(([clId, cDelta]) =>
        supabase.rpc('apply_client_balance_delta', {
          p_client_id: clId,
          p_delta: cDelta,
          p_tenant_id: currentTenantId,
        }),
      );
      const results = await Promise.all([...stockCalls, ...balanceCalls]);
      const failures = results.filter((r) => r?.error);
      if (failures.length > 0) {
        console.error('reconcileSaleEffects: RPC failure(s):', failures.map((f) => f.error));
        logError({
          module: 'Sales',
          action: 'Reconcile Sale Effects',
          error_code: failures[0].error.code,
          error_message: failures[0].error.message,
          severity: 'High',
        });
      }
    }
  };

  const placeSale = async (
    clientId,
    cartItems,
    subtotal,
    discount,
    tax,
    totalAmount,
    customerInfo,
    paymentType = 'cash',
    routeId = null,
    status = 'COMPLETED',
    scheduledDate = null,
    salesmanNote = '',
    manualLocationId = null,
    deliveryMethod = 'PICKUP',  // 'PICKUP' | 'DELIVERY'
  ) => {
    const val = saleSchema.safeParse({
      clientId,
      items: cartItems,
      totalAmount,
      paymentMethod: paymentType,
    });
    if (!val.success) {
      addNotification('Sale Validation failed:' + val.error.issues?.[0]?.message, 'error');
      return;
    }

    let totalCogs = 0;
    const updatedProducts = [...products];

    // MAIN_WAREHOUSE_ID is a client-side sentinel — the RPC resolves/auto-creates
    // the real warehouse row when null is passed.
    let locationId = manualLocationId || MAIN_WAREHOUSE_ID;
    if (routeId && !manualLocationId) {
      const route = routes.find((r) => r.id === routeId);
      if (route) {
        const loc = inventoryLocations.find(
          (l) => l.reference_id === route.vehicleId || l.name.includes(route.vehicleId),
        );
        if (loc) locationId = loc.id;
      }
    }

    // No DB writes here — `process_sale` RPC is the single source of truth for
    // stock writes. Prevents double-deduction race.
    // For DELIVERY orders, stock is NOT deducted until dispatched — skip optimistic update too.
    const isDelivery = deliveryMethod === 'DELIVERY';
    cartItems.forEach((item) => {
      const pIndex = updatedProducts.findIndex((p) => p.id === item.productId);
      if (pIndex > -1) {
        if (status === 'COMPLETED' && !isDelivery) {
          updatedProducts[pIndex].stock = Math.max(
            0,
            (updatedProducts[pIndex].stock || 0) - item.quantity,
          );
        }
        item.cogs = (updatedProducts[pIndex].costPrice || 0) * item.quantity;
        totalCogs += item.cogs;
      }
    });

    const newSale = {
      id: `SAL-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      date: new Date().toISOString(),
      clientId,
      items: cartItems,
      subtotal,
      discount,
      tax,
      totalAmount,
      totalCogs,
      customerInfo,
      paymentMethod: paymentType.charAt(0).toUpperCase() + paymentType.slice(1),
      paymentStatus: paymentType === 'cash' ? 'PAID' : 'PENDING',
      status,
      routeId,
      scheduledDate,
      salesmanNote,
      bookedBy: currentUser?.id,
    };

    if (isSupabaseConfigured) {
      setSyncStatus('SYNCING');

      const prevSales = [...sales];
      const prevProducts = [...products];
      const prevBalances = [...inventoryBalances];

      const rpcLocationId =
        locationId && locationId !== MAIN_WAREHOUSE_ID ? locationId : null;
      const { error: rpcError } = await supabase.rpc('process_sale', {
        p_id: newSale.id,
        p_shop_id: clientId,
        p_items: cartItems,
        p_total_amount: totalAmount,
        p_payment_method: newSale.paymentMethod,
        p_payment_status: newSale.paymentStatus,
        p_date: newSale.date,
        p_user_id: currentUser?.id,
        p_location_id: rpcLocationId,
        p_delivery_method: deliveryMethod,
      });

      if (rpcError) {
        console.error('❌ Atomic Sale Failed:', rpcError);
        setSales(prevSales);
        setProducts(prevProducts);
        setInventoryBalances(prevBalances);
        logError({
          module: 'Sales',
          action: 'Place Sale (Atomic)',
          error_code: rpcError.code,
          error_message: rpcError.message,
          severity: 'High',
        });
        setSyncStatus('ERROR');
        addNotification(
          `Critical: Failed to sync sale. Transaction reverted. ${rpcError.message}`,
          'error',
        );
        return null;
      }

      setSyncStatus('SYNCED');
      setLastSyncedAt(new Date().toISOString());
    }

    setSales((prev) => [newSale, ...prev]);

    if (paymentType.toLowerCase() === 'credit') {
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId
            ? { ...c, outstanding_balance: (c.outstanding_balance || 0) + totalAmount }
            : c,
        ),
      );
    }

    if (paymentType.toLowerCase() === 'cash') {
      const today = new Date().toISOString().split('T')[0];
      setDayBook((prev) =>
        prev.map((db) =>
          db.date === today ? { ...db, total_sales: (db.total_sales || 0) + totalAmount } : db,
        ),
      );
    }

    if (status === 'COMPLETED') {
      setProducts(updatedProducts);

      // Mirror inventory_balances decrement the RPC just performed. Skip for
      // MAIN_WAREHOUSE sentinel — real warehouse UUID unknown client-side.
      if (locationId && locationId !== MAIN_WAREHOUSE_ID) {
        setInventoryBalances((prev) => {
          const byKey = new Map(prev.map((b) => [`${b.product_id}|${b.location_id}`, b]));
          for (const item of cartItems) {
            const key = `${item.productId}|${locationId}`;
            const existing = byKey.get(key);
            if (existing) {
              byKey.set(key, {
                ...existing,
                quantity: Math.max(0, (existing.quantity || 0) - item.quantity),
                updated_at: new Date().toISOString(),
              });
            } else {
              byKey.set(key, {
                id: generateUUID(),
                product_id: item.productId,
                location_id: locationId,
                quantity: 0,
                updated_at: new Date().toISOString(),
              });
            }
          }
          return Array.from(byKey.values());
        });
      }
    }

    const locName = inventoryLocations.find((l) => l.id === locationId)?.name || 'HQ';
    addNotification(`Sale Processed from ${locName}: ${totalAmount}`, 'success');
    return newSale.id;
  };

  const updateSale = async (updatedSale) => {
    let oldSale;
    setSales((prev) => {
      oldSale = prev.find((s) => s.id === updatedSale.id);
      return prev;
    });

    await reconcileSaleEffects(oldSale, updatedSale);

    if (isSupabaseConfigured) {
      setSyncStatus('SYNCING');
      const { status: saleStatus, clientId, salesmanNote, ...rest } = updatedSale;
      const dbSale = {
        ...rest,
        shopId: clientId || updatedSale.shopId,
        status: saleStatus,
        note: salesmanNote || updatedSale.note,
        tenant_id: currentTenantId,
      };
      delete dbSale.clientId;
      delete dbSale.salesmanNote;

      const { error } = await supabase.from('sales').upsert(dbSale);
      if (error) {
        console.error('Error updating sale in Supabase:', error);
        logError({
          module: 'Sales',
          action: 'Update Sale',
          error_code: error.code,
          error_message: error.message,
          severity: 'Medium',
        });
        setSyncStatus('ERROR');
        addNotification('Failed to update sale in cloud', 'error');
        return;
      }
      setSyncStatus('SYNCED');
      setLastSyncedAt(new Date().toISOString());
    }
    setSales((prev) => prev.map((s) => (s.id === updatedSale.id ? updatedSale : s)));
    addNotification(`Sale #${updatedSale.id.split('-').pop()} synchronized`, 'success');
  };

  const deleteSale = async (saleId) => {
    let sale;
    setSales((prev) => {
      sale = prev.find((s) => s.id === saleId);
      return prev;
    });

    if (!sale) return;

    if (
      window.confirm(
        'Are you sure you want to PERMANENTLY delete this sale? Stock and balances will be reversed.',
      )
    ) {
      await reconcileSaleEffects(sale, null);

      if (isSupabaseConfigured) {
        const { error } = await supabase
          .from('sales')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', saleId)
          .eq('tenant_id', currentTenantId);
        if (error) {
          console.error('Error deleting sale from Supabase:', error);
          logError({
            module: 'Sales',
            action: 'Delete Sale',
            error_code: error.code,
            error_message: error.message,
            severity: 'Medium',
          });
          addNotification('Failed to delete sale from cloud', 'error');
          return;
        }
        // Audit: delete reverses stock + balances — treat as refund/void.
        logAuditEvent({
          action: AUDIT_ACTIONS.SALE_DELETE,
          entityType: 'sale',
          entityId: saleId,
          summary: `Deleted sale #${saleId.split('-').pop()} (stock & balances reversed)`,
          metadata: {
            client_id: sale?.clientId || sale?.client_id || null,
            total: sale?.total ?? sale?.totalAmount ?? null,
            payment_type: sale?.paymentType || sale?.payment_type || null,
            items_count: Array.isArray(sale?.items) ? sale.items.length : 0,
          },
        });
      }
      setSales((prev) => prev.filter((s) => s.id !== saleId));
      addNotification('Sale deleted and stock reversed', 'success');
    }
  };

  const settleSale = async (saleId, amount) => {
    const sale = sales.find((s) => s.id === saleId);
    if (!sale) return;

    const updatedSale = {
      ...sale,
      paidAmount: (sale.paidAmount || 0) + amount,
      paymentStatus:
        (sale.paidAmount || 0) + amount >= sale.totalAmount ? 'PAID' : 'PARTIAL',
      lastPaymentDate: new Date().toISOString(),
    };

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('sales')
        .upsert({ ...updatedSale, tenant_id: currentTenantId });
      if (error) {
        console.error('Error settling sale in Supabase:', error);
        logError({
          module: 'Sales',
          action: 'Settle Sale (Payment)',
          error_code: error.code,
          error_message: error.message,
          severity: 'Medium',
        });
        addNotification('Cloud Sync Delayed: Payment recorded locally', 'warning');
      }
    }

    if (sale.paymentMethod === 'CREDIT' || sale.paymentMethod === 'credit') {
      const client = clients.find((c) => c.id === sale.clientId || c.id === sale.shopId);
      if (client) {
        const newBalance = Math.max(0, (client.outstanding_balance || 0) - amount);
        await updateClient({ ...client, outstanding_balance: newBalance });
      }
    }

    setSales((prev) => prev.map((s) => (s.id === saleId ? updatedSale : s)));
    addNotification(
      `Payment of ${amount} received for Sale #${saleId.split('-').pop()}`,
      'success',
    );
  };

  const dispatchSale = async (saleId) => {
    if (!isSupabaseConfigured) return { error: { message: 'Supabase not configured' } };
    const { error } = await supabase.rpc('dispatch_sale', {
      p_sale_id: saleId,
      p_user_id: currentUser?.id ?? null,
    });
    if (error) {
      addNotification(`Dispatch failed: ${error.message}`, 'error');
      return { error };
    }
    // Update local state
    setSales(prev => prev.map(s =>
      s.id === saleId ? { ...s, fulfillment_status: 'DISPATCHED' } : s
    ));
    addNotification('Order dispatched — stock deducted', 'success');
    return { error: null };
  };

  const value = {
    sales, setSales,
    clients, setClients,
    clientPayments, setClientPayments,
    invoices, setInvoices,
    addClient, updateClient, deleteClient,
    recordClientPayment,
    createInvoice, markInvoicePaid,
    reconcileSaleEffects, placeSale, updateSale, deleteSale, settleSale, dispatchSale,
  };

  return <SalesContext.Provider value={value}>{children}</SalesContext.Provider>;
};
