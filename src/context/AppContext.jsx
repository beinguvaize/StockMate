import React, { createContext, useContext, useState, useEffect, useRef} from 'react';
import { supabase, isSupabaseConfigured} from '../lib/supabase';
import { 
 saleSchema, expenseSchema, purchaseSchema, 
 employeeSchema, clientSchema, dayBookSchema 
} from '../lib/validation';
import { cacheSet, cacheGet, cacheClear} from '../lib/cache';

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

const INITIAL_BUSINESS = {
 name: 'Ledgr ERP',
 country: 'India',
 currency: 'INR',
 currencySymbol: '₹',
 lowStockThreshold: 10,
 pan_no: '',
 gst_no: '',
 bank_name: '',
 account_no: '',
 ifsc_code: '',
 upi_id: '',
 email: '',
 website: '',
 phone: '',
 address: ''
};

const INITIAL_EXPENSE_CATEGORIES = ['General', 'Inventory', 'Logistics', 'Payroll', 'Utilities', 'Marketing', 'Rent', 'Other'];

// Available role definitions
export const DEFAULT_PERMISSIONS = {
 inventory: { view: true, edit: false},
 sales: { view: true, edit: true},
 purchases: { view: true, edit: false},
 expenses: { view: true, edit: false},
 clients: { view: true, edit: true},
 suppliers: { view: true, edit: false},
 vehicles: { view: true, edit: false},
 reports: { view: false, edit: false},
 payroll: { view: false, edit: false},
 users: { view: false, edit: false},
 settings: { view: false, edit: false},
 daybook: { view: true, edit: true}
};

export const MODULES_CONFIG = [
 { key: 'inventory', label: 'Inventory Management', icon: 'Package'},
 { key: 'sales', label: 'Sales & Invoicing', icon: 'ShoppingCart'},
 { key: 'purchases', label: 'Purchases (Stock-In)', icon: 'ShoppingBag'},
 { key: 'expenses', label: 'Expense Tracking', icon: 'Wallet'},
 { key: 'clients', label: 'Client Directory', icon: 'Users'},
 { key: 'suppliers', label: 'Supplier Network', icon: 'Truck'},
 { key: 'vehicles', label: 'Fleet Management', icon: 'Truck'},
 { key: 'reports', label: 'Business Intelligence', icon: 'BarChart3'},
 { key: 'payroll', label: 'HR & Payroll', icon: 'Banknote'},
 { key: 'users', label: 'Personnel & Permissions', icon: 'UserPlus'},
 { key: 'settings', label: 'Global Settings', icon: 'Settings'},
 { key: 'daybook', label: 'Day Book', icon: 'BookOpen'}
];

export const AVAILABLE_ROLES = [
 { id: 'GLOBAL_ADMIN', label: 'Global Admin', color: 'bg-purple-100 text-purple-700'},
 { id: 'OWNER', label: 'Owner/Manager', color: 'bg-blue-100 text-blue-700'},
 { id: 'STAFF', label: 'Staff/Operator', color: 'bg-gray-100 text-gray-700'}
];

export const generateUUID = () => {
 if (typeof crypto !== 'undefined' && crypto.randomUUID) {
 return crypto.randomUUID();
}
 return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
 var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
 return v.toString(16);
});
};

export const AppProvider = ({ children}) => {
 const [loading, setLoading] = useState(true);
 const [initError, setInitError] = useState(null);
 
 // Auth Session — relies entirely on Supabase auth, no local persistence
 const [currentUser, setCurrentUser] = useState(null);

 // Core Data States (100% Cloud - No Local Initializers)
 const [users, setUsers] = useState([]);
 const [businessProfile, setBusinessProfile] = useState({});
 const [products, setProducts] = useState([]);
 const [clients, setClients] = useState([]);
 const [clientPayments, setClientPayments] = useState([]);
 const [sales, setSales] = useState([]);
 const [expenses, setExpenses] = useState([]);
 const [isMaintenance, setIsMaintenance] = useState(false);
 const [maintenanceMessage, setMaintenanceMessage] = useState('');
 const [movementLog, setMovementLog] = useState([]);
 const [vehicles, setVehicles] = useState([]);
 const [routes, setRoutes] = useState([]);
 const [employees, setEmployees] = useState([]);
 const [payrollRecords, setPayrollRecords] = useState([]);
 const [purchases, setPurchases] = useState([]);
 const [suppliers, setSuppliers] = useState([]);
 const [mechanicPayments, setMechanicPayments] = useState([]);
 const [dayBook, setDayBook] = useState([]);
 const [expenseCategories, setExpenseCategories] = useState(['Petrol', 'Food', 'Salary', 'Rent', 'Electricity', 'Water', 'Maintenance', 'Stationery', 'Travel', 'Marketing', 'Tax', 'Others']);
 
 // --- Sync & Connectivity States ---
 const [syncStatus, setSyncStatus] = useState('SYNCED'); // 'SYNCED', 'SYNCING', 'ERROR', 'OFFLINE'
 const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
 const [lastSyncedAt, setLastSyncedAt] = useState(new Date().toISOString());

 // Monitor Online/Offline status
 useEffect(() => {
 const handleOnline = () => {
 setIsOnline(true);
 setSyncStatus(prev => prev === 'OFFLINE' ? 'SYNCED' : prev);
};
 const handleOffline = () => {
 setIsOnline(false);
 setSyncStatus('OFFLINE');
};

 window.addEventListener('online', handleOnline);
 window.addEventListener('offline', handleOffline);
 return () => {
 window.removeEventListener('online', handleOnline);
 window.removeEventListener('offline', handleOffline);
};
}, []);

 // Heartbeat check for Supabase connectivity
 useEffect(() => {
 if (!isSupabaseConfigured || !isOnline) return;

 const interval = setInterval(async () => {
 try {
 const { error} = await supabase.from('settings').select('key').limit(1);
 if (error) throw error;
 setSyncStatus(prev => prev === 'ERROR' ? 'SYNCED' : prev);
} catch (err) {
 console.warn("Supabase heartbeat failed:", err);
 setSyncStatus('ERROR');
}
}, 30000); // Every 30 seconds

 return () => clearInterval(interval);
}, [isOnline]);

 // Aliases
 const orders = sales;
 const setOrders = setSales;

 const [notifications, setNotifications] = useState([]);

 const addNotification = (message, type = 'success') => {
 const id = `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
 setNotifications(prev => [{ id, message, type, date: new Date().toISOString()}, ...prev].slice(0, 5));
 
 // Auto-remove after 5 seconds
 setTimeout(() => {
 setNotifications(prev => prev.filter(n => n.id !== id));
}, 5000);
};

 // Data Persistence (100% CLOUD — No Local Storage)

 const initializingRef = useRef(false);
 const appInitialized = useRef(false);


 // Data Actions (LOCAL ONLY)
 const login = async (email, password) => {
 if (isSupabaseConfigured) {
 const { data, error} = await supabase.auth.signInWithPassword({ email, password});
 if (error) {
 return { success: false, error: error.message};
}
 return { success: true, user: data.user};
}
 // Fallback for mock mode
 const user = users.find(u => u.email === email && (password === 'password' || password === 'admin123'));
 if (user) {
 setCurrentUser(user);
 return { success: true};
}
 return { success: false, error: 'Invalid local credentials'};
};

 const logout = async () => {
 try {
 setLoading(true);
 cacheClear(); // Immediate clear
 if (isSupabaseConfigured) {
 await supabase.auth.signOut();
}
} catch (e) {
 console.error("Logout error:", e);
} finally {
 setAuthSession(null);
 setCurrentUser(null);
 appInitialized.current = false;
 setLoading(false);
 if (typeof window !== 'undefined') {
 window.location.href = '/login';
}
}
};


 const addUser = async (userData) => {
 const newUser = {
 id: userData.id || generateUUID(),
 name: userData.name,
 email: userData.email,
 roles: userData.roles || [userData.role || 'STAFF'],
 status: 'ACTIVE',
 permissions: userData.permissions || { ...DEFAULT_PERMISSIONS}
};

 if (isSupabaseConfigured && userData.password) {
 // Refactored to use official Supabase SDK for Edge Function invocation
 try {
 const { data: result, error: invokeError} = await supabase.functions.invoke('dynamic-service', {
 body: {
 email: userData.email,
 password: userData.password,
 name: userData.name,
 roles: userData.roles || ['STAFF'],
 permissions: userData.permissions || { ...DEFAULT_PERMISSIONS}
}
});

 if (invokeError) {
 console.error("❌ Staff Creation Failed:", invokeError);
 addNotification(`Staff creation failed: ${invokeError.message}`,"error");
 return false;
}

 const createdUser = { ...newUser, id: result.id};
 setUsers(prev => [...prev, createdUser]);
 addNotification(`${userData.name} added! They can now log in with their email & password.`,"success");
 return true;

} catch (err) {
 console.error("❌ Edge Function Unreachable:", err);
 addNotification("Edge function unreachable — saving profile only. Add them in Supabase Auth manually for login access.","warning");
 // Fall through to profile-only save below
}
}

 // Fallback: save profile only (no auth account)
 if (isSupabaseConfigured) {
 setSyncStatus('SYNCING');
 const { error: profileError} = await supabase.from('users').upsert(newUser);
 if (profileError) {
 console.error("Error adding user:", profileError);
 setSyncStatus('ERROR');
 addNotification(`Failed to save staff profile: ${profileError.message}`,"error");
 return false;
}
 setSyncStatus('SYNCED');
 setLastSyncedAt(new Date().toISOString());
}

 setUsers(prev => [...prev, newUser]);
 addNotification(`${userData.name} added! (Note: no login account created — add them in Supabase Auth to give login access.)`,"warning");
 return true;
};

 const updateUser = async (updatedUser) => {
 if (isSupabaseConfigured) {
 setSyncStatus('SYNCING');
 const { error} = await supabase.from('users').upsert(updatedUser);
 if (error) {
 console.error("Error updating user in Supabase:", error);
 setSyncStatus('ERROR');
 addNotification("Cloud Sync Delayed: Profile updated locally","warning");
 // Fall through
} else {
 setSyncStatus('SYNCED');
 setLastSyncedAt(new Date().toISOString());
}
}
 setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
};

 const deleteUser = async (userId) => {
 if (userId === currentUser?.id) return;
 
 if (isSupabaseConfigured) {
 setSyncStatus('SYNCING');
 const { error} = await supabase.from('users').delete().eq('id', userId);
 if (error) {
 console.error("Error deleting user from Supabase:", error);
 setSyncStatus('ERROR');
 addNotification("Cloud Sync Delayed: Staff removed locally","warning");
 // Fall through
} else {
 setSyncStatus('SYNCED');
 setLastSyncedAt(new Date().toISOString());
}
}

 setUsers(users.filter(u => u.id !== userId));
 addNotification('Staff record removed from system', 'success');
};

 const addClient = async (client) => {
 const val = clientSchema.safeParse(client);
 if (!val.success) {
 addNotification("Validation failed:" + val.error.errors[0].message,"error");
 return;
}
 const newClient = { 
 ...client, 
 id: client.id || `CLI-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
 outstanding_balance: client.outstanding_balance || 0
};
 
 const { status, ...dbClient} = newClient;

 if (isSupabaseConfigured) {
 setSyncStatus('SYNCING');
 const { error} = await supabase.from('clients').upsert(dbClient);
 if (error) {
 console.error("Error adding client to Supabase:", error);
 setSyncStatus('ERROR');
 addNotification(`Cloud Sync Delayed: Client saved locally`,"warning");
 // Fall through
} else {
 setSyncStatus('SYNCED');
 setLastSyncedAt(new Date().toISOString());
}
}
 setClients([newClient, ...clients]);
};

 const updateClient = async (updatedClient) => {
 const { status, ...dbClient} = updatedClient;

 if (isSupabaseConfigured) {
 setSyncStatus('SYNCING');
 const { error} = await supabase.from('clients').upsert(dbClient);
 if (error) {
 console.error("Error updating client in Supabase:", error);
 setSyncStatus('ERROR');
 addNotification("Failed to update client in cloud","error");
 return;
} else {
 setSyncStatus('SYNCED');
 setLastSyncedAt(new Date().toISOString());
}
}
 setClients(clients.map(c => c.id === updatedClient.id ? updatedClient : c));
};

 const deleteClient = async (clientId) => {
 if (isSupabaseConfigured) {
 setSyncStatus('SYNCING');
 const { error} = await supabase.from('clients').delete().eq('id', clientId);
 if (error) {
 console.error("Error deleting client from Supabase:", error);
 setSyncStatus('ERROR');
 addNotification("Cloud Sync Delayed: Client removed locally","warning");
 // Fall through
} else {
 setSyncStatus('SYNCED');
 setLastSyncedAt(new Date().toISOString());
}
}
 setClients(clients.filter(c => c.id !== clientId));
};

 const addExpense = async (expense) => {
 const val = expenseSchema.safeParse(expense);
 if (!val.success) {
 addNotification("Validation failed:" + val.error.errors[0].message,"error");
 return;
}
 const { title, date, routeId, splitType, notes, ...restExpense} = expense;
 const newExpense = { 
 ...restExpense, 
 id: expense.id || `EXP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, 
 date: date || new Date().toISOString(),
 route_id: routeId,
 split_type: splitType || null,
 note: title || notes || ''
};
 
 if (isSupabaseConfigured) {
 setSyncStatus('SYNCING');
 const { error} = await supabase.from('expenses').upsert(newExpense);
 if (error) {
 console.error("Error adding expense to Supabase:", error);
 setSyncStatus('ERROR');
 addNotification(`Cloud Sync Delayed: Expense saved locally`,"warning");
 // Fall through
} else {
 setSyncStatus('SYNCED');
 setLastSyncedAt(new Date().toISOString());
}
}

 setExpenses([newExpense, ...expenses]);
 addNotification(`Expense recorded: ${businessProfile?.currencySymbol || ''}${expense.amount}`, 'expense');
};

 const updateExpense = async (updatedExpense) => {
 if (isSupabaseConfigured) {
 setSyncStatus('SYNCING');
 const { error} = await supabase.from('expenses').upsert(updatedExpense);
 if (error) {
 console.error("Error updating expense in Supabase:", error);
 setSyncStatus('ERROR');
 addNotification("Cloud Sync Delayed: Expense updated locally","warning");
 // Fall through
} else {
 setSyncStatus('SYNCED');
 setLastSyncedAt(new Date().toISOString());
}
}
 setExpenses(expenses.map(e => e.id === updatedExpense.id ? updatedExpense : e));
 addNotification(`Expense updated: ${businessProfile?.currencySymbol || ''}${updatedExpense.amount}`, 'success');
};

 const deleteExpense = async (expenseId) => {
 if (isSupabaseConfigured) {
 setSyncStatus('SYNCING');
 const { error} = await supabase.from('expenses').delete().eq('id', expenseId);
 if (error) {
 console.error("Error deleting expense from Supabase:", error);
 setSyncStatus('ERROR');
 addNotification("Cloud Sync Delayed: Expense removed locally","warning");
 // Fall through
} else {
 setSyncStatus('SYNCED');
 setLastSyncedAt(new Date().toISOString());
}
}
 setExpenses(expenses.filter(e => e.id !== expenseId));
 addNotification('Expense record removed', 'success');
};

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
 userId: userId
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
 user_id: userId
};
 const { error} = await supabase.from('movement_log').insert(dbLog);
 if (error) {
 console.error("Error logging movement to Supabase:", error);
}
}

 setMovementLog(prev => [newLog, ...prev]);
};

 const reconcileSaleEffects = async (oldSale, newSale) => {
 const productDeltas = new Map();
 
 if (oldSale?.status === 'COMPLETED') {
 oldSale.items.forEach(i => productDeltas.set(i.productId, (productDeltas.get(i.productId) || 0) + i.quantity));
}
 if (newSale?.status === 'COMPLETED') {
 newSale.items.forEach(i => {
 productDeltas.set(i.productId, (productDeltas.get(i.productId) || 0) - i.quantity);
 
 // Recalculate COGS in the new sale using current product cost
 const product = products.find(p => p.id === i.productId);
 if (product) {
 i.cogs = (product.costPrice || 0) * i.quantity;
}
});
 // Update totalCogs
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

 // Apply Deltas to Local State
 if (productDeltas.size > 0) {
 setProducts(prev => prev.map(p => {
 const delta = productDeltas.get(p.id);
 return delta ? { ...p, stock: Math.max(0, p.stock + delta)} : p;
}));
}

 if (clientDeltas.size > 0) {
 setClients(prev => prev.map(c => {
 const delta = clientDeltas.get(c.id);
 return delta ? { ...c, outstanding_balance: Math.max(0, (c.outstanding_balance || 0) + delta)} : c;
}));
}

 // Persistence (Using current snapshot for now, ideally SQL increments)
 if (isSupabaseConfigured) {
 for (const [id, delta] of productDeltas) {
 const currentProduct = products.find(p => p.id === id);
 if (currentProduct) await supabase.from('products').update({ stock: Math.max(0, currentProduct.stock + delta)}).eq('id', id);
}
 for (const [id, delta] of clientDeltas) {
 const currentClient = clients.find(c => c.id === id);
 if (currentClient) await supabase.from('clients').update({ outstanding_balance: Math.max(0, (currentClient.outstanding_balance || 0) + delta)}).eq('id', id);
}
}
};

 const placeSale = async (clientId, cartItems, subtotal, discount, tax, totalAmount, customerInfo, paymentType = 'cash', routeId = null, status = 'COMPLETED', scheduledDate = null, salesmanNote = '') => {
 const val = saleSchema.safeParse({ clientId, items: cartItems, totalAmount, paymentMethod: paymentType});
 if (!val.success) {
 addNotification("Sale Validation failed:" + val.error.errors[0].message,"error");
 return;
}
 let totalCogs = 0;
 const updatedProducts = [...products];

 cartItems.forEach(item => {
 const pIndex = updatedProducts.findIndex(p => p.id === item.productId);
 if (pIndex > -1) {
 if (status === 'COMPLETED' && !routeId) {
 updatedProducts[pIndex].stock -= item.quantity;
}
 item.cogs = updatedProducts[pIndex].costPrice * item.quantity;
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
 const { error: rpcError} = await supabase.rpc('process_sale', {
 p_id: newSale.id,
 p_shop_id: clientId,
 p_items: cartItems,
 p_total_amount: totalAmount,
 p_payment_method: newSale.paymentMethod, 
 p_payment_status: newSale.paymentStatus,
 p_date: newSale.date,
 p_user_id: currentUser?.id
});

 if (rpcError) {
 console.error("❌ Atomic Sale Failed:", rpcError);
 // CLEAN DB OBJECT
 const dbSale = {
 id: newSale.id,
 product_id: newSale.items?.[0]?.productId, 
 shop_id: clientId,
 total_amount: totalAmount,
 payment_method: newSale.paymentMethod,
 payment_status: newSale.paymentStatus,
 status: newSale.status,
 note: salesmanNote,
 booked_by: currentUser?.id,
 route_id: routeId,
 scheduled_date: scheduledDate
};

 const { error: insertError} = await supabase.from('sales').insert(dbSale);
 if (insertError) {
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
 const today = new Date().toISOString().split('T')[0];
 setDayBook(prev => prev.map(db => 
 db.date === today 
 ? { ...db, total_sales: (db.total_sales || 0) + totalAmount}
 : db
 ));
}

 // Update local products stock
 if (status === 'COMPLETED' && !routeId) {
 setProducts(prev => prev.map(p => {
 const item = cartItems.find(item => item.id === p.id);
 return item ? { ...p, stock: (p.stock || 0) - item.quantity} : p;
}));
}

 addNotification(`Sale Processed: ${businessProfile?.currencySymbol || ''}${totalAmount}`, 'success');
 return newSale.id;
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
 note: salesmanNote || updatedSale.note
};
 
 // Cleanup fields that don't exist in the DB schema
 delete dbSale.clientId; 
 delete dbSale.salesmanNote;

 const { error} = await supabase.from('sales').upsert(dbSale);
 if (error) {
 console.error("Error updating sale in Supabase:", error);
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
 const { error} = await supabase.from('sales').delete().eq('id', saleId);
 if (error) {
 console.error("Error deleting sale from Supabase:", error);
 addNotification("Failed to delete sale from cloud","error");
 return;
}
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
 const { error} = await supabase.from('sales').upsert(updatedSale);
 if (error) {
 console.error("Error settling sale in Supabase:", error);
 addNotification("Cloud Sync Delayed: Payment recorded locally","warning");
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

 // Task 4: Mark as Paid for Client
 const recordClientPayment = async (clientId, amount, paymentDate, notes) => {
 const client = clients.find(c => c.id === clientId);
 if (!client) return { success: false, error: 'Client not found'};

 if (amount > (client.outstanding_balance || 0)) {
 return { success: false, error: 'Amount exceeds outstanding balance'};
}

 const newBalance = Math.max(0, (client.outstanding_balance || 0) - amount);
 const updatedClient = { ...client, outstanding_balance: newBalance};

 if (isSupabaseConfigured) {
 const { error} = await supabase.from('clients').upsert(updatedClient);
 if (error) {
 console.error("Error recording client payment:", error);
 addNotification("Cloud Sync Delayed: Payment recorded locally","warning");
 // Fall through
}
}

 const paymentRecord = {
 id: `CPAY-${Date.now()}`,
 client_id: clientId,
 amount: amount,
 date: paymentDate || new Date().toISOString(),
 notes: notes || ''
};
 
 if (isSupabaseConfigured) {
 await supabase.from('client_payments').insert(paymentRecord);
}

 setClients(clients.map(c => c.id === clientId ? updatedClient : c));
 setClientPayments(prev => [paymentRecord, ...prev]);
 addNotification(`Recorded payment of ${businessProfile?.currencySymbol || ''}${amount} from ${client.name}`,"success");
 return { success: true};
};

 const addProduct = async (product) => {
 const newProduct = { 
 ...product, 
 id: product.id || `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, 
 stock: product.stock || 0, 
 taxRate: product.taxRate || 0 
};

 if (isSupabaseConfigured) {
 setSyncStatus('SYNCING');
 const { error} = await supabase.from('products').upsert(newProduct);
 if (error) {
 console.error("Error adding product to Supabase:", error);
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
 const { error} = await supabase.from('products').upsert(updatedProduct);
 if (error) {
 console.error("Error updating product in Supabase:", error);
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
 const { error} = await supabase.from('products').delete().eq('id', id);
 if (error) {
 console.error("Error deleting product from Supabase:", error);
 addNotification(`Cloud Sync Delayed: Product removed locally`,"warning");
 // Fall through
}
}
 setProducts(prev => prev.filter(p => p.id !== id));
 setMovementLog(prev => prev.filter(l => l.productId !== id));
};

 const adjustStock = async (productId, amount, reason, source = 'ADJUSTMENT') => {
 const product = products.find(p => p.id === productId);
 if (!product) return;
 const updatedProduct = { ...product, stock: Math.max(0, product.stock + amount)};
 
 if (isSupabaseConfigured) {
 const { error} = await supabase.from('products').update({ stock: updatedProduct.stock}).eq('id', productId);
 if (error) {
 console.error("Error adjusting stock in Supabase:", error);
 addNotification(`Cloud Stock Sync Failed: ${error.message}`,"error");
 return;
}
}

 setProducts(products.map(p => p.id === productId ? updatedProduct : p));
 const type = amount > 0 ? 'IN' : 'OUT';
 logMovement(productId, product.name, type, Math.abs(amount), reason, currentUser?.id);
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
 const hasRole = (role) => {
 // GLOBAL OVERRIDE (resilient to profile fetch failure)
 const email = currentUser?.email || authSession?.user?.email;
 if (email === 'uvaize@hotmail.com' || email === 'gladmin@ledgrpro.ca') return true;

 if (!currentUser) return false;
 
 const roles = currentUser.roles || (currentUser.role ? [currentUser.role] : ['STAFF']);
 if (roles.includes('GLOBAL_ADMIN')) return true;
 return roles.includes(role);
};

 /**
 * RBAC Permission System (v12)
 * Supports both legacy strings and granular module/action pairs.
 */
 const hasPermission = (moduleOrLegacy, action = 'view') => {
 // GLOBAL OVERRIDE (resilient to profile fetch failure)
 const email = currentUser?.email || authSession?.user?.email;
 if (email === 'uvaize@hotmail.com' || email === 'gladmin@ledgrpro.ca') return true;

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
 const newVehicle = { ...vehicle, id: vehicle.id || `VH-${Date.now()}`};
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
 const { error} = await supabase.from('vehicles').upsert(updated);
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
 const { error} = await supabase.from('vehicles').delete().eq('id', vehicleId);
 if (error) {
 console.error("Error deleting vehicle from Supabase:", error);
 addNotification("Failed to delete vehicle from cloud","error");
 return;
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

 if (isSupabaseConfigured) {
 const { error: routeError} = await supabase.from('routes').upsert(newRoute);
 if (routeError) {
 console.error("Error dispatching route to Supabase:", routeError);
 addNotification("Failed to dispatch route to cloud","error");
 return;
}
}

 const updatedProducts = [...products];
 const stockUpdates = [];

 for (const item of routeData.loadedStock) {
 const pIndex = updatedProducts.findIndex(p => p.id === item.productId);
 if (pIndex > -1 && item.quantity > 0) {
 updatedProducts[pIndex].stock -= item.quantity;
 logMovement(item.productId, updatedProducts[pIndex].name, 'OUT', item.quantity, `Loaded onto Route ${newRoute.id}`, currentUser?.id);
 if (isSupabaseConfigured) {
 stockUpdates.push(supabase.from('products').update({ stock: updatedProducts[pIndex].stock}).eq('id', item.productId));
}
}
}

 if (stockUpdates.length > 0) {
 await Promise.all(stockUpdates);
}

 setProducts(updatedProducts);
 setRoutes([newRoute, ...routes]);
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
 console.error("Error reconciling route in Supabase:", routeError);
 addNotification("Failed to reconcile route in cloud","error");
 return;
}
}

 const updatedProducts = [...products];
 const stockUpdates = [];

 for (const item of returnedStock) {
 if (item.quantity > 0) {
 const pIndex = updatedProducts.findIndex(p => p.id === item.productId);
 if (pIndex > -1) {
 updatedProducts[pIndex].stock += item.quantity;
 logMovement(item.productId, updatedProducts[pIndex].name, 'IN', item.quantity, `Returned from Route ${routeId}`, currentUser?.id);
 if (isSupabaseConfigured) {
 stockUpdates.push(supabase.from('products').update({ stock: updatedProducts[pIndex].stock}).eq('id', item.productId));
}
}
}
}

 if (stockUpdates.length > 0) {
 await Promise.all(stockUpdates);
}

 setProducts(updatedProducts);
 setRoutes(routes.map(r => r.id === routeId ? updatedRoute : r));
};

 // ========== PAYROLL ==========
 const addEmployee = async (emp) => {
 const val = employeeSchema.safeParse(emp);
 if (!val.success) {
 addNotification("Validation failed:" + val.error.errors[0].message,"error");
 return false;
}
 const newEmp = {
 id: emp.id || `EMP-${Date.now()}`,
 name: emp.name,
 email: emp.email || null,
 phone: emp.phone || null,
 position: emp.position || null,
 status: 'ACTIVE',
 created_at: new Date().toISOString(),
 salary: emp.basePay || 0,
 role: emp.department,
 department: emp.department,
 pay_type: emp.payType || 'MONTHLY',
 bank_account: emp.bankAccount || null,
 notes: emp.notes || null,
 daily_rate: emp.dailyRate || 0,
 days_worked: emp.daysWorked || 0,
 amount_paid: emp.amountPaid || 0
};
 if (isSupabaseConfigured) {
 const { error} = await supabase.from('employees').upsert(newEmp);
 if (error) {
 console.error("Error adding employee to Supabase:", error);
 addNotification("Failed to save employee to cloud:" + error.message,"error");
 return false;
}
}
 setEmployees(prev => [...prev, newEmp]);
 addNotification(`${emp.name} added successfully`,"success");
 return true;
};

 const updateEmployee = async (updated) => {
 // Prepare database-ready object (snake_case)
 const dbData = {
 id: updated.id,
 name: updated.name,
 email: updated.email !== undefined ? updated.email : null,
 phone: updated.phone !== undefined ? updated.phone : null,
 position: updated.position !== undefined ? updated.position : null,
 status: updated.status || 'ACTIVE',
 salary: updated.basePay !== undefined ? updated.basePay : (updated.salary || 0),
 department: updated.department || updated.role,
 role: updated.department || updated.role,
 pay_type: updated.payType || updated.pay_type || 'MONTHLY',
 bank_account: updated.bankAccount || updated.bank_account || null,
 notes: updated.notes !== undefined ? updated.notes : null,
 daily_rate: updated.dailyRate !== undefined ? updated.dailyRate : (updated.daily_rate || 0),
 days_worked: updated.daysWorked !== undefined ? updated.daysWorked : (updated.days_worked || 0),
 amount_paid: updated.amountPaid !== undefined ? updated.amountPaid : (updated.amount_paid || 0)
};

 if (isSupabaseConfigured) {
 setSyncStatus('SYNCING');
 const { error} = await supabase.from('employees').upsert(dbData);
 if (error) {
 console.error("Error updating employee in Supabase:", error);
 setSyncStatus('ERROR');
 addNotification(`Cloud Sync Delayed: ${error.message}`,"warning");
} else {
 setSyncStatus('SYNCED');
}
}
 
 // Update local state with the mapped object (keep both for compatibility)
 const fullEmployee = {
 ...dbData,
 basePay: dbData.salary,
 payType: dbData.pay_type,
 bankAccount: dbData.bank_account,
 dailyRate: dbData.daily_rate,
 daysWorked: dbData.days_worked,
 amountPaid: dbData.amount_paid
};
 
 setEmployees(prev => prev.map(e => e.id === updated.id ? fullEmployee : e));
};

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

 // Task 5: Mechanic Tracker (State moved to top)

 const addMechanicPayment = async (payment) => {
 const newPayment = {
 id: payment.id || generateUUID(),
 name: payment.name || payment.mechanic_name,
 mechanic_name: payment.name || payment.mechanic_name,
 work_description: payment.work_description || payment.details,
 details: payment.work_description || payment.details,
 total_due: parseFloat(payment.total_due || payment.amount || 0),
 amount: parseFloat(payment.total_due || payment.amount || 0),
 amount_paid: parseFloat(payment.amount_paid || 0),
 work_date: payment.work_date || payment.date || new Date().toISOString().split('T')[0],
 date: payment.work_date || payment.date || new Date().toISOString().split('T')[0],
 created_at: new Date().toISOString()
};

 if (isSupabaseConfigured) {
 setSyncStatus('SYNCING');
 const { error} = await supabase.from('mechanic_payments').insert(newPayment);
 if (error) {
 console.error("Error saving mechanic payment:", error);
 setSyncStatus('ERROR');
 addNotification("Failed to save mechanic payment in cloud","error");
 return;
}
 setSyncStatus('SYNCED');
}
 setMechanicPayments(prev => [newPayment, ...prev]);
 addNotification("Mechanic record added","success");
};

 const updateMechanicPayment = async (updated) => {
 const fullPayment = {
 ...updated,
 name: updated.name || updated.mechanic_name,
 mechanic_name: updated.name || updated.mechanic_name,
 work_description: updated.work_description || updated.details,
 details: updated.work_description || updated.details,
 total_due: parseFloat(updated.total_due || updated.amount || 0),
 amount: parseFloat(updated.total_due || updated.amount || 0),
 amount_paid: parseFloat(updated.amount_paid || 0)
};

 if (isSupabaseConfigured) {
 setSyncStatus('SYNCING');
 const { error} = await supabase.from('mechanic_payments').upsert(fullPayment);
 if (error) {
 console.error("Error updating mechanic payment:", error);
 setSyncStatus('ERROR');
 addNotification("Failed to update mechanic payment in cloud","error");
 return;
}
 setSyncStatus('SYNCED');
}
 setMechanicPayments(prev => prev.map(m => m.id === updated.id ? fullPayment : m));
 addNotification("Mechanic payment updated","success");
};

 // Task 6: Purchases & Stock Integration (State moved to top)

 const addPurchase = async (purchase) => {
 const val = purchaseSchema.safeParse(purchase);
 if (!val.success) {
 addNotification("Validation failed:" + val.error.errors[0].message,"error");
 return false;
}

 const newPurchase = {
 id: `PUR-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
 date: purchase.date || new Date().toISOString().split('T')[0],
 linked_product_id: purchase.linked_product_id || null,
 quantity: Number(purchase.quantity) || 0,
 unit_cost: Number(purchase.unit_cost) || 0,
 total_cost: (Number(purchase.quantity) || 0) * (Number(purchase.unit_cost) || 0),
 supplier_id: purchase.supplier_id || null,
 supplier_name: purchase.supplier_name || 'Unspecified',
 payment_type: purchase.payment_type || 'cash',
 notes: purchase.notes || '',
 created_at: new Date().toISOString()
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
 p_user_id: currentUser?.id
});

 if (rpcError) {
 console.error("❌ Atomic Purchase Failed:", rpcError);
 // Fallback to legacy insert
 const { error: insertError} = await supabase.from('purchases').insert({
 id: newPurchase.id,
 product_id: newPurchase.linked_product_id,
 quantity: newPurchase.quantity,
 total_amount: newPurchase.total_cost,
 date: newPurchase.date,
 supplier_id: newPurchase.supplier_id,
 supplier_name: newPurchase.supplier_name,
 payment_type: newPurchase.payment_type,
 notes: newPurchase.notes
});
 if (insertError) {
 addNotification("Failed to record purchase","error");
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
 const newSupplier = { ...supplier, id, created_at: new Date().toISOString()};
 
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
 created_at: new Date().toISOString()
};
 const { error} = await supabase.from('suppliers').insert(dbSupplier);
 if (error) {
 console.error("Error adding supplier:", error);
 addNotification("Failed to save supplier to cloud","error");
 return false;
}
}
 setSuppliers(prev => [newSupplier, ...prev]);
 return true;
};

 const deleteSupplier = async (supplierId) => {
 if (isSupabaseConfigured) {
 const { error} = await supabase.from('suppliers').delete().eq('id', supplierId);
 if (error) {
 console.error("Error deleting supplier:", error);
 addNotification("Failed to delete supplier","error");
 return false;
}
}
 setSuppliers(prev => prev.filter(s => s.id !== supplierId));
 return true;
};

 const deleteEmployee = async (empId) => {
 if (isSupabaseConfigured) {
 const { error} = await supabase.from('employees').delete().eq('id', empId);
 if (error) {
 console.error("Error deleting employee from Supabase:", error);
 addNotification("Failed to delete employee from cloud","error");
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
 processed_by: currentUser?.id
}));
 
 const { error} = await supabase.from('payroll').insert(payrollInserts);
 if (error) {
 console.error("Error processing payroll in Supabase:", error);
 setSyncStatus('ERROR');
 addNotification("Failed to process payroll in cloud","error");
 return false;
}
 setSyncStatus('SYNCED');
}
 
 setPayrollRecords(prev => [newRecord, ...prev]);
 addNotification(`Payroll for ${payRun.period} authorized`,"success");
 return true;
};

 const deletePayrollRecord = async (recordId) => {
 if (isSupabaseConfigured) {
 const { error} = await supabase.from('payroll').delete().eq('id', recordId);
 if (error) {
 console.error("Error deleting payroll record from Supabase:", error);
 addNotification("Cloud Sync Delayed: Record removed locally","warning");
 // Fall through
}
}
 setPayrollRecords(payrollRecords.filter(r => r.id !== recordId));
};


 const updateDayBook = async (record) => {
 const val = dayBookSchema.safeParse(record);
 if (!val.success) {
 addNotification("Validation failed:" + val.error.errors[0].message,"error");
 return null;
}
 const payload = {
 ...record,
 id: record.id || generateUUID(),
 created_at: record.created_at || new Date().toISOString()
};
 if (isSupabaseConfigured) {
 const { error} = await supabase.from('day_book').upsert(payload);
 if (error) {
 console.error("Error updating Day Book in Supabase:", error);
 addNotification("Failed to sync Day Book to cloud","error");
 return null;
}
}
 
 setDayBook(prev => {
 const exists = prev.find(db => db.date === payload.date);
 if (exists) {
 return prev.map(db => db.date === payload.date ? payload : db);
}
 return [payload, ...prev];
});
 return payload.id;
};

 const getDayBookForDate = (date) => {
 return dayBook.find(db => db.date === date);
};

 // Redundant migration removed

 const updateBusinessProfile = async (profile) => {
 if (isSupabaseConfigured) {
 const { error} = await supabase.from('business_profile').upsert({ id: 'current', ...profile});
 if (error) {
 console.error("Error updating business profile in Supabase:", error);
 addNotification(`Cloud Profile Sync Failed: ${error.message}`,"error");
 return;
}
}
 setBusinessProfile(profile);
 addNotification("Business profile saved to cloud","success");
};

 const addExpenseCategory = async (name) => {
 if (!name || expenseCategories.includes(name)) return;
 const newCategories = [...expenseCategories, name];
 
 if (isSupabaseConfigured) {
 const { error} = await supabase.from('settings').upsert({ key: 'expense_categories', value: newCategories});
 if (error) {
 console.error("Error adding expense category to Supabase:", error);
 addNotification("Cloud Sync Delayed: Category added locally","warning");
 // Fall through
}
}

 setExpenseCategories(newCategories);
 addNotification(`Category added: ${name}`, 'success');
};

 const updateExpenseCategory = async (oldName, newName) => {
 if (!newName || expenseCategories.includes(newName)) return;
 const newCategories = expenseCategories.map(c => c === oldName ? newName : c);
 
 if (isSupabaseConfigured) {
 const { error} = await supabase.from('settings').upsert({ key: 'expense_categories', value: newCategories});
 if (error) {
 console.error("Error updating expense category in Supabase:", error);
 addNotification("Cloud Sync Delayed: Category updated locally","warning");
 // Fall through
}
}

 setExpenseCategories(newCategories);
 setExpenses(expenses.map(e => e.category === oldName ? { ...e, category: newName} : e));
 addNotification(`Category updated: ${newName}`, 'success');
};

 const deleteExpenseCategory = async (name) => {
 const newCategories = expenseCategories.filter(c => c !== name);
 
 if (isSupabaseConfigured) {
 const { error} = await supabase.from('settings').upsert({ key: 'expense_categories', value: newCategories});
 if (error) {
 console.error("Error deleting expense category from Supabase:", error);
 addNotification("Failed to delete category from cloud","error");
 return;
}
}

 setExpenseCategories(newCategories);
 addNotification(`Category removed: ${name}`, 'success');
};

 // Silent background refresh that updates state and cache without loading screens
 const refreshInBackground = async (userId) => {
 if (!isSupabaseConfigured) return;
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
 { data: mechanicData},
 { data: suppliersData}
 ] = await Promise.all([
 supabase.from('products').select('*'),
 supabase.from('clients').select('*'),
 supabase.from('sales').select('*').order('date', { ascending: false}).limit(500),
 supabase.from('expenses').select('*').order('date', { ascending: false}).limit(500),
 supabase.from('employees').select('*'),
 supabase.from('payroll').select('*').order('processed_at', { ascending: false}).limit(100),
 supabase.from('business_profile').select('*').maybeSingle(),
 supabase.from('day_book').select('*').order('date', { ascending: false}).limit(31),
 supabase.from('settings').select('*'),
 supabase.from('client_payments').select('*').order('date', { ascending: false}).limit(500),
 supabase.from('users').select('*'),
 supabase.from('vehicles').select('*'),
 supabase.from('movement_log').select('*').order('date', { ascending: false}).limit(200),
 supabase.from('routes').select('*').order('date', { ascending: false}).limit(100),
 supabase.from('purchases').select('*').order('date', { ascending: false}).limit(200),
 supabase.from('mechanic_payments').select('*').order('work_date', { ascending: false}).limit(100),
 supabase.from('suppliers').select('*').order('name', { ascending: true})
 ]);

 // Update State Silently
 if (productsData) { setProducts(productsData); cacheSet('products', productsData);}
 if (clientsData) { setClients(clientsData); cacheSet('clients', clientsData);}
 if (salesData) { setSales(salesData); cacheSet('sales', salesData);}
 if (expensesData) { setExpenses(expensesData); cacheSet('expenses', expensesData);}
 if (usersData) { setUsers(usersData); cacheSet('users', usersData);}
 if (dayBookData) { setDayBook(dayBookData); cacheSet('day_book', dayBookData);}
 if (paymentsData) { setClientPayments(paymentsData); cacheSet('client_payments', paymentsData);}
 if (suppliersData) { setSuppliers(suppliersData); cacheSet('suppliers', suppliersData);}
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
 cacheSet('employees', mappedEmps);
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
 cacheSet('payroll', records);
}
 if (vehiclesData) { setVehicles(vehiclesData); cacheSet('vehicles', vehiclesData);}
 if (routesData) { setRoutes(routesData); cacheSet('routes', routesData);}
 if (purchasesData) { setPurchases(purchasesData); cacheSet('purchases', purchasesData);}
 if (mechanicData) { setMechanicPayments(mechanicData); cacheSet('mechanic_payments', mechanicData);}
 if (businessData) { setBusinessProfile(businessData); cacheSet('business_profile', businessData);}
 
 if (movementData) {
 const mappedLog = movementData.map(log => ({
 ...log,
 productId: log.product_id, productName: log.product_name,
 userId: log.user_id, createdAt: log.created_at || log.date
}));
 setMovementLog(mappedLog);
 cacheSet('movement_log', mappedLog);
}
 if (settingsData) {
 const categories = settingsData.find(s => s.key === 'expense_categories');
 if (categories) { setExpenseCategories(categories.value); cacheSet('expense_categories', categories.value);}
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
 const cMechanic = cacheGet('mechanic_payments'); if (cMechanic) setMechanicPayments(cMechanic);
 const cSuppliers = cacheGet('suppliers'); if (cSuppliers) setSuppliers(cSuppliers);
 const cMovement = cacheGet('movement_log'); if (cMovement) setMovementLog(cMovement);
 const cCategories = cacheGet('expense_categories'); if (cCategories) setExpenseCategories(cCategories);

 setLoading(false);
 appInitialized.current = true;
 initializingRef.current = false;
 
 // Trigger silent background refresh
 refreshInBackground();
 return;
}

 // --- FULL FETCH (Cache Miss or Forced) ---
 if (!isSilentSync) setLoading(true);
 
 try {
 console.log(force ?"🚀 Force-Initializing App Data..." :"🚀 Initializing App (Full Fetch)...");
 
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
 { data: mechanicData},
 { data: suppliersData}
 ] = await Promise.all([
 supabase.from('products').select('*'),
 supabase.from('clients').select('*'),
 supabase.from('sales').select('*').order('date', { ascending: false}).limit(500),
 supabase.from('expenses').select('*').order('date', { ascending: false}).limit(500),
 supabase.from('employees').select('*'),
 supabase.from('payroll').select('*').order('processed_at', { ascending: false}).limit(100),
 supabase.from('business_profile').select('*').maybeSingle(),
 supabase.from('day_book').select('*').order('date', { ascending: false}).limit(31),
 supabase.from('settings').select('*'),
 supabase.from('client_payments').select('*').order('date', { ascending: false}).limit(500),
 supabase.from('users').select('*'),
 supabase.from('vehicles').select('*'),
 supabase.from('movement_log').select('*').order('date', { ascending: false}).limit(200),
 supabase.from('routes').select('*').order('date', { ascending: false}).limit(100),
 supabase.from('purchases').select('*').order('date', { ascending: false}).limit(200),
 supabase.from('mechanic_payments').select('*').order('work_date', { ascending: false}).limit(100),
 supabase.from('suppliers').select('*').order('name', { ascending: true})
 ]);
 
 if (productsData) { setProducts(productsData); cacheSet('products', productsData);}
 if (clientsData) { setClients(clientsData); cacheSet('clients', clientsData);}
 if (salesData) { setSales(salesData); cacheSet('sales', salesData);}
 if (expensesData) { setExpenses(expensesData); cacheSet('expenses', expensesData);}
 if (usersData) { setUsers(usersData); cacheSet('users', usersData);}
 if (dayBookData) { setDayBook(dayBookData); cacheSet('day_book', dayBookData);}
 if (paymentsData) { setClientPayments(paymentsData); cacheSet('client_payments', paymentsData);}
 if (suppliersData) { setSuppliers(suppliersData); cacheSet('suppliers', suppliersData);}
 
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
 cacheSet('employees', mappedEmps);
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
 cacheSet('payroll', records);
}

 if (vehiclesData) { setVehicles(vehiclesData); cacheSet('vehicles', vehiclesData);}
 if (routesData) { setRoutes(routesData); cacheSet('routes', routesData);}
 if (purchasesData) { setPurchases(purchasesData); cacheSet('purchases', purchasesData);}
 if (mechanicData) { setMechanicPayments(mechanicData); cacheSet('mechanic_payments', mechanicData);}
 if (businessData) { setBusinessProfile(businessData); cacheSet('business_profile', businessData);}
 
 if (movementData) {
 const mappedLog = movementData.map(log => ({
 ...log,
 productId: log.product_id, productName: log.product_name,
 userId: log.user_id, createdAt: log.created_at || log.date
}));
 setMovementLog(mappedLog);
 cacheSet('movement_log', mappedLog);
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


 const [authSession, setAuthSession] = useState(null);

 // Initial Session Resolver & Visibility Handler
 useEffect(() => {
 if (!isSupabaseConfigured) return;

 // 1. Resolve session immediately on mount
 const initSession = async () => {
 const { data: { session}} = await supabase.auth.getSession();
 if (session) {
 setAuthSession(session);
 const { data: profile} = await supabase.from('users').select('*').eq('id', session.user.id).maybeSingle();
 if (profile) setCurrentUser(profile);
 initializeApp(); // Cache-first init
} else {
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
} else {
 // AUTO-PROVISION SUPERUSER if first time login for owner
 const isSuperUser = session.user.email === 'uvaize@hotmail.com' || session.user.email === 'gladmin@ledgrpro.ca';
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


 const isOwner = currentUser?.roles?.includes('OWNER') || currentUser?.roles?.includes('GLOBAL_ADMIN') || currentUser?.role?.toLowerCase() === 'owner' || currentUser?.email === 'uvaize@hotmail.com';
 const isStaff = currentUser?.roles?.includes('STAFF') || currentUser?.role?.toLowerCase() === 'staff';

 const value = {
 currentUser, session: authSession || currentUser, isOwner, isStaff, login, logout,
 syncStatus, isOnline, lastSyncedAt,
 businessProfile, updateBusinessProfile, // Data
 products, addProduct, updateProduct, deleteProduct, adjustStock,
 clients, addClient, updateClient, deleteClient,
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
 employees, addEmployee, updateEmployee, deleteEmployee,
 payrollRecords, processPayroll, deletePayrollRecord,
 mechanicPayments, addMechanicPayment,
 purchases, addPurchase,
 suppliers, addSupplier, deleteSupplier,
 dayBook, updateDayBook, getDayBookForDate,
 recordClientPayment, clientPayments,
 isMaintenance, maintenanceMessage, setIsMaintenance,
 notifications, addNotification,
 DEFAULT_PERMISSIONS, MODULES_CONFIG,
 loading, initError, migrateLocalToSupabase, resetAndSeedLocal, resetAndSeedCloud
};

 return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

