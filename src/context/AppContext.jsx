import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { 
    saleSchema, expenseSchema, purchaseSchema, 
    employeeSchema, clientSchema, dayBookSchema 
} from '../lib/validation';

const AppContext = createContext();

export const useAppContext = () => useContext(AppContext);



// Enhanced Initial Mock Data (FOR SEEDING ONLY)
const INITIAL_PRODUCTS = [
    { id: '1', sku: 'PCUP-210', name: 'Paper cup 210 ml', category: 'Cups', unit: 'pcs', costPrice: 0.50, sellingPrice: 1.00, stock: 1000, taxRate: 0, tags: ['paper'], image: '/images/paper_cups_white.png' },
    { id: '2', sku: 'PCUP-150', name: 'Paper cup 150 ml', category: 'Cups', unit: 'pcs', costPrice: 0.40, sellingPrice: 0.80, stock: 1000, taxRate: 0, tags: ['paper'], image: '/images/paper_cups_white.png' },
    { id: '3', sku: 'BPCUP-210', name: 'Paper cup bio 210 ml', category: 'Cups', unit: 'pcs', costPrice: 0.60, sellingPrice: 1.20, stock: 1000, taxRate: 0, tags: ['bio'], image: '/images/paper_cups_bio.png' },
    { id: '4', sku: 'BPCUP-150', name: 'Paper cup bio 150 ml', category: 'Cups', unit: 'pcs', costPrice: 0.50, sellingPrice: 1.00, stock: 1000, taxRate: 0, tags: ['bio'], image: '/images/paper_cups_bio.png' },
    { id: '5', sku: 'PLT-12', name: 'Plate 12 inch', category: 'Plates', unit: 'pcs', costPrice: 1.00, sellingPrice: 2.00, stock: 500, taxRate: 0, tags: [], image: '/images/paper_plates.png' },
    { id: '6', sku: 'APCV-1013', name: 'Apple cover 10*13', category: 'Covers', unit: 'pcs', costPrice: 0.10, sellingPrice: 0.25, stock: 2000, taxRate: 0, tags: ['apple'], image: '/images/plastic_covers.png' },
    { id: '7', sku: 'APCV-1316', name: 'Apple cover 13*16', category: 'Covers', unit: 'pcs', costPrice: 0.15, sellingPrice: 0.30, stock: 2000, taxRate: 0, tags: ['apple'], image: '/images/plastic_covers.png' },
    { id: '8', sku: 'APCV-1620', name: 'Apple cover 16*20', category: 'Covers', unit: 'pcs', costPrice: 0.20, sellingPrice: 0.40, stock: 2000, taxRate: 0, tags: ['apple'], image: '/images/plastic_covers.png' },
    { id: '9', sku: 'VJCV-1620', name: 'Virjin cover 16*20', category: 'Covers', unit: 'pcs', costPrice: 0.25, sellingPrice: 0.50, stock: 1000, taxRate: 0, tags: ['virjin'], image: '/images/plastic_covers.png' },
    { id: '10', sku: 'WHCV-1723', name: 'White cover 17*23', category: 'Covers', unit: 'pcs', costPrice: 0.30, sellingPrice: 0.60, stock: 1000, taxRate: 0, tags: ['white'], image: '/images/plastic_covers.png' },
    { id: '11', sku: 'PKCV-1316', name: 'Packet cover 13*16', category: 'Covers', unit: 'pcs', costPrice: 0.10, sellingPrice: 0.20, stock: 2000, taxRate: 0, tags: ['packet'], image: '/images/plastic_covers.png' },
    { id: '12', sku: 'PKCV-1620', name: 'Packet cover 16*20', category: 'Covers', unit: 'pcs', costPrice: 0.15, sellingPrice: 0.30, stock: 2000, taxRate: 0, tags: ['packet'], image: '/images/plastic_covers.png' },
    { id: '13', sku: 'LDCV-ALL', name: 'Ld cover all size', category: 'Covers', unit: 'kg', costPrice: 2.00, sellingPrice: 4.00, stock: 500, taxRate: 0, tags: ['ld'], image: '/images/plastic_covers.png' },
    { id: '14', sku: 'HMCV-ALL', name: 'Hm cover all size', category: 'Covers', unit: 'kg', costPrice: 2.50, sellingPrice: 5.00, stock: 500, taxRate: 0, tags: ['hm'], image: '/images/plastic_covers.png' },
    { id: '15', sku: 'PPCV-ALL', name: 'Pp cover all size', category: 'Covers', unit: 'kg', costPrice: 3.00, sellingPrice: 6.00, stock: 500, taxRate: 0, tags: ['pp'], image: '/images/plastic_covers.png' },
    { id: '16', sku: 'PSTR-01', name: 'Paper straw', category: 'Cutlery', unit: 'pcs', costPrice: 0.05, sellingPrice: 0.10, stock: 5000, taxRate: 0, tags: [], image: '/images/paper_straws.png' },
    { id: '17', sku: 'PKS-1818', name: 'Packing sheets 18*18', category: 'Sheets', unit: 'kg', costPrice: 1.50, sellingPrice: 3.00, stock: 300, taxRate: 0, tags: [], image: '/images/packing_sheets.png' },
    { id: '18', sku: 'PKS-1212', name: 'Packing sheet 12*12', category: 'Sheets', unit: 'kg', costPrice: 1.00, sellingPrice: 2.00, stock: 300, taxRate: 0, tags: [], image: '/images/packing_sheets.png' },
    { id: '19', sku: 'JCUP-300', name: 'Juice cup 300 ml', category: 'Cups', unit: 'pcs', costPrice: 0.80, sellingPrice: 1.50, stock: 800, taxRate: 0, tags: ['juice'], image: '/images/juice_cups.png' },
]; // mockdata ends

// mockdata: Expanded users for testing
const INITIAL_USERS = [
    { id: 'u0', name: 'Global Admin', email: 'global@ledgr.com', roles: ['GLOBAL_ADMIN'], status: 'ACTIVE' },
    { id: 'u1', name: 'Admin User', email: 'admin@ledgr.com', roles: ['OWNER'], status: 'ACTIVE' },
    { id: 'u3', name: 'Arjun Nair', email: 'arjun@ledgr.com', roles: ['STAFF'], status: 'ACTIVE' },
    { id: 'u4', name: 'Rahul V', email: 'rahul@ledgr.com', roles: ['STAFF'], status: 'ACTIVE' },
]; // mockdata ends

// mockdata: Expanded shops based in Trivandrum
const INITIAL_SHOPS = [
    { id: 's1', name: 'Lulu Hypermarket', contact: 'Store Manager', phone: '+91 471 234 5678', address: 'Lulu Mall, Akkulam, Trivandrum' },
    { id: 's2', name: 'Kunnil Hypermarket', contact: 'Kunnil Admin', phone: '+91 471 272 1500', address: 'Kulathoor, Trivandrum' },
    { id: 's3', name: 'Pothys Hypermarket', contact: 'Pothys Rep', phone: '+91 471 257 4444', address: 'Nikunjam, Trivandrum' },
    { id: 's4', name: 'Reliance SMART Bazaar', contact: 'Bazaar Mgr', phone: '+91 471 233 4455', address: 'Pazhavangadi, Trivandrum' },
    { id: 's5', name: 'More Supermarket', contact: 'More Staff', phone: '+91 471 244 5566', address: 'Sasthamangalam, Trivandrum' },
    { id: 's6', name: 'Nilgiris Supermarket', contact: 'Nilgiris Admin', phone: '+91 471 255 6677', address: 'Vazhuthacaud, Trivandrum' },
]; // mockdata ends

// mockdata: Expanded vehicles with Kerala registrations
const INITIAL_VEHICLES = [
    { id: 'v1', name: 'TATA Ace', plate: 'KL-01-BK-1234', image: '/images/van.png' },
    { id: 'v2', name: 'Mahindra Supro', plate: 'KL-01-BL-5678', image: '/images/van.png' },
    { id: 'v3', name: 'Ashok Leyland Dost', plate: 'KL-21-CA-9012', image: '/images/van.png' },
]; // mockdata ends

const INITIAL_EMPLOYEES = [
    { id: 'e1', name: 'Arjun Nair', role: 'SALES', status: 'ACTIVE', salary: 1800 },
    { id: 'e2', name: 'Rahul V', role: 'SALES', status: 'ACTIVE', salary: 1750 },
    { id: 'e3', name: 'Sijo Kurien', role: 'DRIVER', status: 'ACTIVE', salary: 1600 },
    { id: 'e4', name: 'Deepu Singh', role: 'DRIVER', status: 'ACTIVE', salary: 1600 },
];

const INITIAL_BUSINESS = {
    name: 'Future Dispo Industries',
    country: 'India',
    currency: 'INR',
    currencySymbol: '₹',
    lowStockThreshold: 20
};

const INITIAL_EXPENSE_CATEGORIES = ['General', 'Inventory', 'Logistics', 'Payroll', 'Utilities', 'Marketing', 'Rent', 'Other'];

// Available role definitions
const AVAILABLE_ROLES = [
    { key: 'GLOBAL_ADMIN', label: 'Global Admin', description: 'Superuser with unrestricted access to all segments.' },
    { key: 'OWNER', label: 'Owner', description: 'Full access to all features, including payroll and user management' },
    { key: 'STAFF', label: 'Staff', description: 'Can record sales and view inventory. Restricted from management tasks.' },
];
export { AVAILABLE_ROLES };

export const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export const AppProvider = ({ children }) => {
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
    const [movementLog, setMovementLog] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [routes, setRoutes] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [payrollRecords, setPayrollRecords] = useState([]);
    const [purchases, setPurchases] = useState([]);
    const [mechanicPayments, setMechanicPayments] = useState([]);
    const [dayBook, setDayBook] = useState([]);
    const [expenseCategories, setExpenseCategories] = useState(['Petrol', 'Food', 'Salary', 'Rent', 'Electricity', 'Water', 'Maintenance', 'Stationery', 'Travel', 'Marketing', 'Tax', 'Others']);
    
    // Aliases
    const orders = sales;
    const setOrders = setSales;

    const [notifications, setNotifications] = useState([]);

    const addNotification = (message, type = 'success') => {
        const id = `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        setNotifications(prev => [{ id, message, type, date: new Date().toISOString() }, ...prev].slice(0, 5));
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 5000);
    };

    // Data Persistence (100% CLOUD — No Local Storage)

    const initializingRef = useRef(false);


    // Data Actions (LOCAL ONLY)
    const login = async (email, password) => {
        if (isSupabaseConfigured) {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                return { success: false, error: error.message };
            }
            return { success: true, user: data.user };
        }
        // Fallback for mock mode
        const user = users.find(u => u.email === email && (password === 'password' || password === 'admin123'));
        if (user) {
            setCurrentUser(user);
            return { success: true };
        }
        return { success: false, error: 'Invalid local credentials' };
    };

    const logout = async () => {
        try {
            if (isSupabaseConfigured) {
                supabase.auth.signOut().catch(e => console.warn("SignOut background error:", e));
            }
        } catch (e) {
            console.error("Logout caught error:", e);
        } finally {
            setCurrentUser(null);
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
            status: 'ACTIVE'
        };

        if (isSupabaseConfigured && userData.password) {            // Call the Edge Function which uses SERVICE_ROLE to create auth + profile atomically
            try {
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
                const session = await supabase.auth.getSession();
                const token = session?.data?.session?.access_token || anonKey;

                // 10-second timeout so the form never hangs
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);

                const res = await fetch(`${supabaseUrl}/functions/v1/dynamic-service`, {
                    method: 'POST',
                    signal: controller.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        'apikey': anonKey
                    },
                    body: JSON.stringify({
                        email: userData.email,
                        password: userData.password,
                        name: userData.name,
                        roles: userData.roles || ['STAFF']
                    })
                });
                clearTimeout(timeoutId);

                let result;
                try {
                    result = await res.json();
                } catch {
                    result = {};
                }
                console.log("Edge function response:", res.status, result);

                if (!res.ok) {
                    const errMsg = result?.error || result?.message || `HTTP ${res.status}`;
                    addNotification(`Staff creation failed: ${errMsg}`, "error");
                    return false;
                }

                const createdUser = { ...newUser, id: result.id };
                setUsers(prev => [...prev, createdUser]);
                addNotification(`${userData.name} added! They can now log in with their email & password.`, "success");
                return true;

            } catch (err) {
                const isTimeout = err?.name === 'AbortError';
                console.error("Edge function call failed:", err);
                addNotification(
                    isTimeout 
                        ? "Staff creation timed out — saving profile only. Add them in Supabase Auth for login access."
                        : "Edge function unreachable — saving profile only.",
                    "warning"
                );
                // Fall through to profile-only save below
            }
        }

        // Fallback: save profile only (no auth account)
        if (isSupabaseConfigured) {
            const { error: profileError } = await supabase.from('users').upsert(newUser);
            if (profileError) {
                addNotification(`Failed to save staff profile: ${profileError.message}`, "error");
                return false;
            }
        }

        setUsers(prev => [...prev, newUser]);
        addNotification(`${userData.name} added! (Note: no login account created — add them in Supabase Auth to give login access.)`, "warning");
        return true;
    };

    const updateUser = async (updatedUser) => {
        if (isSupabaseConfigured) {
            const { error } = await supabase.from('users').upsert(updatedUser);
            if (error) {
                console.error("Error updating user in Supabase:", error);
                addNotification("Cloud Sync Delayed: Profile updated locally", "warning");
                // Fall through
            }
        }
        setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
    };

    const deleteUser = async (userId) => {
        if (userId === currentUser?.id) return;
        
        if (isSupabaseConfigured) {
            const { error } = await supabase.from('users').delete().eq('id', userId);
            if (error) {
                console.error("Error deleting user from Supabase:", error);
                addNotification("Cloud Sync Delayed: Staff removed locally", "warning");
                // Fall through
            }
        }

        setUsers(users.filter(u => u.id !== userId));
        addNotification('Staff record removed from system', 'success');
    };

    const addClient = async (client) => {
        const val = clientSchema.safeParse(client);
        if (!val.success) {
            addNotification("Validation failed: " + val.error.errors[0].message, "error");
            return;
        }
        const newClient = { 
            ...client, 
            id: client.id || `CLI-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            outstanding_balance: client.outstanding_balance || 0
        };
        
        const { status, ...dbClient } = newClient;

        if (isSupabaseConfigured) {
            const { error } = await supabase.from('clients').upsert(dbClient);
            if (error) {
                console.error("Error adding client to Supabase:", error);
                addNotification(`Cloud Sync Delayed: Client saved locally`, "warning");
                // Fall through
            }
        }
        setClients([newClient, ...clients]);
    };

    const updateClient = async (updatedClient) => {
        const { status, ...dbClient } = updatedClient;

        if (isSupabaseConfigured) {
            const { error } = await supabase.from('clients').upsert(dbClient);
            if (error) {
                console.error("Error updating client in Supabase:", error);
                addNotification("Failed to update client in cloud", "error");
                return;
            }
        }
        setClients(clients.map(c => c.id === updatedClient.id ? updatedClient : c));
    };

    const deleteClient = async (clientId) => {
        if (isSupabaseConfigured) {
            const { error } = await supabase.from('clients').delete().eq('id', clientId);
            if (error) {
                console.error("Error deleting client from Supabase:", error);
                addNotification("Cloud Sync Delayed: Client removed locally", "warning");
                // Fall through
            }
        }
        setClients(clients.filter(c => c.id !== clientId));
    };

    const addExpense = async (expense) => {
        const val = expenseSchema.safeParse(expense);
        if (!val.success) {
            addNotification("Validation failed: " + val.error.errors[0].message, "error");
            return;
        }
        const { title, date, routeId, splitType, ...restExpense } = expense;
        const newExpense = { 
            ...restExpense, 
            id: expense.id || `EXP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, 
            date: date || new Date().toISOString(),
            route_id: routeId,
            split_type: splitType || null,
            note: title || ''
        };
        
        if (isSupabaseConfigured) {
            const { error } = await supabase.from('expenses').upsert(newExpense);
            if (error) {
                console.error("Error adding expense to Supabase:", error);
                addNotification(`Cloud Sync Delayed: Expense saved locally`, "warning");
                // Fall through
            }
        }

        setExpenses([newExpense, ...expenses]);
        addNotification(`Expense recorded: ${businessProfile?.currencySymbol || ''}${expense.amount}`, 'expense');
    };

    const updateExpense = async (updatedExpense) => {
        if (isSupabaseConfigured) {
            const { error } = await supabase.from('expenses').upsert(updatedExpense);
            if (error) {
                console.error("Error updating expense in Supabase:", error);
                addNotification("Cloud Sync Delayed: Expense updated locally", "warning");
                // Fall through
            }
        }
        setExpenses(expenses.map(e => e.id === updatedExpense.id ? updatedExpense : e));
        addNotification(`Expense updated: ${businessProfile?.currencySymbol || ''}${updatedExpense.amount}`, 'success');
    };

    const deleteExpense = async (expenseId) => {
        if (isSupabaseConfigured) {
            const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
            if (error) {
                console.error("Error deleting expense from Supabase:", error);
                addNotification("Cloud Sync Delayed: Expense removed locally", "warning");
                // Fall through
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
            const { error } = await supabase.from('movement_log').insert(newLog);
            if (error) {
                console.error("Error logging movement to Supabase:", error);
                // Don't block the UI for logs, but notify if critical
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
                return delta ? { ...p, stock: Math.max(0, p.stock + delta) } : p;
            }));
        }

        if (clientDeltas.size > 0) {
            setClients(prev => prev.map(c => {
                const delta = clientDeltas.get(c.id);
                return delta ? { ...c, outstanding_balance: Math.max(0, (c.outstanding_balance || 0) + delta) } : c;
            }));
        }

        // Persistence (Using current snapshot for now, ideally SQL increments)
        if (isSupabaseConfigured) {
            for (const [id, delta] of productDeltas) {
                const currentProduct = products.find(p => p.id === id);
                if (currentProduct) await supabase.from('products').update({ stock: Math.max(0, currentProduct.stock + delta) }).eq('id', id);
            }
            for (const [id, delta] of clientDeltas) {
                const currentClient = clients.find(c => c.id === id);
                if (currentClient) await supabase.from('clients').update({ outstanding_balance: Math.max(0, (currentClient.outstanding_balance || 0) + delta) }).eq('id', id);
            }
        }
    };

    const placeSale = async (clientId, cartItems, subtotal, discount, tax, totalAmount, customerInfo, paymentType = 'cash', routeId = null, status = 'COMPLETED', scheduledDate = null, salesmanNote = '') => {
        const val = saleSchema.safeParse({ clientId, items: cartItems, totalAmount, paymentMethod: paymentType });
        if (!val.success) {
            addNotification("Sale Validation failed: " + val.error.errors[0].message, "error");
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
            paymentMethod: paymentType,
            paymentStatus: paymentType === 'cash' ? 'PAID' : 'PENDING',
            status,
            routeId,
            scheduledDate,
            salesmanNote,
            bookedBy: currentUser?.id
        };

        const dbSale = {
            id: newSale.id,
            date: newSale.date,
            shopId: clientId,
            items: cartItems,
            subtotal,
            discount,
            tax,
            totalAmount,
            totalCogs,
            customerInfo,
            paymentMethod: paymentType,
            payment_type: paymentType,
            paymentStatus: paymentType === 'cash' ? 'PAID' : 'PENDING',
            status,
            routeId,
            scheduledDate,
            note: salesmanNote,
            bookedBy: currentUser?.id
        };

        if (isSupabaseConfigured) {
            const { error } = await supabase.from('sales').insert(dbSale);
            if (error) {
                console.error("Error placing sale in Supabase:", error);
                addNotification(`Cloud Sync Delayed: Sale recorded locally`, "warning");
                // Fall through
            }
        }

        setSales([newSale, ...sales]);
        
        // Update outstanding balance for credit sales
        if (paymentType === 'credit') {
            const client = clients.find(c => c.id === clientId);
            if (client) {
                const updatedClient = {
                    ...client,
                    outstanding_balance: (client.outstanding_balance || 0) + totalAmount
                };
                await updateClient(updatedClient);
            }
        }

        // Update Day Book Cash if Cash
        if (paymentType === 'cash') {
            const today = new Date().toISOString().split('T')[0];
            const dbRecord = await getDayBookForDate(today);
            if (dbRecord) {
                await updateDayBook({
                    ...dbRecord,
                    total_sales: (dbRecord.total_sales || 0) + totalAmount
                });
            }
        }

        if (status === 'COMPLETED' && !routeId) {
            setProducts(updatedProducts);
            if (isSupabaseConfigured) {
                await supabase.from('products').upsert(updatedProducts);
            }
        }

        addNotification(`Sale Recorded: ${businessProfile?.currencySymbol || ''}${totalAmount}`, 'success');
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
            const { status: saleStatus, clientId, salesmanNote, ...rest } = updatedSale;
            const dbSale = { 
                ...rest, 
                shopId: clientId || updatedSale.shopId, 
                status: saleStatus,
                note: salesmanNote || updatedSale.note
            };
            
            // Cleanup fields that don't exist in the DB schema
            delete dbSale.clientId; 
            delete dbSale.salesmanNote;

            const { error } = await supabase.from('sales').upsert(dbSale);
            if (error) {
                console.error("Error updating sale in Supabase:", error);
                addNotification("Failed to update sale in cloud", "error");
                return;
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
                const { error } = await supabase.from('sales').delete().eq('id', saleId);
                if (error) {
                    console.error("Error deleting sale from Supabase:", error);
                    addNotification("Failed to delete sale from cloud", "error");
                    return;
                }
            }
            setSales(prev => prev.filter(s => s.id !== saleId));
            addNotification("Sale deleted and stock reversed", "success");
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
            const { error } = await supabase.from('sales').upsert(updatedSale);
            if (error) {
                console.error("Error settling sale in Supabase:", error);
                addNotification("Cloud Sync Delayed: Payment recorded locally", "warning");
                // Fall through
            }
        }

        // Also update client persistent balance if it was a credit sale
        if (sale.paymentMethod === 'CREDIT' || sale.paymentMethod === 'credit') {
            const client = clients.find(c => c.id === sale.clientId || c.id === sale.shopId);
            if (client) {
                const newBalance = Math.max(0, (client.outstanding_balance || 0) - amount);
                await updateClient({ ...client, outstanding_balance: newBalance });
            }
        }

        setSales(sales.map(s => s.id === saleId ? updatedSale : s));
        addNotification(`Payment of ${businessProfile?.currencySymbol || ''}${amount} received for Sale #${saleId.split('-').pop()}`, 'success');
    };

    // Task 4: Mark as Paid for Client
    const recordClientPayment = async (clientId, amount, paymentDate, notes) => {
        const client = clients.find(c => c.id === clientId);
        if (!client) return { success: false, error: 'Client not found' };

        if (amount > (client.outstanding_balance || 0)) {
            return { success: false, error: 'Amount exceeds outstanding balance' };
        }

        const newBalance = Math.max(0, (client.outstanding_balance || 0) - amount);
        const updatedClient = { ...client, outstanding_balance: newBalance };

        if (isSupabaseConfigured) {
            const { error } = await supabase.from('clients').upsert(updatedClient);
            if (error) {
                console.error("Error recording client payment:", error);
                addNotification("Cloud Sync Delayed: Payment recorded locally", "warning");
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
        addNotification(`Recorded payment of ${businessProfile?.currencySymbol || ''}${amount} from ${client.name}`, "success");
        return { success: true };
    };

    const addProduct = async (product) => {
        const newProduct = { 
            ...product, 
            id: product.id || `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, 
            stock: product.stock || 0, 
            taxRate: product.taxRate || 0 
        };

        if (isSupabaseConfigured) {
            const { error } = await supabase.from('products').upsert(newProduct);
            if (error) {
                console.error("Error adding product to Supabase:", error);
                addNotification(`Cloud Save Failed: ${error.message}`, "error");
                return;
            }
        }

        setProducts([...products, newProduct]);
        if (newProduct.stock > 0) {
            logMovement(newProduct.id, newProduct.name, 'IN', newProduct.stock, 'Initial Stock', currentUser?.id);
        }
    };
    const updateProduct = async (updatedProduct) => {
        if (isSupabaseConfigured) {
            const { error } = await supabase.from('products').upsert(updatedProduct);
            if (error) {
                console.error("Error updating product in Supabase:", error);
                addNotification(`Cloud Sync Delayed: ${error.message}. Local changes saved.`, "warning");
            }
        }
        setProducts(products.map(p => p.id === updatedProduct.id ? updatedProduct : p));
    };

    const deleteProduct = async (id) => {
        if (isSupabaseConfigured) {
            const { error } = await supabase.from('products').delete().eq('id', id);
            if (error) {
                console.error("Error deleting product from Supabase:", error);
                addNotification(`Cloud Sync Delayed: Product removed locally`, "warning");
                // Fall through
            }
        }
        setProducts(prev => prev.filter(p => p.id !== id));
        setMovementLog(prev => prev.filter(l => l.productId !== id));
    };

    const adjustStock = async (productId, amount, reason, source = 'ADJUSTMENT') => {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        const updatedProduct = { ...product, stock: Math.max(0, product.stock + amount) };
        
        if (isSupabaseConfigured) {
            const { error } = await supabase.from('products').update({ stock: updatedProduct.stock }).eq('id', productId);
            if (error) {
                console.error("Error adjusting stock in Supabase:", error);
                addNotification(`Cloud Stock Sync Failed: ${error.message}`, "error");
                return;
            }
        }

        setProducts(products.map(p => p.id === productId ? updatedProduct : p));
        const type = amount > 0 ? 'IN' : 'OUT';
        logMovement(productId, product.name, type, Math.abs(amount), reason, currentUser?.id);
    };

    // Mock data generator removed

    // Seeding functions removed as per "Cloud Only" requirement
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
        if (!currentUser) return false;
        const roles = currentUser.roles || (currentUser.role ? [currentUser.role] : ['STAFF']);
        if (roles.includes('GLOBAL_ADMIN')) return true;
        return roles.includes(role);
    };

    /**
     * RBAC Permission System
     * Owners can do everything.
     * Staff can only view and record sales/inventory.
     * Staff CANNOT delete, process payroll, manage users, or export reports.
     */
    const hasPermission = (permission) => {
        if (!currentUser) return false;
        const roles = currentUser.roles || (currentUser.role ? [currentUser.role] : ['STAFF']);
        if (roles.includes('OWNER') || roles.includes('GLOBAL_ADMIN')) return true;

        const staffAllowed = [
            'RECORD_SALE', 
            'VIEW_STOCK', 
            'VIEW_SALES', 
            'VIEW_EXPENSES', 
            'VIEW_FLEET',
            'ADD_CLIENT',
            'EDIT_CLIENT'
        ];
        if (roles.includes('STAFF')) {
            return staffAllowed.includes(permission);
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
        if (clientId === 'POS-WALKIN' || clientId === 'WALKIN') return 'Walk-in Customer';
        const client = clients.find(c => c.id === clientId);
        return client ? client.name : (clientId || 'Unknown Client');
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
        const newVehicle = { ...vehicle, id: vehicle.id || `VH-${Date.now()}` };
        if (isSupabaseConfigured) {
            const { error } = await supabase.from('vehicles').upsert(newVehicle);
            if (error) {
                console.error("Error adding vehicle to Supabase:", error);
                addNotification("Cloud Sync Delayed: Vehicle saved locally", "warning");
                // Fall through
            }
        }
        setVehicles([...vehicles, newVehicle]);
    };

    const updateVehicle = async (updated) => {
        if (isSupabaseConfigured) {
            const { error } = await supabase.from('vehicles').upsert(updated);
            if (error) {
                console.error("Error updating vehicle in Supabase:", error);
                addNotification("Cloud Sync Delayed: Changes saved locally", "warning");
                // Fall through
            }
        }
        setVehicles(vehicles.map(v => v.id === updated.id ? updated : v));
    };

    const deleteVehicle = async (vehicleId) => {
        if (isSupabaseConfigured) {
            const { error } = await supabase.from('vehicles').delete().eq('id', vehicleId);
            if (error) {
                console.error("Error deleting vehicle from Supabase:", error);
                addNotification("Failed to delete vehicle from cloud", "error");
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
            const { error: routeError } = await supabase.from('routes').upsert(newRoute);
            if (routeError) {
                console.error("Error dispatching route to Supabase:", routeError);
                addNotification("Failed to dispatch route to cloud", "error");
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
                    stockUpdates.push(supabase.from('products').update({ stock: updatedProducts[pIndex].stock }).eq('id', item.productId));
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
            const { error: routeError } = await supabase.from('routes').upsert(updatedRoute);
            if (routeError) {
                console.error("Error reconciling route in Supabase:", routeError);
                addNotification("Failed to reconcile route in cloud", "error");
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
                        stockUpdates.push(supabase.from('products').update({ stock: updatedProducts[pIndex].stock }).eq('id', item.productId));
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
            addNotification("Validation failed: " + val.error.errors[0].message, "error");
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
            const { error } = await supabase.from('employees').upsert(newEmp);
            if (error) {
                console.error("Error adding employee to Supabase:", error);
                addNotification("Failed to save employee to cloud: " + error.message, "error");
                return false;
            }
        }
        setEmployees(prev => [...prev, newEmp]);
        addNotification(`${emp.name} added successfully`, "success");
        return true;
    };

    const updateEmployee = async (updated) => {
        const fullEmployee = {
            ...updated,
            salary: updated.basePay !== undefined ? updated.basePay : updated.salary,
            role: updated.department || updated.role,
            pay_type: updated.payType || updated.pay_type,
            bank_account: updated.bankAccount || updated.bank_account,
            daily_rate: updated.dailyRate !== undefined ? updated.dailyRate : updated.daily_rate,
            days_worked: updated.daysWorked !== undefined ? updated.daysWorked : updated.days_worked,
            amount_paid: updated.amountPaid !== undefined ? updated.amountPaid : updated.amount_paid
        };
        
        // Clean up camelCase duplicates before sending to Supabase
        const dbData = { ...fullEmployee };
        delete dbData.basePay;
        delete dbData.payType;
        delete dbData.bankAccount;
        delete dbData.dailyRate;
        delete dbData.daysWorked;
        delete dbData.amountPaid;

        if (isSupabaseConfigured) {
            const { error } = await supabase.from('employees').upsert(dbData);
            if (error) {
                console.error("Error updating employee in Supabase:", error);
                addNotification(`Cloud Sync Delayed: ${error.message}`, "warning");
            }
        }
        setEmployees(employees.map(e => e.id === updated.id ? fullEmployee : e));
    };

    // Task 5: Mechanic Tracker (State moved to top)

    const addMechanicPayment = async (payment) => {
        const newPayment = {
            ...payment,
            id: payment.id || generateUUID(),
            amount_paid: payment.amount_paid || 0,
            work_date: payment.work_date || new Date().toISOString().split('T')[0],
            created_at: new Date().toISOString()
        };
        if (isSupabaseConfigured) {
            const { error } = await supabase.from('mechanic_payments').insert(newPayment);
            if (error) {
                console.error("Error saving mechanic payment:", error);
                addNotification("Failed to save mechanic payment in cloud", "error");
                return;
            }
        }
        setMechanicPayments(prev => [newPayment, ...prev]);
        addNotification("Mechanic record added", "success");
    };

    const updateMechanicPayment = async (updatedPayment) => {
        if (isSupabaseConfigured) {
            const { error } = await supabase.from('mechanic_payments').upsert(updatedPayment);
            if (error) {
                console.error("Error updating mechanic payment:", error);
                addNotification("Failed to update mechanic payment in cloud", "error");
                return;
            }
        }
        setMechanicPayments(mechanicPayments.map(m => m.id === updatedPayment.id ? updatedPayment : m));
        addNotification("Mechanic payment updated", "success");
    };

    // Task 6: Purchases & Stock Integration (State moved to top)

    const addPurchase = async (purchase) => {
        const val = purchaseSchema.safeParse(purchase);
        if (!val.success) {
            addNotification("Validation failed: " + val.error.errors[0].message, "error");
            return false;
        }
        const newPurchase = {
            ...purchase,
            id: purchase.id || generateUUID(),
            linked_product_id: purchase.linked_product_id || null,
            supplier_name: purchase.supplier_name || 'DIRECT MARKET',
            payment_type: purchase.payment_type || 'cash',
            notes: purchase.notes || '',
            date: purchase.date || new Date().toISOString(),
            created_at: new Date().toISOString()
        };

        const dbPurchase = {
            id: newPurchase.id,
            product_id: purchase.linked_product_id || null,
            quantity: purchase.quantity,
            total_amount: purchase.total_cost || 0,
            date: newPurchase.date,
            created_at: newPurchase.created_at,
            linked_product_id: newPurchase.linked_product_id,
            supplier_name: newPurchase.supplier_name,
            payment_type: newPurchase.payment_type,
            notes: newPurchase.notes
        };

        if (isSupabaseConfigured) {
            const { error } = await supabase.from('purchases').insert(dbPurchase);
            if (error) {
                console.error("Error saving purchase:", error);
                addNotification("Failed to save purchase in cloud", "error");
                return false;
            }
        }

        // Auto-increment stock if linked to a product
        if (newPurchase.linked_product_id) {
            const product = products.find(p => p.id === newPurchase.linked_product_id);
            if (product) {
                const newStock = (product.stock || 0) + (Number(newPurchase.quantity) || 0);
                await updateProduct({ ...product, stock: newStock });
                addNotification(`Stock updated for ${product.name} — +${newPurchase.quantity} units added`, "success");
            }
        } else {
            addNotification("Purchase recorded successfully", "success");
        }

        setPurchases(prev => [newPurchase, ...prev]);
        return true;
    };

    const deleteEmployee = async (empId) => {
        if (isSupabaseConfigured) {
            const { error } = await supabase.from('employees').delete().eq('id', empId);
            if (error) {
                console.error("Error deleting employee from Supabase:", error);
                addNotification("Failed to delete employee from cloud", "error");
                return;
            }
        }
        setEmployees(employees.filter(e => e.id !== empId));
    };

    const processPayroll = async (payRun) => {
        const newRecord = {
            ...payRun,
            id: payRun.id || `PAY-${Date.now()}`,
            processed_at: new Date().toISOString(),
            processed_by: currentUser?.id
        };
        
        if (isSupabaseConfigured) {
            const payrollInserts = payRun.items.map(item => ({
                id: `PRL-${Date.now()}-${item.employeeId}`,
                employeeId: item.employeeId,
                amount: item.netPay,
                month: payRun.period,
                processed_at: newRecord.processed_at,
                processed_by: newRecord.processed_by
            }));
            
            const { error } = await supabase.from('payroll').insert(payrollInserts);
            if (error) {
                console.error("Error processing payroll in Supabase:", error);
                addNotification("Failed to process payroll in cloud", "error");
                // Fall through to local state
            }
        }
        setPayrollRecords(prev => [newRecord, ...prev]);
    };

    const deletePayrollRecord = async (recordId) => {
        if (isSupabaseConfigured) {
            const { error } = await supabase.from('payroll').delete().eq('id', recordId);
            if (error) {
                console.error("Error deleting payroll record from Supabase:", error);
                addNotification("Cloud Sync Delayed: Record removed locally", "warning");
                // Fall through
            }
        }
        setPayrollRecords(payrollRecords.filter(r => r.id !== recordId));
    };


    const updateDayBook = async (record) => {
        const val = dayBookSchema.safeParse(record);
        if (!val.success) {
            addNotification("Validation failed: " + val.error.errors[0].message, "error");
            return null;
        }
        const payload = {
            ...record,
            id: record.id || generateUUID(),
            created_at: record.created_at || new Date().toISOString()
        };
        if (isSupabaseConfigured) {
            const { error } = await supabase.from('day_book').upsert(payload);
            if (error) {
                console.error("Error updating Day Book in Supabase:", error);
                addNotification("Failed to sync Day Book to cloud", "error");
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
            const { error } = await supabase.from('business_profile').upsert({ id: 'current', ...profile });
            if (error) {
                console.error("Error updating business profile in Supabase:", error);
                addNotification(`Cloud Profile Sync Failed: ${error.message}`, "error");
                return;
            }
        }
        setBusinessProfile(profile);
        addNotification("Business profile saved to cloud", "success");
    };

    const addExpenseCategory = async (name) => {
        if (!name || expenseCategories.includes(name)) return;
        const newCategories = [...expenseCategories, name];
        
        if (isSupabaseConfigured) {
            const { error } = await supabase.from('settings').upsert({ key: 'expense_categories', value: newCategories });
            if (error) {
                console.error("Error adding expense category to Supabase:", error);
                addNotification("Cloud Sync Delayed: Category added locally", "warning");
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
            const { error } = await supabase.from('settings').upsert({ key: 'expense_categories', value: newCategories });
            if (error) {
                console.error("Error updating expense category in Supabase:", error);
                addNotification("Cloud Sync Delayed: Category updated locally", "warning");
                // Fall through
            }
        }

        setExpenseCategories(newCategories);
        setExpenses(expenses.map(e => e.category === oldName ? { ...e, category: newName } : e));
        addNotification(`Category updated: ${newName}`, 'success');
    };

    const deleteExpenseCategory = async (name) => {
        const newCategories = expenseCategories.filter(c => c !== name);
        
        if (isSupabaseConfigured) {
            const { error } = await supabase.from('settings').upsert({ key: 'expense_categories', value: newCategories });
            if (error) {
                console.error("Error deleting expense category from Supabase:", error);
                addNotification("Failed to delete category from cloud", "error");
                return;
            }
        }

        setExpenseCategories(newCategories);
        addNotification(`Category removed: ${name}`, 'success');
    };

    // Supabase Sync & Init (REUSABLE)
    const initializeApp = async () => {
        // Prevent multiple simultaneous initializations
        if (initializingRef.current) return;
        initializingRef.current = true;

        setLoading(true);
        setInitError(null);
        
        if (!isSupabaseConfigured) {
            console.log("⚠️ Supabase not configured. Using local/mock data mode.");
            setLoading(false);
            initializingRef.current = false;
            return;
        }

        // Safety timeout to prevent infinite loading
        const timeoutId = setTimeout(() => {
            if (loading) {
                console.warn("⏳ Initialization timeout: Forcing loading state to false.");
                setLoading(false);
                initializingRef.current = false;
            }
        }, 15000); // 15s timeout

        const lastInitTime = window.lastInitTime || 0;
        const now = Date.now();
        if (now - lastInitTime < 2000) {
            console.log("⏭️ Skipping redundant initialization (debounced).");
            setLoading(false);
            initializingRef.current = false;
            clearTimeout(timeoutId);
            return;
        }
        window.lastInitTime = now;

        try {
            console.log("🚀 Initializing App with Supabase (Optimized)...");
            
            // Helper to wrap supabase calls with error handling
            const safeFetch = async (promise, description) => {
                try {
                    const result = await promise;
                    if (result.error) {
                        console.warn(`⚠️ Issue fetching ${description}:`, result.error.message);
                        return { data: null, error: result.error };
                    }
                    return result;
                } catch (e) {
                    console.error(`❌ Exception fetching ${description}:`, e);
                    return { data: null, error: e };
                }
            };

            // Fetch initial data from Supabase - ADDED LIMITS FOR SCALABILITY
            const [
                { data: productsData },
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
                { data: mechanicData }
            ] = await Promise.all([
                safeFetch(supabase.from('products').select('*'), 'products'),
                safeFetch(supabase.from('clients').select('*'), 'clients'),
                safeFetch(supabase.from('sales').select('*').order('date', { ascending: false }).limit(500), 'sales'),
                safeFetch(supabase.from('expenses').select('*').order('date', { ascending: false }).limit(500), 'expenses'),
                safeFetch(supabase.from('employees').select('*'), 'employees'),
                safeFetch(supabase.from('payroll').select('*').order('processed_at', { ascending: false }).limit(100), 'payroll'),
                safeFetch(supabase.from('business_profile').select('*').maybeSingle(), 'business_profile'),
                safeFetch(supabase.from('day_book').select('*').order('date', { ascending: false }).limit(31), 'day_book'),
                safeFetch(supabase.from('settings').select('*'), 'settings'),
                safeFetch(supabase.from('client_payments').select('*').order('date', { ascending: false }).limit(500), 'client_payments'),
                safeFetch(supabase.from('users').select('*'), 'users'),
                safeFetch(supabase.from('vehicles').select('*'), 'vehicles'),
                safeFetch(supabase.from('movement_log').select('*').order('date', { ascending: false }).limit(200), 'movement_log'),
                safeFetch(supabase.from('routes').select('*').order('date', { ascending: false }).limit(100), 'routes'),
                safeFetch(supabase.from('purchases').select('*').order('date', { ascending: false }).limit(200), 'purchases'),
                safeFetch(supabase.from('mechanic_payments').select('*').order('work_date', { ascending: false }).limit(100), 'mechanic_payments')
            ]);
            
            if (productsData) setProducts(productsData);
            if (clientsData) setClients(clientsData);
            if (salesData) setSales(salesData);
            if (expensesData) setExpenses(expensesData);
            if (usersData) setUsers(usersData);
            if (dayBookData) setDayBook(dayBookData);
            if (paymentsData) setClientPayments(paymentsData);
            
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
                // Group individual records by month/period to recreate "Pay Runs"
                const grouped = payrollData.reduce((acc, rec) => {
                    const period = rec.month || 'Unknown';
                    if (!acc[period]) {
                        acc[period] = {
                            id: `RUN-${period}`,
                            period: period,
                            processedAt: rec.processed_at,
                            totalBase: 0, totalOvertime: 0, totalBonus: 0, totalDeductions: 0,
                            totalNet: 0, totalEmployees: 0,
                            items: []
                        };
                    }
                    acc[period].items.push({
                        employeeId: rec.employeeId,
                        employeeName: getEmployeeName(rec.employeeId),
                        netPay: rec.amount
                    });
                    acc[period].totalNet += rec.amount;
                    acc[period].totalEmployees += 1;
                    return acc;
                }, {});
                setPayrollRecords(Object.values(grouped));
            }

            if (vehiclesData) setVehicles(vehiclesData);
            if (routesData) setRoutes(routesData);
            if (purchasesData) setPurchases(purchasesData);
            if (mechanicData) setMechanicPayments(mechanicData);
            if (businessData) setBusinessProfile(businessData);
            
            if (movementData) {
                const mappedLog = movementData.map(log => ({
                    ...log,
                    productId: log.product_id,
                    productName: log.product_name,
                    userId: log.user_id
                }));
                setMovementLog(mappedLog);
            }
            
            if (settingsData) {
                const categories = settingsData.find(s => s.key === 'expense_categories');
                if (categories) setExpenseCategories(categories.value);
            }
            
            console.log("🏁 Initialization Complete.");
        } catch (err) {
            console.error("❌ Initialization error:", err);
            setInitError(err.message || "An unexpected error occurred during initialization.");
        } finally {
            clearTimeout(timeoutId);
            setLoading(false);
            initializingRef.current = false;
        }
    };

    // Supabase Auth Listener
    useEffect(() => {
        if (!isSupabaseConfigured) return;

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                // Fetch user roles/profile from public.users
                const { data: profile } = await supabase.from('users').select('*').eq('id', session.user.id).maybeSingle();
                
                if (profile) {
                    setCurrentUser(profile);
                } else {
                    const isSuperUser = session.user.email === 'uvaize@hotmail.com' || session.user.email === 'gladmin@ledgrpro.ca';
                    const newUserProfile = {
                        id: session.user.id,
                        email: session.user.email,
                        name: session.user.email.split('@')[0],
                        roles: isSuperUser ? ['GLOBAL_ADMIN', 'OWNER'] : ['STAFF'],
                        status: 'ACTIVE'
                    };
                    setCurrentUser(newUserProfile);
                    
                    // Auto-persist superuser profile to public.users if missing
                    if (isSuperUser) {
                        try {
                            const { error } = await supabase.from('users').upsert(newUserProfile);
                            if (error) console.error("Error auto-provisioning superuser:", error.message);
                        } catch (e) {
                            console.error("Auto-provisioning exception:", e.message);
                        }
                    }
                }

                // Whenever we have a NEW user session, refresh data
                if (event === 'SIGNED_IN') {
                    initializeApp();
                }
            } else {
                setCurrentUser(null);
            }
        });

        return () => subscription.unsubscribe();
    }, [isSupabaseConfigured]);

    // Initial load
    useEffect(() => {
        initializeApp();
    }, []);

    const isOwner = currentUser?.roles?.includes('OWNER') || currentUser?.roles?.includes('GLOBAL_ADMIN') || currentUser?.role?.toLowerCase() === 'owner' || currentUser?.email === 'uvaize@hotmail.com';
    const isStaff = currentUser?.roles?.includes('STAFF') || currentUser?.role?.toLowerCase() === 'staff';

    const value = {
        currentUser, session: currentUser, isOwner, isStaff, login, logout,
        businessProfile, updateBusinessProfile,        // Data
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
        dayBook, updateDayBook, getDayBookForDate,
        recordClientPayment, clientPayments,
        notifications, addNotification,
        loading, initError, migrateLocalToSupabase, resetAndSeedLocal, resetAndSeedCloud
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
