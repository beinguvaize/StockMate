import React, { createContext, useContext, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { clientSchema } from '../lib/validation';
import { logError } from '../lib/errorLogger';
import { generateUUID } from '../lib/utils';
import { useTenant } from './TenantContext';
import { useSync } from './SyncContext';
import { useNotifications } from './NotificationContext';

const SalesContext = createContext();

export const useSales = () => useContext(SalesContext);

export const SalesProvider = ({ children }) => {
  const [sales, setSales] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientPayments, setClientPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);

  const { currentTenantId } = useTenant();
  const { setSyncStatus, setLastSyncedAt } = useSync();
  const { addNotification } = useNotifications();

  // ---------- Clients ----------
  const addClient = async (client) => {
    const val = clientSchema.safeParse(client);
    if (!val.success) {
      addNotification('Validation failed:' + val.error.errors[0].message, 'error');
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

    const { data: invNumber, error: rpcError } = await supabase.rpc('get_next_invoice_number');
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

  const value = {
    sales, setSales,
    clients, setClients,
    clientPayments, setClientPayments,
    invoices, setInvoices,
    addClient, updateClient, deleteClient,
    recordClientPayment,
    createInvoice, markInvoicePaid,
  };

  return <SalesContext.Provider value={value}>{children}</SalesContext.Provider>;
};
