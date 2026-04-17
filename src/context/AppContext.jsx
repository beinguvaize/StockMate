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
import { generateUUID } from '../lib/utils';

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
          const errorMessage = invokeError.message || JSON.stringify(invokeError);
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
    }

    setUsers(prev => [...prev, newUser]);
    addNotification(`${userData.name} added locally.`, "warning");
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
 addNotification("Cloud Sync Delayed: Profile updated locally","warning");
 // Fall through
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

  // updateSale/deleteSale/settleSale moved to SalesContext

 // Task 4: Mark as Paid for Client (Enhanced with Invoice Selection)
  // recordClientPayment moved to SalesContext

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
  addNotification(`Cloud Sync Delayed: ${error.message}. Local changes saved.`,"warning");
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
      addNotification(`Cloud Sync Delayed: Product removed locally`, "warning");
      // Fall through
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
 addNotification("Cloud Sync Delayed: Vehicle saved locally","warning");
 // Fall through
}
}
 setVehicles([...vehicles, newVehicle]);
};

 const updateVehicle = async (updated) => {
 if (isSupabaseConfigured) {
 const { error} = await supabase.from('vehicles').upsert({ ...updated, tenant_id: currentTenantId });
 if (error) {
 console.error("Error updating vehicle in Supabase:", error);
 addNotification("Cloud Sync Delayed: Changes saved locally","warning");
 // Fall through
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

    // 3. Formal Stock Return: Vehicle -> Warehouse
    for (const item of returnedStock) {
      if (item.quantity > 0) {
        // Return to Warehouse
        await adjustStock(item.productId, item.quantity, `Returned from Route ${routeId}`, MAIN_WAREHOUSE_ID);
        // Remove from Vehicle
        if (vehicleLoc) {
          await adjustLocationStock(item.productId, -item.quantity, vehicleLoc.id);
        }
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

  // deleteEmployee / processPayroll / deletePayrollRecord moved to HRContext


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

