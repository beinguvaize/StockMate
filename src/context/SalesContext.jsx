import React, { createContext, useContext, useState } from 'react';
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

  // Dependencies via Hooks (replaces Phase 4 temporary prop injection)
  const { currentTenantId } = useTenant();
  const { setSyncStatus, setLastSyncedAt } = useSync();
  const { addNotification } = useNotifications();

  const value = {
    sales, setSales,
    clients, setClients,
    clientPayments, setClientPayments,
    invoices, setInvoices
  };

  return <SalesContext.Provider value={value}>{children}</SalesContext.Provider>;
};
