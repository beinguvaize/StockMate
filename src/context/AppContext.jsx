/**
 * ─── NOTE: PARTIAL REFACTOR IN FLIGHT (ARCH-01) ──────────────────────────────
 * This file is mid-migration. The plan is to split its ~2400 lines into the
 * domain contexts imported below (Auth/Tenant/Sync/Inventory/Sales/etc.).
 *
 * Current structure:
 *   - `AppProviderInner`  : consumes each domain context via useAuth/useTenant/…
 *                           and still owns the bulk of the business logic.
 *   - `AppProvider`       : exported wrapper that nests all domain providers
 *                           around `AppProviderInner`, so `App.jsx` only
 *                           mounts `<AppProvider>`.
 *
 * Until the split is complete, `useAppContext()` remains the single public
 * hook — do NOT reach into the domain hooks directly from components yet,
 * or you'll have two sources of truth.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { createContext, useContext, useState, useEffect, useRef} from 'react';
import { supabase, isSupabaseConfigured} from '../lib/supabase';
import { 
 saleSchema, expenseSchema, purchaseSchema, 
 employeeSchema, clientSchema, dayBookSchema 
} from '../lib/validation';
import { cacheSet, cacheGet, cacheClear} from '../lib/cache';
import { 
  AVAILABLE_ROLES, MODULES_CONFIG, DEFAULT_PERMISSIONS, 
  INITIAL_BUSINESS, INITIAL_EXPENSE_CATEGORIES 
} from '../lib/constants';
import { isLocked, recordFailure, recordSuccess, timeRemaining } from '../lib/loginThrottle';
import { isModuleAvailable, getRequiredPlan, PLANS } from '../lib/tenancy';
import { logError } from '../lib/errorLogger';
import { logAuditEvent, AUDIT_ACTIONS, diffRoles } from '../lib/auditLog';
import { generateUUID, generateRef, todayISOInAppTZ } from '../lib/utils';

// Domain Hooks
import { AuthProvider, useAuth } from './AuthContext';
import { TenantProvider, useTenant } from './TenantContext';
import { SyncProvider, useSync } from './SyncContext';
import { InventoryProvider, useInventory } from './InventoryContext';
import { NotificationProvider, useNotifications } from './NotificationContext';
import { SalesProvider, useSales } from './SalesContext';
import { PurchasesProvider, usePurchases } from './PurchasesContext';
import { FinanceProvider, useFinance } from './FinanceContext';
import { HRProvider, useHR } from './HRContext';

// Bootstrap allowlist for first-login auto-provisioning. Parsed once from env.
// NOT a permission gate — only decides what roles to stamp on a brand-new user
// profile. After that, normal RBAC (users.roles) applies.
const BOOTSTRAP_ADMIN_EMAILS = new Set(
 (import.meta.env.VITE_BOOTSTRAP_ADMIN_EMAILS || '')
 .split(',')
 .map((e) => e.trim().toLowerCase())
 .filter(Boolean)
);

const AppContext = createContext();

export const useAppContext = () => useContext(AppContext);



// INITIAL MOCK DATA (DISABLED FOR PRODUCTION - ZERO DATA START)
const INITIAL_PRODUCTS = [];
const INITIAL_USERS = [];
const INITIAL_CLIENTS = [];
const INITIAL_EXPENSES = [];
const INITIAL_VEHICLES = [];
const INITIAL_SHOPS = [];
const INITIAL_EMPLOYEES = [];

const AppProviderInner = ({ children }) => {
  // --- 1. Consume Modular Contexts ---
  const {
    currentUser, setCurrentUser, session, isOwner, isStaff, login, logout, loading: authLoading
  } = useAuth();
  
  const { 
    currentTenant, currentTenantId, setCurrentTenant, isImpersonating, impersonateTenant, stopImpersonating,
    resolveTenant, resolveTenantBySlug, isModuleAllowed
  } = useTenant();

  const {
    syncStatus, setSyncStatus, isOnline, lastSyncedAt, setLastSyncedAt, initializingRef, appInitialized 
  } = useSync();

  const {
    products, setProducts, productCategories, setProductCategories,
    inventoryLocations, setInventoryLocations, inventoryBalances, setInventoryBalances,
    movementLog, setMovementLog, MAIN_WAREHOUSE_ID,
    vehicles, setVehicles, routes, setRoutes,
    adjustLocationStock, adjustStock, transferStock
  } = useInventory();

  const {
    notifications, addNotification
  } = useNotifications();

  const {
    sales, setSales, clients, setClients, clientPayments, setClientPayments, invoices, setInvoices,
    addClient, updateClient, deleteClient,
    recordClientPayment,
    createInvoice, markInvoicePaid,
    reconcileSaleEffects, placeSale, updateSale, deleteSale, settleSale
  } = useSales();

  const {
    purchases, setPurchases, suppliers, setSuppliers,
    addPurchase,
    addSupplier, updateSupplier, deleteSupplier,
  } = usePurchases();

  const {
    expenses, setExpenses, expenseCategories, setExpenseCategories, dayBook, setDayBook,
    addExpense, updateExpense, deleteExpense,
    addExpenseCategory, updateExpenseCategory, deleteExpenseCategory,
    updateDayBook, getDayBookForDate,
  } = useFinance();

  const {
    employees, setEmployees, payrollRecords, setPayrollRecords,
    addEmployee, updateEmployee, deleteEmployee, resetEmployeesDailyData,
    processPayroll, deletePayrollRecord,
  } = useHR();

  // --- 2. Remaining Facade State (to be moved in later phases) ---
  const [loading, setLoading] = useState(true);
  const [isSyncComplete, setIsSyncComplete] = useState(false);
  const [initError, setInitError] = useState(null);
   // --- 3. Persistence States (Cloud only) ---
  const [users, setUsers] = useState([]);
  const [businessProfile, setBusinessProfile] = useState({});
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  // vehicles/routes state moved to InventoryContext

  const [authSession, setAuthSession] = useState(null);


 // Aliases
 const orders = sales;
 const setOrders = setSales;

  const addUser = async (userData) => {
    // Fallback: If currentTenantId is missing but we are in a tenant-scoped route, try to resolve it from the URL
    let targetTenantId = currentTenantId;
    if (!targetTenantId && typeof window !== 'undefined') {
      const pathSegments = window.location.pathname.split('/');
      if (pathSegments.length >= 2 && pathSegments[1] !== 'nexus-hq' && pathSegments[1] !== 'setup') {
        const slug = pathSegments[1];
        const tenant = await resolveTenantBySlug(slug);
        if (tenant) targetTenantId = tenant.id;
      }
    }

    const newUser = {
      id: userData.id || generateUUID(),
      name: userData.name,
      email: userData.email,
      roles: userData.roles || [userData.role || 'STAFF'],
      status: 'ACTIVE',
      permissions: userData.permissions || { ...DEFAULT_PERMISSIONS },
      tenant_id: targetTenantId
    };

    if (isSupabaseConfigured && userData.password) {
      try {
        const { data: result, error: invokeError } = await supabase.functions.invoke('dynamic-service', {
          body: {
            email: userData.email,
            password: userData.password,
            name: userData.name,
            roles: userData.roles || ['STAFF'],
            permissions: userData.permissions || { ...DEFAULT_PERMISSIONS },
            tenant_id: targetTenantId
          }
        });

        if (invokeError) {
          console.error("❌ Staff Creation Failed:", invokeError);
          // invokeError.message is always generic "Edge Function returned a non-2xx status code"
          // The real error is in the response body — extract it if possible
          let errorMessage = invokeError.message;
          try {
            const body = result || (await invokeError.context?.json?.());
            if (body?.error) errorMessage = body.error;
          } catch (_) {}
          addNotification(`Staff creation failed: ${errorMessage}`, "error");
          return false;
        }

        const createdUser = { ...newUser, id: result.id };
        setUsers(prev => [...prev, createdUser]);
        addNotification(`${userData.name} added! They can now log in with their email & password.`, "success");
        return true;

      } catch (err) {
        console.error("❌ Edge Function Unreachable:", err);
        addNotification(`Request failed: ${err.message || 'Check connection'}`, "error");
        return false;
      }
    }

    // Fallback: save profile only (no auth account)
    if (isSupabaseConfigured) {
      setSyncStatus('SYNCING');
      const { error: profileError } = await supabase.from('users').upsert(newUser);
      if (profileError) {
        console.error("Error adding user:", profileError);
        setSyncStatus('ERROR');
        addNotification(`Failed to save staff profile: ${profileError.message}`, "error");
        return false;
      }
      setSyncStatus('SYNCED');
      setLastSyncedAt(new Date().toISOString());
      return true;
    }

    setUsers(prev => [...prev, newUser]);
    addNotification(`${userData.name} added!`, "success");
    return true;
  };

 const updateUser = async (updatedUser) => {
 // Snapshot the prior record BEFORE the upsert so we can audit role/permission diffs.
 const priorUser = users.find(u => u.id === updatedUser.id) || null;

 if (isSupabaseConfigured) {
 setSyncStatus('SYNCING');
 updatedUser.tenant_id = currentTenantId;
 const { error} = await supabase.from('users').upsert(updatedUser);
 if (error) {
 console.error("Error updating user in Supabase:", error);
 setSyncStatus('ERROR');
 addNotification(`Cloud sync failed: ${error.message}`, "error");
 return;
} else {
 setSyncStatus('SYNCED');
 setLastSyncedAt(new Date().toISOString());
 // Audit RBAC-sensitive changes only (avoid spamming for name/phone edits).
 const diff = diffRoles(priorUser, updatedUser);
 if (diff) {
 const parts = [];
 if (diff.rolesChanged)  parts.push(`roles ${JSON.stringify(diff.before.roles)} → ${JSON.stringify(diff.after.roles)}`);
 if (diff.permsChanged)  parts.push('permissions matrix updated');
 if (diff.statusChanged) parts.push(`status ${diff.before.status || '∅'} → ${diff.after.status || '∅'}`);
 logAuditEvent({
 action: diff.rolesChanged || diff.statusChanged ? AUDIT_ACTIONS.ROLE_CHANGE : AUDIT_ACTIONS.PERMISSION_CHANGE,
 entityType: 'user',
 entityId: updatedUser.id,
 summary: `Updated ${updatedUser.email || updatedUser.name || updatedUser.id}: ${parts.join('; ')}`,
 metadata: diff,
});
}
}
}
 setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
};

 const deleteUser = async (userId) => {
 if (userId === currentUser?.id) return;
 const target = users.find(u => u.id === userId) || null;

 if (isSupabaseConfigured) {
 setSyncStatus('SYNCING');
 const { error} = await supabase.from('users').delete().eq('id', userId).eq('tenant_id', currentTenantId);
 if (error) {
 console.error("Error deleting user from Supabase:", error);
 setSyncStatus('ERROR');
 addNotification("Cloud Sync Delayed: Staff removed locally","warning");
 // Fall through
} else {
 setSyncStatus('SYNCED');
 setLastSyncedAt(new Date().toISOString());
 logAuditEvent({
 action: AUDIT_ACTIONS.USER_DELETE,
 entityType: 'user',
 entityId: userId,
 summary: `Removed staff ${target?.email || target?.name || userId}`,
 metadata: { roles: target?.roles, status: target?.status },
});
}
}

    setUsers(users.filter(u => u.id !== userId));
    addNotification('Staff record removed from system', 'success');
};

 // addClient/updateClient/deleteClient moved to SalesContext

 // addExpense/updateExpense/deleteExpense moved to FinanceContext

 const logMovement = async (productId, productName, type, quantity, reason, userId) => {
 const newLog = {
 id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
 date: new Date().toISOString(),
 product_id: productId, 
 product_name: productName, 
 // Also provide camelCase for the frontend state consistency
 productId: productId,
 productName: productName,
 type, 
 quantity, 
 reason, 
 user_id: userId,
 userId: userId,
 tenant_id: currentTenantId
};

 if (isSupabaseConfigured) {
 // ENSURE WE ONLY SEND VALID DATABASE COLUMNS
 const dbLog = {
 id: newLog.id,
 date: newLog.date,
 product_id: productId,
 product_name: productName,
 type,
 quantity,
 reason,
 user_id: userId,
 tenant_id: currentTenantId
};
 const { error} = await supabase.from('movement_log').insert(dbLog);
 if (error) {
 console.error("Error logging movement to Supabase:", error);
}
}

 setMovementLog(prev => [newLog, ...prev]);
};

 // reconcileSaleEffects moved to SalesContext

 // placeSale moved to SalesContext

  // createInvoice/markInvoicePaid moved to SalesContext


 if (clientDeltas.size > 0) {
 setClients(prev => prev.map(c => {
 const delta = clientDeltas.get(c.id);
 return delta ? { ...c, outstanding_balance: Math.max(0, (c.outstanding_balance || 0) + delta)} : c;
}));
}

 // Persistence
 if (isSupabaseConfigured) {
 for (const [prodId, pDelta] of productDeltas) {
   await supabase.from('products').update({ stock: Math.max(0, (products.find(p => p.id === prodId)?.stock || 0) + pDelta) }).eq('id', prodId);
 }
 for (const [clId, cDelta] of clientDeltas) {
   const currentClient = clients.find(c => c.id === clId);
   if (currentClient) {
     await supabase.from('clients').update({ outstanding_balance: Math.max(0, (currentClient.outstanding_balance || 0) + cDelta)}).eq('id', clId);
   }
 }
 }
};

 const placeSale = async (clientId, cartItems, subtotal, discount, tax, totalAmount, customerInfo, paymentType = 'cash', routeId = null, status = 'COMPLETED', scheduledDate = null, salesmanNote = '', manualLocationId = null) => {
    const val = saleSchema.safeParse({ clientId, items: cartItems, totalAmount, paymentMethod: paymentType});
    if (!val.success) {
      addNotification("Sale Validation failed:" + val.error.errors[0].message,"error");
      return;
    }
    
    let totalCogs = 0;
    const updatedProducts = [...products];
    
    // Determine which location to deduct from
    let locationId = manualLocationId || MAIN_WAREHOUSE_ID;
    if (routeId && !manualLocationId) {
      const route = routes.find(r => r.id === routeId);
      if (route) {
        // Find vehicle location
        const loc = inventoryLocations.find(l => l.reference_id === route.vehicleId || l.name.includes(route.vehicleId));
        if (loc) locationId = loc.id;
      }
    }

    const stockAdjustments = [];
    cartItems.forEach(item => {
      const pIndex = updatedProducts.findIndex(p => p.id === item.productId);
      if (pIndex > -1) {
        if (status === 'COMPLETED') {
          stockAdjustments.push(adjustLocationStock(item.productId, -item.quantity, locationId));
          
          // Legacy check: if warehouse sale, update the products.stock column
          if (locationId === MAIN_WAREHOUSE_ID) {
            updatedProducts[pIndex].stock -= item.quantity;
          }
        }
        item.cogs = (updatedProducts[pIndex].costPrice || 0) * item.quantity;
        totalCogs += item.cogs;
      }
    });

    if (stockAdjustments.length > 0) {
      await Promise.all(stockAdjustments);
    }

 const newSale = {
 id: generateRef('SAL'),
 date: new Date().toISOString(),
 clientId,
 items: cartItems,
 subtotal,
 discount,
 tax,
 totalAmount,
 totalCogs,
 customerInfo,
 paymentMethod: paymentType.charAt(0).toUpperCase() + paymentType.slice(1), // Normalize to 'Cash'/'Credit' for RPC
 paymentStatus: paymentType === 'cash' ? 'PAID' : 'PENDING',
 status,
 routeId,
 scheduledDate,
 salesmanNote,
 bookedBy: currentUser?.id
};

 if (isSupabaseConfigured) {
 setSyncStatus('SYNCING');
 // Priority 2: Atomic Transaction via RPC
 // RPC reads jsonb items as (id text, quantity numeric, name text). The
 // POS carries {productId, ...} so we remap here — otherwise the stock
 // deduction loop sees NULL ids, RPC errors out, and we fall through to
 // the "Failed to save sale" fallback.
 const rpcItems = (cartItems || []).map(i => ({
   id: i.productId || i.id,
   quantity: i.quantity,
   name: i.name,
 }));
 // Walk-in sale => no client record. Pass NULL, not any of the literal
 // walk-in sentinels ('WALKIN', 'POS-WALKIN') used upstream — those have
 // no matching row in clients and the RPC's UPDATE-by-id would break or
 // silently no-op depending on column types.
 const isWalkIn = !clientId || ['WALKIN','POS-WALKIN','walk-in','WALK-IN'].includes(clientId);
 const rpcShopId = isWalkIn ? null : clientId;
 const { error: rpcError} = await supabase.rpc('process_sale', {
 p_id: newSale.id,
 p_shop_id: rpcShopId,
 p_items: rpcItems,
 p_total_amount: totalAmount,
 p_payment_method: newSale.paymentMethod,
 p_payment_status: newSale.paymentStatus,
 p_date: newSale.date,
 p_user_id: currentUser?.id,
 // Impersonation-safe: GLOBAL_ADMIN override honored server-side only for
 // admins; non-admins always get their own tenant regardless of payload.
 p_tenant_id: currentTenantId || null
});

 if (rpcError) {
 console.error("❌ Atomic Sale Failed:", rpcError);
 // Fallback direct insert. Column names match the sales table (camelCase
 // quoted identifiers), not snake_case. The previous dbSale shape used
 // total_amount/payment_method/shop_id — none of which exist on the
 // table — so the fallback always failed alongside the RPC.
 const dbSale = {
 id: newSale.id,
 shopId: rpcShopId,
 items: rpcItems,
 totalAmount: totalAmount,
 paymentMethod: newSale.paymentMethod,
 paymentStatus: newSale.paymentStatus,
 date: newSale.date,
 bookedBy: currentUser?.id,
 tenant_id: currentTenantId
};

 const { error: insertError} = await supabase.from('sales').insert(dbSale);
  if (insertError) {
  console.error("Error creating sale fallback:", insertError);
  logError({
    module: 'Sales',
    action: 'Place Sale (Fallback)',
    error_code: insertError.code,
    error_message: insertError.message,
    severity: 'High'
  });
  setSyncStatus('ERROR');
  addNotification(`Critical: Failed to save sale. Please check connection.`,"error");
  return null;
 }
 addNotification(`Warning: Atomic sync failed, used legacy fallback.`,"warning");
}
 setSyncStatus('SYNCED');
 setLastSyncedAt(new Date().toISOString());
}

 // OPTIMISTIC LOCAL UPDATES (Keep UI snappy)
 setSales(prev => [newSale, ...prev]);
 
 // Update outstanding balance locally (for immediate UI reflect)
 if (paymentType.toLowerCase() === 'credit') {
 setClients(prev => prev.map(c => 
 c.id === clientId 
 ? { ...c, outstanding_balance: (c.outstanding_balance || 0) + totalAmount}
 : c
 ));
}

 // Update Day Book Cash locally if Cash
 if (paymentType.toLowerCase() === 'cash') {
 const today = todayISOInAppTZ();
 setDayBook(prev => prev.map(db => 
 db.date === today 
 ? { ...db, total_sales: (db.total_sales || 0) + totalAmount}
 : db
 ));
}

 // Update local products stock
 if (status === 'COMPLETED' && locationId === MAIN_WAREHOUSE_ID) {
      setProducts(updatedProducts);
    }

    const locName = inventoryLocations.find(l => l.id === locationId)?.name || 'HQ';
    addNotification(`Sale Processed from ${locName}: ${businessProfile?.currencySymbol || ''}${totalAmount}`, 'success');
    return newSale.id;
  };

  const createInvoice = async (invoiceData) => {
    if (!isSupabaseConfigured) return;
    setSyncStatus('SYNCING');
    
    // 1. Get atomic invoice number via RPC
    const { data: invNumber, error: rpcError } = await supabase.rpc('get_next_invoice_number');
    if (rpcError) {
      console.error("Error getting invoice number:", rpcError);
      addNotification("Numbering system failure", "error");
      return;
    }

    const newInvoice = {
      ...invoiceData,
      id: generateUUID(),
      invoice_number: invNumber,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tenant_id: currentTenantId
    };

    // 2. Persist to Supabase
    const { error } = await supabase.from('invoices').insert(newInvoice);
    if (error) {
      console.error("Error creating invoice:", error);
      logError({
        module: 'Invoices',
        action: 'Create Invoice',
        error_code: error.code,
        error_message: error.message,
        severity: 'High'
      });
      setSyncStatus('ERROR');
      addNotification("Failed to save invoice to cloud", "error");
      return;
    }

    setInvoices(prev => [newInvoice, ...prev]);
    cacheSet('invoices', [newInvoice, ...invoices]);

    // 3. Update local client balance optimistically.
    // The on_invoice_payment_sync DB trigger already recomputed the authoritative
    // value in clients.outstanding_balance. We mirror that locally so the UI
    // updates immediately without a full refetch.
    if (newInvoice.client_id && newInvoice.payment_status !== 'PAID') {
      const owed = Math.max(0, Number(newInvoice.grand_total) - Number(newInvoice.paid_amount || 0));
      setClients(prev => prev.map(c =>
        c.id === newInvoice.client_id
          ? { ...c, outstanding_balance: (c.outstanding_balance || 0) + owed }
          : c
      ));
    }

    setSyncStatus('SYNCED');
    addNotification(`Invoice ${invNumber} generated!`, 'success');
    return newInvoice;
  };

  const markInvoicePaid = async (invoiceId) => {
    if (!isSupabaseConfigured) return;
    
    // Find invoice to get amount and client info
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) return;

    setSyncStatus('SYNCING');
    
    // 1. Update Invoice Status
    const { error } = await supabase
      .from('invoices')
      .update({ payment_status: 'PAID' })
      .eq('id', invoiceId)
      .eq('tenant_id', currentTenantId);
      
    if (error) {
       console.error("Error marking invoice paid:", error);
       logError({
         module: 'Invoices',
         action: 'Mark Invoice Paid',
         error_code: error.code,
         error_message: error.message,
         severity: 'Medium'
       });
       setSyncStatus('ERROR');
       return;
    }

    // 2. If it's a client invoice, record the payment against their account
    if (inv.client_id && inv.client_id !== 'POS-WALKIN' && inv.client_id !== 'WALKIN') {
      await recordClientPayment(
        inv.client_id, 
        inv.grand_total, 
        new Date().toISOString(), 
        `Payment for Invoice #${inv.invoice_number}`,
        [invoiceId]
      );
    }

    setInvoices(prev => prev.map(item => 
      item.id === invoiceId ? { ...item, payment_status: 'PAID' } : item
    ));
    setSyncStatus('SYNCED');
    addNotification(`Invoice ${inv.invoice_number} settled successfully`, "success");
  };

  const updateSale = async (updatedSale) => {
 // Use functional state to get the absolutely latest old sale version
 let oldSale;
 setSales(prev => {
 oldSale = prev.find(s => s.id === updatedSale.id);
 return prev;
});

 // Reconcile based on the detected change
 await reconcileSaleEffects(oldSale, updatedSale);

 if (isSupabaseConfigured) {
 setSyncStatus('SYNCING');
 const { status: saleStatus, clientId, salesmanNote, ...rest} = updatedSale;
 const dbSale = { 
 ...rest, 
 shopId: clientId || updatedSale.shopId, 
 status: saleStatus,
 note: salesmanNote || updatedSale.note,
 tenant_id: currentTenantId
};
 
 // Cleanup fields that don't exist in the DB schema
 delete dbSale.clientId; 
 delete dbSale.salesmanNote;

 const { error} = await supabase.from('sales').upsert(dbSale);
  if (error) {
  console.error("Error updating sale in Supabase:", error);
  logError({
    module: 'Sales',
    action: 'Update Sale',
    error_code: error.code,
    error_message: error.message,
    severity: 'Medium'
  });
  setSyncStatus('ERROR');
  addNotification("Failed to update sale in cloud","error");
  return;
 } else {
 setSyncStatus('SYNCED');
 setLastSyncedAt(new Date().toISOString());
}
}
 setSales(prev => prev.map(s => s.id === updatedSale.id ? updatedSale : s));
 addNotification(`Sale #${updatedSale.id.split('-').pop()} synchronized`, 'success');
};

 const deleteSale = async (saleId) => {
 // Get the latest version of the sale from current state
 let sale;
 setSales(prev => {
 sale = prev.find(s => s.id === saleId);
 return prev;
});

 if (!sale) return;

 if (window.confirm("Are you sure you want to PERMANENTLY delete this sale? Stock and balances will be reversed.")) {
 await reconcileSaleEffects(sale, null);

 if (isSupabaseConfigured) {
  const { error} = await supabase.from('sales').delete().eq('id', saleId).eq('tenant_id', currentTenantId);
  if (error) {
  console.error("Error deleting sale from Supabase:", error);
  logError({
    module: 'Sales',
    action: 'Delete Sale',
    error_code: error.code,
    error_message: error.message,
    severity: 'Medium'
  });
  addNotification("Failed to delete sale from cloud","error");
  return;
 }
 // Audit: deleting a sale reverses stock + balances — treat as a refund/void.
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
 setSales(prev => prev.filter(s => s.id !== saleId));
 addNotification("Sale deleted and stock reversed","success");
}
};

 const settleSale = async (saleId, amount) => {
 const sale = sales.find(s => s.id === saleId);
 if (!sale) return;

 const updatedSale = {
 ...sale,
 paidAmount: (sale.paidAmount || 0) + amount,
 paymentStatus: ((sale.paidAmount || 0) + amount >= sale.totalAmount) ? 'PAID' : 'PARTIAL',
 lastPaymentDate: new Date().toISOString()
};

  if (isSupabaseConfigured) {
    const { error } = await supabase.from('sales').upsert({ ...updatedSale, tenant_id: currentTenantId });
    if (error) {
      console.error("Error settling sale in Supabase:", error);
      logError({
        module: 'Sales',
        action: 'Settle Sale (Payment)',
        error_code: error.code,
        error_message: error.message,
        severity: 'Medium'
      });
      addNotification("Cloud Sync Delayed: Payment recorded locally", "warning");
      // Fall through
    }
  }

 // Also update client persistent balance if it was a credit sale
 if (sale.paymentMethod === 'CREDIT' || sale.paymentMethod === 'credit') {
 const client = clients.find(c => c.id === sale.clientId || c.id === sale.shopId);
 if (client) {
 const newBalance = Math.max(0, (client.outstanding_balance || 0) - amount);
 await updateClient({ ...client, outstanding_balance: newBalance});
}
}

 setSales(sales.map(s => s.id === saleId ? updatedSale : s));
 addNotification(`Payment of ${businessProfile?.currencySymbol || ''}${amount} received for Sale #${saleId.split('-').pop()}`, 'success');
};

 // Task 4: Mark as Paid for Client (Enhanced with Invoice Selection)
  const recordClientPayment = async (clientId, amount, paymentDate, notes, selectedInvoiceIds = []) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return { success: false, error: 'Client not found'};

    if (isSupabaseConfigured) {
      setSyncStatus('SYNCING');

      // Update selected invoices. Each update fires on_invoice_payment_sync trigger
      // which recomputes clients.outstanding_balance automatically — no manual
      // balance decrement needed.
      if (selectedInvoiceIds.length > 0) {
        for (const invId of selectedInvoiceIds) {
          const inv = invoices.find(i => i.id === invId);
          if (inv) {
            await supabase
              .from('invoices')
              .update({
                payment_status: 'PAID',
                paid_amount: inv.grand_total
              })
              .eq('id', invId)
              .eq('tenant_id', currentTenantId);
          }
        }
      }
    }

    // Re-read the trigger-computed balance from DB so local state is accurate
    let newBalance = Math.max(0, (client.outstanding_balance || 0) - amount);
    if (isSupabaseConfigured) {
      const { data: freshClient } = await supabase
        .from('clients')
        .select('outstanding_balance')
        .eq('id', clientId)
        .eq('tenant_id', currentTenantId)
        .single();
      if (freshClient) newBalance = Number(freshClient.outstanding_balance) || 0;
    }
    const updatedClient = { ...client, outstanding_balance: newBalance };

    const paymentRecord = {
      id: `CPAY-${Date.now()}`,
      client_id: clientId,
      amount: amount,
      date: paymentDate || new Date().toISOString(),
      notes: notes || '',
      tenant_id: currentTenantId
    };
    
    if (isSupabaseConfigured) {
      const { error: payErr } = await supabase.from('client_payments').insert(paymentRecord);
      if (payErr) {
        console.error("Error inserting client payment record:", payErr);
        logError({
          module: 'Clients',
          action: 'Record Client Payment (History Insert)',
          error_code: payErr.code,
          error_message: payErr.message,
          severity: 'Medium'
        });
      }
    }

    // Update Local Invoices State
    if (selectedInvoiceIds.length > 0) {
      setInvoices(prev => prev.map(inv => 
        selectedInvoiceIds.includes(inv.id) ? { ...inv, payment_status: 'PAID' } : inv
      ));
    }

    setClients(clients.map(c => c.id === clientId ? updatedClient : c));
    setClientPayments(prev => [paymentRecord, ...prev]);
    addNotification(`Recorded payment of ${businessProfile?.currencySymbol || ''}${amount} from ${client.name}`,"success");
    setSyncStatus('SYNCED');
    return { success: true};
  };


  const addProductCategory = async (categoryName) => {
    if (isSupabaseConfigured) {
      setSyncStatus('SYNCING');
      const { data, error } = await supabase.from('product_categories').insert({ name: categoryName, tenant_id: currentTenantId }).select();
      if (error) {
        console.error("Error adding category:", error);
        setSyncStatus('ERROR');
        addNotification("Failed to add category: " + error.message, "error");
        return null;
      }
      setProductCategories(prev => [...prev, data[0]]);
      setSyncStatus('SYNCED');
      return data[0];
    }
    const newCat = { id: generateUUID(), name: categoryName };
    setProductCategories(prev => [...prev, newCat]);
    return newCat;
  };

  const updateProductCategory = async (updatedCategory) => {
    if (isSupabaseConfigured) {
      setSyncStatus('SYNCING');
      const { error } = await supabase.from('product_categories').update({ name: updatedCategory.name }).eq('id', updatedCategory.id).eq('tenant_id', currentTenantId);
      if (error) {
        setSyncStatus('ERROR');
        addNotification("Failed to update category: " + error.message, "error");
        return;
      }
      setSyncStatus('SYNCED');
    }
    setProductCategories(prev => prev.map(c => c.id === updatedCategory.id ? updatedCategory : c));
  };

  const deleteProductCategory = async (categoryId) => {
    if (isSupabaseConfigured) {
      setSyncStatus('SYNCING');
      const { error } = await supabase.from('product_categories').delete().eq('id', categoryId).eq('tenant_id', currentTenantId);
      if (error) {
        setSyncStatus('ERROR');
        addNotification("Failed to delete category: " + error.message, "error");
        return false;
      }
      setSyncStatus('SYNCED');
    }
    setProductCategories(prev => prev.filter(c => c.id !== categoryId));
    return true;
  };

 const addProduct = async (product) => {
 const newProduct = { 
 ...product, 
 id: product.id || `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, 
 stock: product.stock || 0, 
 taxRate: product.taxRate || 0,
 tenant_id: currentTenantId
};

 if (isSupabaseConfigured) {
 setSyncStatus('SYNCING');
 const { error} = await supabase.from('products').upsert(newProduct);
  if (error) {
  console.error("Error adding product to Supabase:", error);
  logError({
    module: 'Inventory',
    action: 'Add Product',
    error_code: error.code,
    error_message: error.message,
    severity: 'High'
  });
  setSyncStatus('ERROR');
  addNotification(`Cloud Save Failed: ${error.message}`,"error");
  return;
} else {
 setSyncStatus('SYNCED');
 setLastSyncedAt(new Date().toISOString());
}
}

 setProducts([...products, newProduct]);
 if (newProduct.stock > 0) {
 logMovement(newProduct.id, newProduct.name, 'IN', newProduct.stock, 'Initial Stock', currentUser?.id);
}
};
 const updateProduct = async (updatedProduct) => {
 if (isSupabaseConfigured) {
 setSyncStatus('SYNCING');
 const { error} = await supabase.from('products').upsert({ ...updatedProduct, tenant_id: currentTenantId });
  if (error) {
  console.error("Error updating product in Supabase:", error);
  logError({
    module: 'Inventory',
    action: 'Update Product',
    error_code: error.code,
    error_message: error.message,
    severity: 'Medium'
  });
  setSyncStatus('ERROR');
  addNotification(`Cloud Sync Failed: ${error.message}`, "error");
  return;
} else {
 setSyncStatus('SYNCED');
 setLastSyncedAt(new Date().toISOString());
}
}
 setProducts(products.map(p => p.id === updatedProduct.id ? updatedProduct : p));
};

 const deleteProduct = async (id) => {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('products').delete().eq('id', id).eq('tenant_id', currentTenantId);
      if (error) {
        console.error("Error deleting product from Supabase:", error);
        logError({
          module: 'Inventory',
          action: 'Delete Product',
          error_code: error.code,
          error_message: error.message,
          severity: 'Medium'
        });
        addNotification(`Cloud Delete Failed: ${error.message}`, "error");
        return; // STOP
      }
    }
 setProducts(prev => prev.filter(p => p.id !== id));
 setMovementLog(prev => prev.filter(l => l.productId !== id));
};


 // Mock data generator removed

 // Seeding functions removed as per"Cloud Only" requirement
 const resetAndSeedCloud = async () => {
 alert("Seed functionality is under optimization for enterprise deployment.");
};

 const resetAndSeedLocal = async () => {
 alert("Local seeding is disabled. All data is managed via Supabase.");
};

 const migrateLocalToSupabase = async () => {
 alert("Local storage is deprecated. Please re-enter data if not in cloud.");
};

 // Helper: check if current user has a specific role
 // SECURITY: No hardcoded-email overrides. Admin rights come ONLY from the
 // server-authoritative `users.roles` column. Fail closed if profile missing.
 const hasRole = (role) => {
 if (!currentUser) return false;

 const roles = currentUser.roles || (currentUser.role ? [currentUser.role] : ['STAFF']);
 if (roles.includes('GLOBAL_ADMIN')) return true;
 return roles.includes(role);
};

 /**
 * RBAC Permission System (v12)
 * Supports both legacy strings and granular module/action pairs.
 *
 * SECURITY: Authorization is driven exclusively by the persisted
 * `users.roles` + `users.permissions` columns. No email-based overrides.
 */
 const hasPermission = (moduleOrLegacy, action = 'view') => {
 if (!currentUser) return false;
 
 const roles = currentUser.roles || (currentUser.role ? [currentUser.role] : ['STAFF']);
 if (roles.includes('OWNER') || roles.includes('GLOBAL_ADMIN')) return true;

 // Ensure we have a permissions object (fallback to defaults if missing)
 const permissions = currentUser.permissions || DEFAULT_PERMISSIONS;

 // Case 1: Granular module check (e.g., hasPermission('inventory', 'edit'))
 const moduleKey = moduleOrLegacy.toLowerCase();
 if (permissions[moduleKey]) {
 return !!permissions[moduleKey][action.toLowerCase()];
}

 // Case 2: Legacy string check (e.g., hasPermission('MANAGE_USERS'))
 const legacyMap = {
 'MANAGE_USERS': permissions.users?.edit,
 'VIEW_REPORTS': permissions.reports?.view,
 'VIEW_EXPENSES': permissions.expenses?.view,
 'RECORD_SALE': permissions.sales?.edit,
 'VIEW_STOCK': permissions.inventory?.view,
 'VIEW_FLEET': permissions.vehicles?.view,
 'ADD_CLIENT': permissions.clients?.edit,
 'EDIT_CLIENT': permissions.clients?.edit,
 'PROCESS_PAYROLL': permissions.payroll?.edit,
 'ACCESS_SETTINGS': permissions.settings?.view
};

 if (legacyMap[moduleOrLegacy] !== undefined) {
 return !!legacyMap[moduleOrLegacy];
}

 return false;
};

 const getUserName = (userId) => {
 const user = users.find(u => u.id === userId);
 return user ? user.name : 'Unknown User';
};

 const getVehicleName = (vehicleId) => {
 const vehicle = vehicles.find(v => v.id === vehicleId);
 return vehicle ? vehicle.name : 'Unknown Vehicle';
};

 const getClientName = (clientId) => {
 if (!clientId) return 'Anonymous';
 if (clientId === 'POS-WALKIN' || clientId === 'WALKIN') return 'Walk-in Customer';
 
 // Search by both string and numeric types if necessary
 const client = clients.find(c => String(c.id) === String(clientId));
 if (client) return client.name;
 
 // Check if it's already a name (legacy data)
 if (typeof clientId === 'string' && clientId.length > 5 && isNaN(clientId)) return clientId;
 
 return 'Unknown Client';
};

 const getEmployeeName = (empId) => {
 const emp = employees.find(e => e.id === empId);
 return emp ? emp.name : 'Unknown Driver';
};

 const isViewOnly = () => {
 if (!currentUser) return true;
 if (currentUser.roles && currentUser.roles.length === 1 && currentUser.roles.includes('VIEW_ONLY')) return true;
 return false;
};

 const addVehicle = async (vehicle) => {
 const newVehicle = { ...vehicle, id: vehicle.id || `VH-${Date.now()}`, tenant_id: currentTenantId};
 if (isSupabaseConfigured) {
 const { error} = await supabase.from('vehicles').upsert(newVehicle);
 if (error) {
 console.error("Error adding vehicle to Supabase:", error);
 addNotification(`Cloud Sync Failed: ${error.message}`, "error");
 return; // STOP
}
}
 setVehicles([...vehicles, newVehicle]);
 addNotification(`${vehicle.name} registered and synced`, "success");
};

 const updateVehicle = async (updated) => {
 if (isSupabaseConfigured) {
 const { error} = await supabase.from('vehicles').upsert({ ...updated, tenant_id: currentTenantId });
 if (error) {
 console.error("Error updating vehicle in Supabase:", error);
 addNotification(`Cloud Sync Failed: ${error.message}`, "error");
 return; // STOP
}
}
 setVehicles(vehicles.map(v => v.id === updated.id ? updated : v));
};

 const deleteVehicle = async (vehicleId) => {
 if (isSupabaseConfigured) {
 const { error} = await supabase.from('vehicles').delete().eq('id', vehicleId).eq('tenant_id', currentTenantId);
 if (error) {
 console.error("Error deleting vehicle from Supabase:", error);
}
}
setVehicles(vehicles.filter(v => v.id !== vehicleId));
 addNotification('Vehicle clearance revoked', 'success');
};

 const dispatchRoute = async (routeData) => {
    const newRoute = {
      ...routeData,
      id: routeData.id || `RT-${Date.now()}`,
      status: 'ACTIVE',
      date: new Date().toISOString()
    };

    // 1. Ensure Vehicle Location Exists
    let vehicleLoc = inventoryLocations.find(l => l.reference_id === routeData.vehicleId);
    if (!vehicleLoc) {
      const vName = getVehicleName(routeData.vehicleId);
      const { data, error } = await supabase
        .from('inventory_locations')
        .insert({ name: vName, type: 'VEHICLE', reference_id: routeData.vehicleId, tenant_id: currentTenantId })
        .select()
        .single();
      
      if (!error && data) {
        vehicleLoc = data;
        setInventoryLocations(prev => [...prev, data]);
      }
    }

    if (isSupabaseConfigured) {
      const { error: routeError} = await supabase.from('routes').upsert({ ...newRoute, tenant_id: currentTenantId });
      if (routeError) {
        console.error("Error dispatching route:", routeError);
        return;
      }
    }

    // 2. Formal Stock Transfer: Warehouse -> Vehicle
    for (const item of routeData.loadedStock) {
      if (item.quantity > 0) {
        // Remove from Warehouse (Legacy & Balance)
        await adjustStock(item.productId, -item.quantity, `Loaded for Route ${newRoute.id}`, MAIN_WAREHOUSE_ID);
        // Add to Vehicle
        if (vehicleLoc) {
          await adjustLocationStock(item.productId, item.quantity, vehicleLoc.id);
        }
      }
    }

    setRoutes([newRoute, ...routes]);
    addNotification(`Route dispatched: ${getVehicleName(routeData.vehicleId)} inventory locked.`,"success");
  };

 const reconcileRoute = async (routeId, finalOdometer, returnedStock, actualCash) => {
    const route = routes.find(r => r.id === routeId);
    if (!route) return;

    const updatedRoute = {
      ...route,
      status: 'COMPLETED',
      final_odometer: finalOdometer,
      actual_cash: actualCash,
      reconciled_at: new Date().toISOString()
    };

    if (isSupabaseConfigured) {
      const { error: routeError} = await supabase.from('routes').upsert(updatedRoute);
      if (routeError) {
        console.error("Error reconciling route:", routeError);
        return;
      }
    }

    // Find Vehicle Location
    const vehicleLoc = inventoryLocations.find(l => l.reference_id === route.vehicleId);

    // Stock Return: Vehicle -> Warehouse
    for (const item of returnedStock) {
      if (item.quantity > 0) {
        await adjustStock(item.productId, item.quantity, `Returned from Route ${routeId}`, MAIN_WAREHOUSE_ID);
        if (vehicleLoc) {
          await adjustLocationStock(item.productId, -item.quantity, vehicleLoc.id);
        }
      }
    }

    // Cash Flow: record per-stop client payments + Day Book entry
    if (isSupabaseConfigured && actualCash > 0) {
      const today = new Date().toISOString().split('T')[0];
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Fetch route stops with cash collected
      const { data: stops, error: stopsErr } = await supabase
        .from('route_stops')
        .select('id, client_id, client_name, cash_collected')
        .eq('route_id', routeId)
        .eq('tenant_id', currentTenantId)
        .gt('cash_collected', 0);

      if (stopsErr) {
        console.error('reconcileRoute: fetch stops error', stopsErr);
      }

      // 2. Insert client_payments for each stop
      let totalCash = 0;
      if (stops && stops.length > 0) {
        const vehicleName = getVehicleName(route.vehicleId);
        const paymentRows = stops.map(stop => ({
          id: generateUUID(),
          tenant_id: currentTenantId,
          client_id: stop.client_id,
          amount: Number(stop.cash_collected),
          date: today,
          payment_method: 'CASH',
          notes: `Vehicle collection — ${vehicleName} — Route ${routeId}`,
          recorded_by: user?.id || null,
        }));
        const { error: payErr } = await supabase.from('client_payments').insert(paymentRows);
        if (payErr) console.error('reconcileRoute: client_payments insert error', payErr);
        totalCash = stops.reduce((s, st) => s + Number(st.cash_collected), 0);
      } else {
        // No stops data — use actualCash as total
        totalCash = Number(actualCash);
      }

      // 3. Update Day Book — add vehicle cash to total_sales for today
      if (totalCash > 0) {
        const { data: existingEntry } = await supabase
          .from('day_book')
          .select('*')
          .eq('tenant_id', currentTenantId)
          .eq('date', today)
          .maybeSingle();

        const vehicleName = getVehicleName(route.vehicleId);
        if (existingEntry) {
          const updated = {
            ...existingEntry,
            total_sales: (Number(existingEntry.total_sales) || 0) + totalCash,
          };
          const { error: dbErr } = await supabase.from('day_book').upsert(updated);
          if (dbErr) console.error('reconcileRoute: day_book update error', dbErr);
          else setDayBook(prev => prev.map(db => db.date === today ? updated : db));
        } else {
          const newEntry = {
            id: generateUUID(),
            tenant_id: currentTenantId,
            date: today,
            opening_balance: 0,
            closing_balance: totalCash,
            total_sales: totalCash,
            total_expenses: 0,
            is_closed: false,
            created_at: new Date().toISOString(),
          };
          const { error: dbErr } = await supabase.from('day_book').insert(newEntry);
          if (dbErr) console.error('reconcileRoute: day_book insert error', dbErr);
          else setDayBook(prev => [newEntry, ...prev]);
        }
        addNotification(`₹${totalCash.toLocaleString()} vehicle cash posted to Day Book & client accounts.`, 'success');
      }
    }

    setRoutes(routes.map(r => r.id === routeId ? updatedRoute : r));
    addNotification("Route reconciled: Remaining stock returned to warehouse.", "success");
  };

 // ========== PAYROLL ==========
 // addEmployee / updateEmployee / resetEmployeesDailyData moved to HRContext

 // Task 6: Purchases & Stock Integration
 // addPurchase moved to PurchasesContext

  // addSupplier / updateSupplier / deleteSupplier moved to PurchasesContext


 const resetEmployeesDailyData = async () => {
 if (!isSupabaseConfigured) {
 setEmployees(prev => prev.map(emp => ({ ...emp, daysWorked: 0, days_worked: 0})));
 addNotification("Days worked reset locally","success");
 return true;
}

 setSyncStatus('SYNCING');
 const { error} = await supabase
 .from('employees')
 .update({ days_worked: 0})
 .eq('status', 'ACTIVE');

 if (error) {
 console.error("Error resetting employee data:", error);
 setSyncStatus('ERROR');
 addNotification("Failed to reset daily data in cloud","error");
 return false;
}

 setEmployees(prev => prev.map(emp => emp.status === 'ACTIVE' ? { ...emp, daysWorked: 0, days_worked: 0} : emp));
 setSyncStatus('SYNCED');
 addNotification("All active staff days worked reset","success");
 return true;
};

 // Task 6: Purchases & Stock Integration (State moved to top)

 const addPurchase = async (purchase) => {
 const val = purchaseSchema.safeParse(purchase);
 if (!val.success) {
 addNotification("Validation failed:" + val.error.errors[0].message,"error");
 return false;
}

 const newPurchase = {
 id: generateRef('PUR'),
 date: purchase.date || todayISOInAppTZ(),
 linked_product_id: purchase.linked_product_id || null,
 quantity: Number(purchase.quantity) || 0,
 unit_cost: Number(purchase.unit_cost) || 0,
 total_cost: (Number(purchase.quantity) || 0) * (Number(purchase.unit_cost) || 0),
 supplier_id: purchase.supplier_id || null,
 supplier_name: purchase.supplier_name || 'Unspecified',
 payment_type: purchase.payment_type || 'cash',
 notes: purchase.notes || '',
 created_at: new Date().toISOString(),
 tenant_id: currentTenantId
};

 if (isSupabaseConfigured) {
 // Priority 4: Atomic Purchase via RPC
 const { error: rpcError} = await supabase.rpc('process_purchase', {
 p_id: newPurchase.id,
 p_product_id: newPurchase.linked_product_id,
 p_quantity: newPurchase.quantity,
 p_total_amount: newPurchase.total_cost,
 p_supplier_id: newPurchase.supplier_id || newPurchase.supplier_name,
 p_payment_type: newPurchase.payment_type,
 p_date: newPurchase.date,
 p_notes: newPurchase.notes,
 p_user_id: currentUser?.id,
 p_tenant_id: currentTenantId
});

  if (rpcError) {
    console.error("❌ Atomic Purchase Failed:", rpcError);
    // Fallback to legacy insert
    const { error: insertError } = await supabase.from('purchases').insert({
      id: newPurchase.id,
      product_id: newPurchase.linked_product_id,
      quantity: newPurchase.quantity,
      total_amount: newPurchase.total_cost,
      date: newPurchase.date,
      supplier_id: newPurchase.supplier_id,
      supplier_name: newPurchase.supplier_name,
      payment_type: newPurchase.payment_type,
      notes: newPurchase.notes,
      tenant_id: currentTenantId
    });
    
    if (insertError) {
      console.error("Error creating purchase fallback:", insertError);
      logError({
        module: 'Inventory',
        action: 'Add Purchase (Fallback)',
        error_code: insertError.code,
        error_message: insertError.message,
        severity: 'High'
      });
      addNotification("Failed to record purchase", "error");
      return false;
    }
  }
}

 // OPTIMISTIC UPDATE
 setPurchases(prev => [newPurchase, ...prev]);
 
 if (newPurchase.linked_product_id) {
 setProducts(prev => prev.map(p => 
 p.id === newPurchase.linked_product_id 
 ? { ...p, stock: (p.stock || 0) + newPurchase.quantity}
 : p
 ));
 addNotification(`Stock updated: +${newPurchase.quantity} units`,"success");
} else {
 addNotification("Purchase recorded","success");
}

 return true;
};

  const addSupplier = async (supplier) => {
    const id = `SUP-${Date.now()}`;
    const newSupplier = { ...supplier, id, created_at: new Date().toISOString(), tenant_id: currentTenantId };
    
    if (isSupabaseConfigured) {
      // CLEAN DB OBJECT
      const dbSupplier = {
        id,
        name: supplier.name,
        contact_person: supplier.contact_person,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        notes: supplier.notes || '',
        created_at: new Date().toISOString(),
        tenant_id: currentTenantId
      };
      
      const { error } = await supabase.from('suppliers').insert(dbSupplier);
      if (error) {
        console.error("Error adding supplier:", error);
        logError({
          module: 'Suppliers',
          action: 'Add Supplier',
          error_code: error.code,
          error_message: error.message,
          severity: 'High'
        });
        addNotification("Failed to save supplier to cloud", "error");
        return false;
      }
    }
    setSuppliers(prev => [newSupplier, ...prev]);
    return true;
  };

  const updateSupplier = async (updatedSupplier) => {
    if (isSupabaseConfigured) {
      const dbSupplier = {
        name: updatedSupplier.name,
        contact_person: updatedSupplier.contact_person,
        phone: updatedSupplier.phone,
        email: updatedSupplier.email,
        address: updatedSupplier.address,
        notes: updatedSupplier.notes || '',
        tenant_id: currentTenantId
      };
      
      const { error } = await supabase.from('suppliers')
        .update(dbSupplier)
        .eq('id', updatedSupplier.id)
        .eq('tenant_id', currentTenantId);

      if (error) {
        console.error("Error updating supplier:", error);
        logError({
          module: 'Suppliers',
          action: 'Update Supplier',
          error_code: error.code,
          error_message: error.message,
          severity: 'High'
        });
        addNotification(`Failed to update supplier: ${error.message}`, "error");
        return false;
      }
    }
    setSuppliers(prev => prev.map(s => s.id === updatedSupplier.id ? { ...s, ...updatedSupplier } : s));
    return true;
  };

  const deleteSupplier = async (supplierId) => {
   // DIAGNOSTIC LOG
   console.log(`[Suppliers] Intent: Delete. ID: ${supplierId}, Tenant: ${currentTenantId}`);
   
   if (isSupabaseConfigured) {
     const { error, count } = await supabase.from('suppliers')
        .delete({ count: 'exact' })
        .eq('id', supplierId)
        .eq('tenant_id', currentTenantId);

     if (error) {
       console.error("❌ Supplier Deletion REJECTED:", error);
       logError({
         module: 'Suppliers',
         action: 'Delete Supplier',
         error_code: error.code,
         error_message: error.message,
         severity: 'High'
       });
       return { success: false, error: error.message };
     }
     
     if (count === 0) {
       console.warn(`[Suppliers] Silent Fail: Row not found or RLS blocked. ID: ${supplierId}`);
       logError({
         module: 'Suppliers',
         action: 'Delete Supplier (Silent Fail)',
         error_code: 'ERR_ZERO_ROWS',
         error_message: `Database returned success but 0 rows were deleted. This usually means the row exists but RLS blocked the operation for Tenant: ${currentTenantId}`,
         severity: 'High'
       });
       return { success: false, error: "Deletion blocked or record not found." };
     }
   }
   
   setSuppliers(prev => prev.filter(s => s.id !== supplierId));
   return { success: true };
 };

  const deleteEmployee = async (empId) => {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('employees')
        .delete()
        .eq('id', empId)
        .eq('tenant_id', currentTenantId);

      if (error) {
        console.error("Error deleting employee from Supabase:", error);
        logError({
          module: 'Employees',
          action: 'Delete Employee',
          error_code: error.code,
          error_message: error.message,
          severity: 'Medium'
        });
        addNotification("Failed to delete employee from cloud", "error");
        return;
      }
    }
    setEmployees(employees.filter(e => e.id !== empId));
  };

  const processPayroll = async (payRun) => {
    const timestamp = new Date().toISOString();
    const newRecord = {
      ...payRun,
      id: payRun.id || `PAY-${Date.now()}`,
      processed_at: timestamp,
      processedAt: timestamp,
      processed_by: currentUser?.id
    };
    
    if (isSupabaseConfigured) {
      setSyncStatus('SYNCING');
      const payrollInserts = payRun.items.map(item => ({
        id: `PRL-${Date.now()}-${item.employeeId}`,
        employeeId: item.employeeId,
        amount: item.netPay,
        month: payRun.period,
        processed_at: timestamp,
        processed_by: currentUser?.id,
        tenant_id: currentTenantId
      }));
      
      const { error } = await supabase.from('payroll').insert(payrollInserts);
      if (error) {
        console.error("Error processing payroll in Supabase:", error);
        logError({
          module: 'Payroll',
          action: 'Process Payroll',
          error_code: error.code,
          error_message: error.message,
          severity: 'High'
        });
        setSyncStatus('ERROR');
        addNotification("Failed to process payroll in cloud", "error");
        return false;
      }
      setSyncStatus('SYNCED');

      // Audit: payroll run authorized. Capture totals + headcount, not individual amounts.
      const totalNet = payrollInserts.reduce((s, r) => s + Number(r.amount || 0), 0);
      logAuditEvent({
        action: AUDIT_ACTIONS.PAYROLL_PROCESS,
        entityType: 'payroll',
        entityId: newRecord.id,
        summary: `Processed payroll for ${payRun.period}: ${payrollInserts.length} employee(s), net ${totalNet.toFixed(2)}`,
        metadata: {
          period: payRun.period,
          employee_count: payrollInserts.length,
          total_net: totalNet,
        },
      });
    }
    
    setPayrollRecords(prev => [newRecord, ...prev]);
    addNotification(`Payroll for ${payRun.period} authorized`, "success");
    return true;
  };

  const deletePayrollRecord = async (recordId) => {
    const target = payrollRecords.find(r => r.id === recordId) || null;

    if (isSupabaseConfigured) {
      const { error } = await supabase.from('payroll')
        .delete()
        .eq('id', recordId)
        .eq('tenant_id', currentTenantId);

      if (error) {
        console.error("Error deleting payroll record from Supabase:", error);
        logError({
          module: 'Payroll',
          action: 'Delete Payroll',
          error_code: error.code,
          error_message: error.message,
          severity: 'Medium'
        });
        addNotification("Cloud Sync Delayed: Record removed locally", "warning");
      } else {
        logAuditEvent({
          action: AUDIT_ACTIONS.PAYROLL_DELETE,
          entityType: 'payroll',
          entityId: recordId,
          summary: `Deleted payroll record ${recordId}${target?.period ? ` (${target.period})` : ''}`,
          metadata: {
            period: target?.period || target?.month || null,
            employee_count: Array.isArray(target?.items) ? target.items.length : null,
          },
        });
      }
    }
    setPayrollRecords(payrollRecords.filter(r => r.id !== recordId));
  };



 // updateDayBook / getDayBookForDate moved to FinanceContext

 // Redundant migration removed

 const updateBusinessProfile = async (profile) => {
    if (!isSupabaseConfigured) return;
    
    try {
      const payload = { ...profile, id: 'current', tenant_id: currentTenantId };
      const { error } = await supabase.from('business_profile').upsert(payload);
      
      if (error) {
        console.error("Error updating business profile in Supabase:", error);
        addNotification(`Cloud Profile Sync Failed: ${error.message}`, "error");
        return false;
      }
      
      setBusinessProfile(profile);
      cacheSet('business_profile', profile);
      addNotification("Business profile saved to cloud", "success");
      return true;
    } catch (err) {
      console.error("Exception in updateBusinessProfile:", err);
      addNotification("System error updating profile", "error");
      return false;
    }
  };

 // addExpenseCategory / updateExpenseCategory / deleteExpenseCategory moved to FinanceContext



 // Silent background refresh that updates state and cache without loading screens
 const refreshInBackground = async (userId) => {
 if (!isSupabaseConfigured) return;
 const targetTenantId = currentTenantId;
 if (!targetTenantId) { console.warn('[refreshInBackground] No tenant — skipping'); return; }
 try {
    console.log("🔄 Running silent background refresh...");
    const [
      { data: productsData},
      { data: clientsData},
      { data: salesData},
      { data: expensesData},
      { data: employeesData},
      { data: payrollData},
      { data: businessData},
      { data: dayBookData},
      { data: settingsData},
      { data: paymentsData},
      { data: usersData},
      { data: vehiclesData},
      { data: movementData},
      { data: routesData},
      { data: purchasesData},
      { data: suppliersData},
      { data: categoriesData},
      { data: locationsData},
      { data: balancesData},
      { data: invoicesData}
    ] = await Promise.all([
      supabase.from('products').select('*').eq('tenant_id', targetTenantId),
      supabase.from('clients').select('*').eq('tenant_id', targetTenantId).is('deleted_at', null),
      supabase.from('sales').select('*').eq('tenant_id', targetTenantId).order('date', { ascending: false }).limit(500),
      supabase.from('expenses').select('*').eq('tenant_id', targetTenantId).order('date', { ascending: false }).limit(500),
      supabase.from('employees').select('*').eq('tenant_id', targetTenantId),
      supabase.from('payroll').select('*').eq('tenant_id', targetTenantId).order('processed_at', { ascending: false }).limit(100),
      supabase.from('business_profile').select('*').eq('tenant_id', targetTenantId).maybeSingle(),
      supabase.from('day_book').select('*').eq('tenant_id', targetTenantId).order('date', { ascending: false }).limit(31),
      supabase.from('settings').select('*').eq('tenant_id', targetTenantId),
      supabase.from('client_payments').select('*').eq('tenant_id', targetTenantId).order('date', { ascending: false }).limit(500),
      supabase.from('users').select('*').eq('tenant_id', targetTenantId),
      supabase.from('vehicles').select('*').eq('tenant_id', targetTenantId),
      supabase.from('movement_log').select('*').eq('tenant_id', targetTenantId).order('date', { ascending: false }).limit(200),
      supabase.from('routes').select('*').eq('tenant_id', targetTenantId).order('date', { ascending: false }).limit(100),
      supabase.from('purchases').select('*').eq('tenant_id', targetTenantId).order('date', { ascending: false }).limit(200),
      supabase.from('suppliers').select('*').eq('tenant_id', targetTenantId).order('name', { ascending: true }),
      supabase.from('product_categories').select('*').eq('tenant_id', targetTenantId).order('name'),
      supabase.from('inventory_locations').select('*').eq('tenant_id', targetTenantId),
      supabase.from('inventory_balances').select('*').eq('tenant_id', targetTenantId),
      supabase.from('invoices').select('*').eq('tenant_id', targetTenantId).order('created_at', { ascending: false })
    ]);

 // Update State Silently
 if (productsData) setProducts(productsData);
 if (invoicesData) {
   setInvoices(invoicesData);
   cacheSet('invoices', invoicesData);
 }
 if (categoriesData) setProductCategories(categoriesData);
 if (clientsData) setClients(clientsData);
 if (salesData) setSales(salesData);
 if (expensesData) setExpenses(expensesData);
 if (usersData) setUsers(usersData);
 if (dayBookData) setDayBook(dayBookData);
 if (paymentsData) setClientPayments(paymentsData);
 if (suppliersData) setSuppliers(suppliersData);
 if (employeesData) {
 const mappedEmps = employeesData.map(emp => ({
 ...emp,
 basePay: emp.basePay ?? emp.salary ?? 0,
 dailyRate: emp.daily_rate ?? 0,
 daysWorked: emp.days_worked ?? 0,
 department: emp.department ?? emp.role ?? 'Operations',
 position: emp.position ?? emp.role ?? 'Standard Associate'
}));
 setEmployees(mappedEmps);
}
 if (payrollData) {
 const grouped = payrollData.reduce((acc, rec) => {
 const period = rec.month || 'Unknown';
 if (!acc[period]) {
 acc[period] = {
 id: `RUN-${period}`, period, processedAt: rec.processed_at, processed_at: rec.processed_at,
 totalBase: 0, totalOvertime: 0, totalBonus: 0, totalDeductions: 0, totalNet: 0, totalEmployees: 0, items: []
};
}
 acc[period].items.push({ employeeId: rec.employeeId, employeeName: getEmployeeName(rec.employeeId), netPay: rec.amount});
 acc[period].totalNet += rec.amount;
 acc[period].totalEmployees += 1;
 return acc;
}, {});
 const records = Object.values(grouped);
 setPayrollRecords(records);
}
 if (vehiclesData) setVehicles(vehiclesData);
 if (routesData) setRoutes(routesData);
 if (purchasesData) setPurchases(purchasesData);
 if (businessData) setBusinessProfile(businessData);
 
 if (movementData) {
 const mappedLog = movementData.map(log => ({
 ...log,
 productId: log.product_id, productName: log.product_name,
 userId: log.user_id, createdAt: log.created_at || log.date
}));
 setMovementLog(mappedLog);
}
 if (settingsData) {
 const categories = settingsData.find(s => s.key === 'expense_categories');
 if (categories) setExpenseCategories(categories.value);
}
 
 setSyncStatus('SYNCED');
 setLastSyncedAt(new Date().toISOString());
 console.log("✅ Background refresh complete.");
} catch (err) {
 console.error("❌ Background refresh error:", err);
}
};

 // Supabase Sync & Init (REUSABLE)
 // Supabase Sync & Init (REUSABLE)
 const initializeApp = async (force = false) => {
 if (initializingRef.current) return;
 initializingRef.current = true;

 const isSilentSync = !force;
 setInitError(null);

 if (!isSupabaseConfigured) {
 setLoading(false);
 initializingRef.current = false;
 return;
}

 // --- CACHE FIRST LOAD ---
 const cachedProducts = cacheGet('products');
 if (cachedProducts && !force) {
 console.log("📦 Restoring from Cache...");
 
 // Restore all major states from cache if products exist (proxy for app data)
 setProducts(cachedProducts);
 const cCategories = cacheGet('product_categories'); if (cCategories) setProductCategories(cCategories);
 const cClients = cacheGet('clients'); if (cClients) setClients(cClients);
 const cSales = cacheGet('sales'); if (cSales) setSales(cSales);
 const cExpenses = cacheGet('expenses'); if (cExpenses) setExpenses(cExpenses);
 const cUsers = cacheGet('users'); if (cUsers) setUsers(cUsers);
 const cEmployees = cacheGet('employees'); if (cEmployees) setEmployees(cEmployees);
 const cPayroll = cacheGet('payroll'); if (cPayroll) setPayrollRecords(cPayroll);
 const cBusiness = cacheGet('business_profile'); if (cBusiness) setBusinessProfile(cBusiness);
 const cDayBook = cacheGet('day_book'); if (cDayBook) setDayBook(cDayBook);
 const cPayments = cacheGet('client_payments'); if (cPayments) setClientPayments(cPayments);
 const cVehicles = cacheGet('vehicles'); if (cVehicles) setVehicles(cVehicles);
 const cRoutes = cacheGet('routes'); if (cRoutes) setRoutes(cRoutes);
 const cPurchases = cacheGet('purchases'); if (cPurchases) setPurchases(cPurchases);
 const cSuppliers = cacheGet('suppliers'); if (cSuppliers) setSuppliers(cSuppliers);
 const cMovement = cacheGet('movement_log'); if (cMovement) setMovementLog(cMovement);
 const cExpCategories = cacheGet('expense_categories'); if (cExpCategories) setExpenseCategories(cExpCategories);
 const cLocations = cacheGet('inventory_locations'); if (cLocations) setInventoryLocations(cLocations);
 const cBalances = cacheGet('inventory_balances'); if (cBalances) setInventoryBalances(cBalances);
 const cInvoices = cacheGet('invoices');       console.log("Restoring from cache, then refreshing in background...");
      await refreshInBackground();

      setLoading(false);
      initializingRef.current = false;
      appInitialized.current = true;
      return;
    }

    const targetTenantId = typeof force === 'string' ? force : currentTenantId;
    try {
      console.log("Initializing app for tenant (Full Fetch):", targetTenantId);
      const [
        { data: productsData },
        { data: categoriesData },
        { data: clientsData },
        { data: salesData },
        { data: expensesData },
        { data: employeesData },
        { data: payrollData },
        { data: businessData },
        { data: dayBookData },
        { data: settingsData },
        { data: paymentsData },
        { data: usersData },
        { data: vehiclesData },
        { data: movementData },
        { data: routesData },
        { data: purchasesData },
        { data: suppliersData },
        { data: locationsData },
        { data: balancesData },
        { data: invoicesData }
      ] = await Promise.all([
        supabase.from('products').select('*').eq('tenant_id', targetTenantId),
        supabase.from('product_categories').select('*').eq('tenant_id', targetTenantId).order('name'),
        supabase.from('clients').select('*').eq('tenant_id', targetTenantId).is('deleted_at', null),
        supabase.from('sales').select('*').eq('tenant_id', targetTenantId).order('date', { ascending: false }).limit(500),
        supabase.from('expenses').select('*').eq('tenant_id', targetTenantId).order('date', { ascending: false }).limit(500),
        supabase.from('employees').select('*').eq('tenant_id', targetTenantId),
        supabase.from('payroll').select('*').eq('tenant_id', targetTenantId).order('processed_at', { ascending: false }).limit(100),
        supabase.from('business_profile').select('*').eq('tenant_id', targetTenantId).maybeSingle(),
        supabase.from('day_book').select('*').eq('tenant_id', targetTenantId).order('date', { ascending: false }).limit(31),
        supabase.from('settings').select('*').eq('tenant_id', targetTenantId),
        supabase.from('client_payments').select('*').eq('tenant_id', targetTenantId).order('date', { ascending: false }).limit(500),
        supabase.from('users').select('*').eq('tenant_id', targetTenantId),
        supabase.from('vehicles').select('*').eq('tenant_id', targetTenantId),
        supabase.from('movement_log').select('*').eq('tenant_id', targetTenantId).order('date', { ascending: false }).limit(200),
        supabase.from('routes').select('*').eq('tenant_id', targetTenantId).order('date', { ascending: false }).limit(100),
        supabase.from('purchases').select('*').eq('tenant_id', targetTenantId).order('date', { ascending: false }).limit(200),
        supabase.from('suppliers').select('*').eq('tenant_id', targetTenantId).order('name', { ascending: true }),
        supabase.from('inventory_locations').select('*').eq('tenant_id', targetTenantId),
        supabase.from('inventory_balances').select('*').eq('tenant_id', targetTenantId),
        supabase.from('invoices').select('*').eq('tenant_id', targetTenantId).order('created_at', { ascending: false })
      ]);
 
 if (productsData) setProducts(productsData);
 if (categoriesData) setProductCategories(categoriesData);
 if (clientsData) setClients(clientsData);
 if (salesData) setSales(salesData);
 if (expensesData) setExpenses(expensesData);
 if (usersData) setUsers(usersData);
 if (dayBookData) setDayBook(dayBookData);
 if (paymentsData) setClientPayments(paymentsData);
   if (suppliersData) setSuppliers(suppliersData);
  if (invoicesData) {
    setInvoices(invoicesData);
    cacheSet('invoices', invoicesData);
  }

  if (locationsData) setInventoryLocations(locationsData);
  if (balancesData) setInventoryBalances(balancesData);

 
 if (employeesData) {
 const mappedEmps = employeesData.map(emp => ({
 ...emp,
 basePay: emp.basePay ?? emp.salary ?? 0,
 dailyRate: emp.daily_rate ?? 0,
 daysWorked: emp.days_worked ?? 0,
 department: emp.department ?? emp.role ?? 'Operations',
 position: emp.position ?? emp.role ?? 'Standard Associate'
}));
 setEmployees(mappedEmps);
}

 if (payrollData) {
 const grouped = payrollData.reduce((acc, rec) => {
 const period = rec.month || 'Unknown';
 if (!acc[period]) {
 acc[period] = {
 id: `RUN-${period}`, period, processedAt: rec.processed_at, processed_at: rec.processed_at,
 totalBase: 0, totalOvertime: 0, totalBonus: 0, totalDeductions: 0, totalNet: 0, totalEmployees: 0, items: []
};
}
 acc[period].items.push({ employeeId: rec.employeeId, employeeName: getEmployeeName(rec.employeeId), netPay: rec.amount});
 acc[period].totalNet += rec.amount;
 acc[period].totalEmployees += 1;
 return acc;
}, {});
 const records = Object.values(grouped);
 setPayrollRecords(records);
}

 if (vehiclesData) setVehicles(vehiclesData);
 if (routesData) setRoutes(routesData);
 if (purchasesData) setPurchases(purchasesData);
 if (businessData) setBusinessProfile(businessData);
 
 if (movementData) {
 const mappedLog = movementData.map(log => ({
 ...log,
 productId: log.product_id, productName: log.product_name,
 userId: log.user_id, createdAt: log.created_at || log.date
}));
 setMovementLog(mappedLog);
}
 
 if (settingsData) {
 const categories = settingsData.find(s => s.key === 'expense_categories');
 if (categories) { setExpenseCategories(categories.value); cacheSet('expense_categories', categories.value);}

 const maintenance = settingsData.find(s => s.key === 'maintenance_mode');
 if (maintenance && maintenance.value) {
 setIsMaintenance(maintenance.value.enabled || false);
 setMaintenanceMessage(maintenance.value.message || 'System under maintenance.');
}
}
 
 console.log("🏁 Initialization Complete.");
 appInitialized.current = true;
} catch (err) {
 console.error("❌ Initialization error:", err);
 setInitError(err.message ||"An unexpected error occurred during initialization.");
} finally {
 setLoading(false);
 initializingRef.current = false;
}
};





 // Initial Session Resolver & Visibility Handler
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsSyncComplete(true);
      return;
    }

 // 1. Resolve session immediately on mount
 const initSession = async () => {
     console.log("🕵️ [initSession] Primary initialization sequence started.");
     try {
       const { data: { session}} = await supabase.auth.getSession();
       console.log("🔑 [initSession] Auth session resolved:", session ? "FOUND" : "NOT FOUND");
      if (session) {
        setAuthSession(session);
        const { data: profile} = await supabase.from('users').select('*').eq('id', session.user.id).maybeSingle();
        if (profile) {
          setCurrentUser(profile);
          
          let tenantToInit = null;
          // Check if we are impersonating - if so, re-fetch the tenant to ensure we have the LATEST plan/status
          const impersonated = sessionStorage.getItem('nexus_impersonated_tenant');
          if (impersonated) {
            try {
              const tObj = JSON.parse(impersonated);
              tenantToInit = tObj;
              const { data: latestTenant } = await supabase.from('tenants').select('*').eq('id', tObj.id).maybeSingle();
              if (latestTenant) {
                setCurrentTenant(latestTenant);
                tenantToInit = latestTenant;
                sessionStorage.setItem('nexus_impersonated_tenant', JSON.stringify(latestTenant));
              } else {
                setCurrentTenant(tObj);
              }
            } catch (e) {
              console.warn("Nexus Sync Failed, using cache:", e);
            }
          } else {
            const resolved = await resolveTenant(profile);
            tenantToInit = resolved;
          }
           // Pass resolved tenant ID directly to initializeApp to avoid stale state closure issues
          if (tenantToInit?.id) {
            console.log("🏭 [initSession] Launching app initialization for tenant:", tenantToInit.id);
            await initializeApp(tenantToInit.id);
          } else {
            console.warn("⚠️ [initSession] Profile found but no tenant association.");
            setLoading(false);
          }
        } else {
          console.warn("⚠️ [initSession] Session found but no profile entry.");
          setLoading(false);
        }
      } else {
        console.log("👋 [initSession] No active session, skipping app init.");
        setLoading(false);
      }
    } catch (err) {
      console.error("❌ Session Init Error:", err);
      setInitError("Critical initialization failed. Please check your connection.");
    } finally {
      console.log("🏁 [initSession] Initialization complete. isSyncComplete -> true");
      setIsSyncComplete(true);
      setLoading(false);
    }
 };
 initSession();

 // 2. Handle Document Visibility (Silent Sync)
 const handleVisibilityChange = () => {
 if (document.visibilityState === 'visible' && appInitialized.current) {
 // If cache for products is expired, refresh silently
 const cached = cacheGet('products');
 if (!cached) {
 refreshInBackground();
}
}
};

 document.addEventListener('visibilitychange', handleVisibilityChange);

 // 3. Listen for Auth Changes
 const { data: { subscription}} = supabase.auth.onAuthStateChange(async (event, session) => {
 console.log("🔔 Auth Event:", event);
 
 if (session?.user) {
 setAuthSession(session);
 
 // ONLY FETCH PROFILE IF WE DON'T HAVE IT
 if (!currentUser) {
 const { data: profile} = await supabase.from('users').select('*').eq('id', session.user.id).maybeSingle();
 
 if (profile) {
 setCurrentUser(profile);
 await resolveTenant(profile);
} else {
 // AUTO-PROVISION SUPERUSER if first time login for owner.
 // Allowlist is configured via VITE_BOOTSTRAP_ADMIN_EMAILS (comma-separated).
 // Non-listed emails are provisioned as STAFF and can be elevated later
 // through the normal Users admin UI.
 const emailLower = (session.user.email || '').toLowerCase();
 const isSuperUser = BOOTSTRAP_ADMIN_EMAILS.has(emailLower);
 const newUserProfile = {
 id: session.user.id,
 email: session.user.email,
 name: session.user.email.split('@')[0],
 roles: isSuperUser ? ['GLOBAL_ADMIN', 'OWNER'] : ['STAFF'],
 status: 'ACTIVE'
};
 setCurrentUser(newUserProfile);
 
 // Optionally persist to DB if superuser
 if (isSuperUser) {
 try {
 await supabase.from('users').upsert(newUserProfile);
} catch (e) {
 console.error("Auto-provisioning exception:", e.message);
}
}
}
}

 if (event === 'SIGNED_IN') {
 if (!appInitialized.current) {
 initializeApp();
}
} else if (event === 'TOKEN_REFRESHED') {
 // SILENT: Only update the session/user object, do not re-fetch data
 console.log("🔐 Token refreshed silently");
}
} else if (event === 'SIGNED_OUT') {
 cacheClear();
 setAuthSession(null);
 setCurrentUser(null);
 setCurrentTenant(null);
 appInitialized.current = false;
 setLoading(false);
 if (typeof window !== 'undefined') {
 window.location.href = '/login';
}
}
});

 return () => {
 subscription.unsubscribe();
 document.removeEventListener('visibilitychange', handleVisibilityChange);
};
}, []);

 // Initial load removed (handled in auth useEffect above)




 const value = {
 currentUser, session: authSession || currentUser, isOwner, isStaff, login, logout,
 // Multi-tenancy
 currentTenant, currentTenantId, isModuleAllowed,
 isImpersonating, impersonateTenant, stopImpersonating,
 syncStatus, isOnline, lastSyncedAt,
 businessProfile, updateBusinessProfile, // Data
 productCategories, addProductCategory, updateProductCategory, deleteProductCategory,
 products, addProduct, updateProduct, deleteProduct, adjustStock,
 inventoryLocations, inventoryBalances, adjustLocationStock, transferStock, MAIN_WAREHOUSE_ID, // Multi-location
  clients, addClient, updateClient, deleteClient,
  invoices, createInvoice, markInvoicePaid,
  sales, orders, setOrders, placeSale, updateSale, deleteSale, settleSale,
 // Aligned aliases for backward compatibility (optional but helpful)
 addShop: addClient, updateShop: updateClient, deleteShop: deleteClient,
 placeOrder: placeSale, updateOrder: updateSale, deleteOrder: deleteSale, settleOrder: settleSale,
 expenses, addExpense, updateExpense, deleteExpense,
 expenseCategories, addExpenseCategory, updateExpenseCategory, deleteExpenseCategory,
 movementLog,
 vehicles, addVehicle, updateVehicle, deleteVehicle,
 routes, dispatchRoute, reconcileRoute,
 users, addUser, updateUser, deleteUser,
 hasRole, hasPermission, isViewOnly,
 getUserName, getVehicleName, getClientName, getShopName: getClientName, getEmployeeName,
 employees, addEmployee, updateEmployee, deleteEmployee, resetEmployeesDailyData,
 payrollRecords, processPayroll, deletePayrollRecord,
 purchases, addPurchase,
 suppliers, addSupplier, updateSupplier, deleteSupplier,
 dayBook, updateDayBook, getDayBookForDate,
 recordClientPayment, clientPayments,
 isMaintenance, maintenanceMessage, setIsMaintenance,
 notifications, addNotification,
 DEFAULT_PERMISSIONS, MODULES_CONFIG,
 loading, initError, isSyncComplete, migrateLocalToSupabase, resetAndSeedLocal, resetAndSeedCloud
};

 return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const AppProvider = ({ children }) => (
  <AuthProvider>
    <TenantProvider>
      <SyncProvider>
        <NotificationProvider>
          <InventoryProvider>
            <FinanceProvider>
              <SalesProvider>
                <HRProvider>
                  <PurchasesProvider>
                    <AppProviderInner>{children}</AppProviderInner>
                  </PurchasesProvider>
                </HRProvider>
              </SalesProvider>
            </FinanceProvider>
          </InventoryProvider>
        </NotificationProvider>
      </SyncProvider>
    </TenantProvider>
  </AuthProvider>
);

