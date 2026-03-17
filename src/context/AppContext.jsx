import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const AppContext = createContext();

export const useAppContext = () => useContext(AppContext);

// Force clear old localStorage schema
const clearOldData = () => {
    if (!localStorage.getItem('ledgr_version_1')) {
        localStorage.removeItem('sm_products');
        localStorage.removeItem('sm_vehicles');
        localStorage.setItem('ledgr_version_1', '1.0');
    }
};
clearOldData();

// Migrate user roles from string to array format
const migrateUserRoles = () => {
    const saved = localStorage.getItem('sm_users');
    if (saved) {
        const users = JSON.parse(saved);
        let needsMigration = false;
        const migrated = users.map(u => {
            if (typeof u.role === 'string' && !u.roles) {
                needsMigration = true;
                return { ...u, roles: [u.role] };
            }
            return u;
        });
        if (needsMigration) {
            localStorage.setItem('sm_users', JSON.stringify(migrated));
        }
    }
};
migrateUserRoles();

// Migrate products to include taxRate
const migrateProductTax = () => {
    const saved = localStorage.getItem('sm_products');
    if (saved) {
        const products = JSON.parse(saved);
        let needsMigration = false;
        const migrated = products.map(p => {
            if (p.taxRate === undefined) {
                needsMigration = true;
                return { ...p, taxRate: 0 };
            }
            return p;
        });
        if (needsMigration) {
            localStorage.setItem('sm_products', JSON.stringify(migrated));
        }
    }
};
migrateProductTax();

// Migrate orders to include totalAmount and paymentStatus
const migrateOrders = () => {
    const saved = localStorage.getItem('sm_orders');
    if (saved) {
        try {
            const orders = JSON.parse(saved);
            let needsMigration = false;
            const migrated = orders.map(o => {
                let updated = { ...o };
                if (o.totalAmount === undefined && o.total !== undefined) {
                    needsMigration = true;
                    updated.totalAmount = o.total;
                }
                if (o.paymentStatus === undefined) {
                    needsMigration = true;
                    updated.paymentStatus = o.paymentMethod === 'CASH' ? 'PAID' : 'PENDING';
                }
                return updated;
            });
            if (needsMigration) {
                localStorage.setItem('sm_orders', JSON.stringify(migrated));
            }
        } catch (e) {
            console.error("Order migration failed", e);
        }
    }
};
migrateOrders();

// Enhanced Initial Mock Data
// mockdata: Expanded products for testing
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
    name: 'Ledger Demo Corp',
    country: 'United Arab Emirates', // Default country
    currency: 'AED',
    currencySymbol: 'AED',
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

export const AppProvider = ({ children }) => {
    const [loading, setLoading] = useState(true);
    // Users
    const [users, setUsers] = useState(() => {
        try {
            const saved = localStorage.getItem('sm_users');
            return saved ? JSON.parse(saved) : INITIAL_USERS;
        } catch (e) {
            console.error("Failed to load users from localStorage", e);
            return INITIAL_USERS;
        }
    });

    const [currentUser, setCurrentUser] = useState(() => {
        // Force authentication bypass for UI development
        return INITIAL_USERS[0]; // Global Admin
    });

    // Business Profile
    const [businessProfile, setBusinessProfile] = useState(() => {
        try {
            const saved = localStorage.getItem('sm_business');
            return saved ? JSON.parse(saved) : INITIAL_BUSINESS;
        } catch (e) {
            console.error("Failed to load business profile", e);
            return INITIAL_BUSINESS;
        }
    });

    // Data States
    const [products, setProducts] = useState(() => {
        try {
            const saved = localStorage.getItem('sm_products');
            return saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
        } catch (e) {
            return INITIAL_PRODUCTS;
        }
    });

    const [shops, setShops] = useState(() => {
        try {
            const saved = localStorage.getItem('sm_shops');
            return saved ? JSON.parse(saved) : INITIAL_SHOPS;
        } catch (e) {
            return INITIAL_SHOPS;
        }
    });

    const [orders, setOrders] = useState(() => {
        try {
            const saved = localStorage.getItem('sm_orders');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    });

    const [expenses, setExpenses] = useState(() => {
        const saved = localStorage.getItem('sm_expenses');
        return saved ? JSON.parse(saved) : [];
    });

    const [movementLog, setMovementLog] = useState(() => {
        const saved = localStorage.getItem('sm_movement_log');
        return saved ? JSON.parse(saved) : [];
    });

    const [vehicles, setVehicles] = useState(() => {
        const saved = localStorage.getItem('sm_vehicles');
        return saved ? JSON.parse(saved) : INITIAL_VEHICLES;
    });

    const [routes, setRoutes] = useState(() => {
        const saved = localStorage.getItem('sm_routes');
        return saved ? JSON.parse(saved) : [];
    });

    // Payroll: Employees
    const [employees, setEmployees] = useState(() => {
        const saved = localStorage.getItem('sm_employees');
        return saved ? JSON.parse(saved) : INITIAL_EMPLOYEES;
    });

    // Payroll: Pay Records
    const [payrollRecords, setPayrollRecords] = useState(() => {
        const saved = localStorage.getItem('sm_payroll');
        return saved ? JSON.parse(saved) : [];
    });

    const [expenseCategories, setExpenseCategories] = useState(() => {
        const saved = localStorage.getItem('sm_expense_categories');
        return saved ? JSON.parse(saved) : INITIAL_EXPENSE_CATEGORIES;
    });

    const [notifications, setNotifications] = useState([]);

    const addNotification = (message, type = 'success') => {
        const id = `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        setNotifications(prev => [{ id, message, type, date: new Date().toISOString() }, ...prev].slice(0, 5));
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 5000);
    };

    // Persistence Effects (Legacy LocalStorage Fallback + Initial Sync)
    useEffect(() => { localStorage.setItem('sm_business', JSON.stringify(businessProfile)); }, [businessProfile]);
    useEffect(() => { localStorage.setItem('sm_products', JSON.stringify(products)); }, [products]);
    useEffect(() => { localStorage.setItem('sm_shops', JSON.stringify(shops)); }, [shops]);
    useEffect(() => { localStorage.setItem('sm_orders', JSON.stringify(orders)); }, [orders]);
    useEffect(() => { localStorage.setItem('sm_expenses', JSON.stringify(expenses)); }, [expenses]);
    useEffect(() => { localStorage.setItem('sm_movement_log', JSON.stringify(movementLog)); }, [movementLog]);
    useEffect(() => { localStorage.setItem('sm_vehicles', JSON.stringify(vehicles)); }, [vehicles]);
    useEffect(() => { localStorage.setItem('sm_routes', JSON.stringify(routes)); }, [routes]);
    useEffect(() => { localStorage.setItem('sm_users', JSON.stringify(users)); }, [users]);
    useEffect(() => { localStorage.setItem('sm_employees', JSON.stringify(employees)); }, [employees]);
    useEffect(() => { localStorage.setItem('sm_payroll', JSON.stringify(payrollRecords)); }, [payrollRecords]);
    useEffect(() => { localStorage.setItem('sm_expense_categories', JSON.stringify(expenseCategories)); }, [expenseCategories]);

    const initializingRef = useRef(false);

    // Supabase Sync & Init
    useEffect(() => {
        const initializeApp = async () => {
            setLoading(true);
            try {
                console.log("🚀 Initializing App with Supabase...");
                
                // Fetch initial data from Supabase
                const [
                    { data: sbProducts },
                    { data: sbShops },
                    { data: sbOrders },
                    { data: sbExpenses },
                    { data: sbUsers },
                    { data: sbEmployees },
                    { data: sbVehicles },
                    { data: sbBusiness },
                    { data: sbSettings }
                ] = await Promise.all([
                    supabase.from('products').select('*'),
                    supabase.from('shops').select('*'),
                    supabase.from('orders').select('*').order('date', { ascending: false }),
                    supabase.from('expenses').select('*').order('date', { ascending: false }),
                    supabase.from('users').select('*'),
                    supabase.from('employees').select('*'),
                    supabase.from('vehicles').select('*'),
                    supabase.from('business_profile').select('*').single(),
                    supabase.from('settings').select('*')
                ]);

                if (sbProducts) setProducts(sbProducts);
                if (sbShops) setShops(sbShops);
                if (sbOrders) setOrders(sbOrders);
                if (sbExpenses) setExpenses(sbExpenses);
                if (sbUsers) setUsers(sbUsers);
                if (sbEmployees) setEmployees(sbEmployees);
                if (sbVehicles) setVehicles(sbVehicles);
                if (sbBusiness) setBusinessProfile(sbBusiness);
                
                if (sbSettings) {
                    const categories = sbSettings.find(s => s.key === 'expense_categories');
                    if (categories) setExpenseCategories(categories.value);
                }

                // Try to restore session from localStorage if available
                const savedUser = localStorage.getItem('sm_current_user');
                if (savedUser) {
                    setCurrentUser(JSON.parse(savedUser));
                }
                
                console.log("🏁 Initialization Complete.");
            } catch (err) {
                console.error("Initialization error:", err);
            } finally {
                setLoading(false);
            }
        };

        initializeApp();
    }, []);

    // Helper: Local persistence for current user
    useEffect(() => {
        if (currentUser) {
            localStorage.setItem('sm_current_user', JSON.stringify(currentUser));
        } else {
            localStorage.removeItem('sm_current_user');
        }
    }, [currentUser]);

    // Data Actions (LOCAL ONLY)
    const login = async (email, password) => {
        // Simple local check against mock or saved users
        const user = users.find(u => u.email === email && (password === 'password' || password === 'admin123'));
        if (user) {
            setCurrentUser(user);
            return { success: true };
        }
        return { success: false, error: 'Invalid local credentials' };
    };

    const logout = async () => {
        setCurrentUser(null);
    };

    const addUser = async (userData) => {
        const newUser = {
            ...userData,
            id: userData.id || `USR-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            status: 'ACTIVE',
            roles: userData.roles || [userData.role || 'STAFF']
        };
        
        const { error } = await supabase.from('users').upsert(newUser);
        if (error) {
            console.error("Error adding user to Supabase:", error);
            addNotification("Failed to save user to cloud", "error");
            return;
        }

        setUsers([...users, newUser]);
    };

    const updateUser = async (updatedUser) => {
        const { error } = await supabase.from('users').upsert(updatedUser);
        if (error) {
            console.error("Error updating user in Supabase:", error);
            addNotification("Failed to update user in cloud", "error");
            return;
        }
        setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
    };

    const deleteUser = async (userId) => {
        if (userId === currentUser?.id) return;
        
        const { error } = await supabase.from('users').delete().eq('id', userId);
        if (error) {
            console.error("Error deleting user from Supabase:", error);
            addNotification("Failed to delete user from cloud", "error");
            return;
        }

        setUsers(users.filter(u => u.id !== userId));
    };

    const addShop = async (shop) => {
        const newShop = { ...shop, id: shop.id || `CLI-${Date.now()}-${Math.random().toString(36).substr(2, 5)}` };
        
        const { error } = await supabase.from('shops').upsert(newShop);
        if (error) {
            console.error("Error adding shop to Supabase:", error);
            addNotification("Failed to save shop to cloud", "error");
            return;
        }

        setShops([newShop, ...shops]);
    };

    const updateShop = async (updatedShop) => {
        const { error } = await supabase.from('shops').upsert(updatedShop);
        if (error) {
            console.error("Error updating shop in Supabase:", error);
            addNotification("Failed to update shop in cloud", "error");
            return;
        }
        setShops(shops.map(s => s.id === updatedShop.id ? updatedShop : s));
    };

    const deleteShop = async (shopId) => {
        const { error } = await supabase.from('shops').delete().eq('id', shopId);
        if (error) {
            console.error("Error deleting shop from Supabase:", error);
            addNotification("Failed to delete shop from cloud", "error");
            return;
        }
        setShops(shops.filter(s => s.id !== shopId));
    };

    const addExpense = async (expense) => {
        const newExpense = { 
            ...expense, 
            id: expense.id || `EXP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, 
            date: expense.date || new Date().toISOString(),
            route_id: expense.routeId 
        };
        
        const { error } = await supabase.from('expenses').upsert(newExpense);
        if (error) {
            console.error("Error adding expense to Supabase:", error);
            addNotification("Failed to save expense to cloud", "error");
            return;
        }

        setExpenses([newExpense, ...expenses]);
        addNotification(`Expense recorded: ${businessProfile?.currencySymbol || ''}${expense.amount}`, 'expense');
    };

    const updateExpense = async (updatedExpense) => {
        const { error } = await supabase.from('expenses').upsert(updatedExpense);
        if (error) {
            console.error("Error updating expense in Supabase:", error);
            addNotification("Failed to update expense in cloud", "error");
            return;
        }
        setExpenses(expenses.map(e => e.id === updatedExpense.id ? updatedExpense : e));
        addNotification(`Expense updated: ${businessProfile?.currencySymbol || ''}${updatedExpense.amount}`, 'success');
    };

    const deleteExpense = async (expenseId) => {
        const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
        if (error) {
            console.error("Error deleting expense from Supabase:", error);
            addNotification("Failed to delete expense from cloud", "error");
            return;
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
            type, 
            quantity, 
            reason, 
            user_id: userId
        };

        const { error } = await supabase.from('movement_log').insert(newLog);
        if (error) {
            console.error("Error logging movement to Supabase:", error);
            // Don't block the UI for logs, but notify if critical
        }

        setMovementLog(prev => [newLog, ...prev]);
    };

    const placeOrder = async (shopId, cartItems, subtotal, discount, tax, totalAmount, customerInfo, paymentMethod = 'CASH', routeId = null, status = 'COMPLETED', scheduledDate = null, salesmanNote = '') => {
        let totalCogs = 0;
        const updatedProducts = [...products];

        cartItems.forEach(item => {
            const pIndex = updatedProducts.findIndex(p => p.id === item.productId);
            if (pIndex > -1) {
                if (status === 'COMPLETED' && !routeId) {
                    updatedProducts[pIndex].stock -= item.quantity;
                }
                item.cogs = updatedProducts[pIndex].costPrice * item.quantity;
                logMovement(item.productId, item.name, 'OUT', item.quantity, `Sale to Shop #${shopId}`, currentUser?.id);
            }
        });

        totalCogs = cartItems.reduce((sum, item) => sum + (item.cogs || 0), 0);

        const newOrder = {
            id: `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            shopId,
            customerInfo,
            paymentMethod,
            paymentStatus: paymentMethod === 'CASH' ? 'PAID' : 'PENDING',
            routeId,
            items: cartItems,
            subtotal, discount, tax, 
            totalAmount,
            totalCogs,
            date: new Date().toISOString(),
            salesRepId: currentUser?.id || 'LOCAL',
            bookedBy: currentUser?.id || 'LOCAL',
            status,
            scheduledDate: scheduledDate || new Date().toISOString().split('T')[0],
            deliveredBy: routeId || null,
            note: salesmanNote
        };

        const { error } = await supabase.from('orders').upsert(newOrder);
        if (error) {
            console.error("Error saving order to Supabase:", error);
            addNotification("Failed to save order to cloud", "error");
            return null;
        }

        if (status === 'COMPLETED' && !routeId) {
            setProducts(updatedProducts);
            // Also need to push updated stock to Supabase
            await Promise.all(cartItems.map(item => {
                const p = updatedProducts.find(up => up.id === item.productId);
                return supabase.from('products').update({ stock: p.stock }).eq('id', p.id);
            }));
        }

        setOrders([newOrder, ...orders]);
        addNotification(`New Order: ${businessProfile?.currencySymbol || ''}${totalAmount.toFixed(2)}`, 'success');
        return newOrder.id;
    };

    const updateOrder = async (updatedOrder) => {
        const oldOrder = orders.find(o => o.id === updatedOrder.id);
        if (oldOrder && oldOrder.status === 'PENDING' && updatedOrder.status === 'COMPLETED') {
            const updatedProducts = [...products];
            for (const item of updatedOrder.items) {
                const pIndex = updatedProducts.findIndex(p => p.id === item.productId);
                if (pIndex > -1) {
                    updatedProducts[pIndex] = {
                        ...updatedProducts[pIndex],
                        stock: Math.max(0, updatedProducts[pIndex].stock - item.quantity)
                    };
                }
                logMovement(item.productId, item.name, 'OUT', item.quantity, `Fulfilled Order #${updatedOrder.id}`, currentUser?.id);
            }
            setProducts(updatedProducts);
        }
        setOrders(orders.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    };

    const settleOrder = async (orderId, amount, method = 'CASH') => {
        setOrders(prev => prev.map(o => {
            if (o.id === orderId) {
                const isFullPayment = amount >= o.totalAmount;
                const newStatus = isFullPayment ? 'PAID' : 'PARTIAL';
                addNotification(`Payment received for #${orderId.split('-').pop()}: ${businessProfile.currencySymbol}${amount}`, 'success');
                return { 
                    ...o, 
                    paymentStatus: newStatus,
                    paidAmount: (o.paidAmount || 0) + amount,
                    lastPaymentDate: new Date().toISOString()
                };
            }
            return o;
        }));
    };

    const addProduct = async (product) => {
        const newProduct = { 
            ...product, 
            id: product.id || `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, 
            stock: product.stock || 0, 
            taxRate: product.taxRate || 0 
        };

        const { error } = await supabase.from('products').upsert(newProduct);
        if (error) {
            console.error("Error adding product to Supabase:", error);
            addNotification("Failed to save product to cloud", "error");
            return;
        }

        setProducts([...products, newProduct]);
        if (newProduct.stock > 0) {
            logMovement(newProduct.id, newProduct.name, 'IN', newProduct.stock, 'Initial Stock', currentUser?.id);
        }
    };

    const updateProduct = async (updatedProduct) => {
        const { error } = await supabase.from('products').upsert(updatedProduct);
        if (error) {
            console.error("Error updating product in Supabase:", error);
            addNotification("Failed to update product in cloud", "error");
            return;
        }
        setProducts(products.map(p => p.id === updatedProduct.id ? updatedProduct : p));
    };

    const deleteProduct = async (id) => {
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) {
            console.error("Error deleting product from Supabase:", error);
            addNotification("Failed to delete product from cloud", "error");
            return;
        }
        setProducts(prev => prev.filter(p => p.id !== id));
        setMovementLog(prev => prev.filter(l => l.productId !== id));
    };

    const adjustStock = async (productId, amount, reason, source = 'ADJUSTMENT') => {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        const updatedProduct = { ...product, stock: Math.max(0, product.stock + amount) };
        setProducts(products.map(p => p.id === productId ? updatedProduct : p));
        const type = amount > 0 ? 'IN' : 'OUT';
        logMovement(productId, product.name, type, Math.abs(amount), reason, currentUser?.id);
    };

    /**
     * Mass Mock Data Generator
     * Generates 200+ entries for all modules to simulate production scale.
     */
    const generateMassMockData = () => {
        const categories = ['Cups', 'Plates', 'Covers', 'Cutlery', 'Sheets', 'Bags', 'Napkins'];
        const units = ['pcs', 'kg', 'box', 'set'];
        const shopNames = ['Hypermarket', 'Supermarket', 'Bazaar', 'Mart', 'Stores', 'Corner', 'Plaza'];
        const trivandrumAreas = ['Akkulam', 'Kulathoor', 'Sasthamangalam', 'Vazhuthacaud', 'Pattom', 'Lulu', 'Technopark'];

        // 1. Products (200)
        const massProducts = Array.from({ length: 200 }, (_, i) => {
            const cat = categories[i % categories.length];
            return {
                id: `PROD-MASS-${i + 1}`,
                sku: `${cat.slice(0, 3).toUpperCase()}-${100 + i}`,
                name: `${cat} Premium Type ${i + 1}`,
                category: cat,
                unit: units[i % units.length],
                costPrice: parseFloat((Math.random() * 5 + 0.1).toFixed(2)),
                sellingPrice: parseFloat((Math.random() * 10 + 6).toFixed(2)),
                stock: Math.floor(Math.random() * 5000) + 100,
                taxRate: i % 5 === 0 ? 5 : 0,
                tags: [cat.toLowerCase()],
                image: '/images/paper_cups_white.png'
            };
        });

        // 2. Shops (200)
        const massShops = Array.from({ length: 200 }, (_, i) => ({
            id: `CLI-MASS-${i + 1}`,
            name: `${trivandrumAreas[i % trivandrumAreas.length]} ${shopNames[i % shopNames.length]} #${i + 1}`,
            contact: `Manager ${i + 1}`,
            phone: `+91 471 ${1000000 + i}`,
            address: `${trivandrumAreas[i % trivandrumAreas.length]}, Trivandrum, Kerala`
        }));

        // 3. Orders (250)
        const massOrders = Array.from({ length: 250 }, (_, i) => {
            const shop = massShops[Math.floor(Math.random() * massShops.length)];
            const orderItems = Array.from({ length: Math.floor(Math.random() * 5) + 1 }, () => {
                const prod = massProducts[Math.floor(Math.random() * massProducts.length)];
                const qty = Math.floor(Math.random() * 10) + 1;
                return {
                    productId: prod.id,
                    name: prod.name,
                    quantity: qty,
                    price: prod.sellingPrice,
                    total: qty * prod.sellingPrice,
                    cogs: prod.costPrice * qty
                };
            });

            const subtotal = orderItems.reduce((s, item) => s + item.total, 0);
            return {
                id: `ORD-MASS-${i + 1}`,
                shopId: shop.id,
                items: orderItems,
                subtotal,
                discount: 0,
                tax: subtotal * 0.05,
                totalAmount: subtotal * 1.05,
                totalCogs: orderItems.reduce((s, item) => s + (item.cogs || 0), 0),
                date: new Date(Date.now() - Math.floor(Math.random() * 14 * 24 * 60 * 60 * 1000)).toISOString(),
                status: 'COMPLETED',
                paymentMethod: i % 3 === 0 ? 'CREDIT' : 'CASH'
            };
        });

        // 4. Expenses (200)
        const massExpenses = Array.from({ length: 200 }, (_, i) => ({
            id: `EXP-MASS-${i + 1}`,
            category: i % 4 === 0 ? 'Fuel' : (i % 4 === 1 ? 'Rent' : 'Utility'),
            amount: Math.floor(Math.random() * 500) + 50,
            note: `Monthly operational cost ${i + 1}`,
            date: new Date(Date.now() - Math.floor(Math.random() * 10 * 24 * 60 * 60 * 1000)).toISOString()
        }));

        // 5. Payroll (50 Staff & 150 PayRecords)
        const massEmployees = Array.from({ length: 50 }, (_, i) => ({
            id: `EMP-MASS-${i + 1}`,
            name: `Staff Member ${i + 1}`,
            role: i % 5 === 0 ? 'MANAGER' : 'SALES',
            salary: 1500 + (Math.random() * 2000),
            status: 'ACTIVE'
        }));

        const massPayroll = Array.from({ length: 150 }, (_, i) => ({
            id: `PAY-MASS-${i + 1}`,
            employeeId: massEmployees[i % massEmployees.length].id,
            amount: massEmployees[i % massEmployees.length].salary,
            month: 'March 2026',
            processed_at: new Date().toISOString()
        }));

        return {
            products: massProducts,
            shops: massShops,
            orders: massOrders,
            expenses: massExpenses,
            employees: massEmployees,
            payroll: massPayroll
        };
    };

    /**
     * resetAndSeedLocal: Generates 1200+ total data entries for local mode.
     */
    const resetAndSeedLocal = async () => {
        if (!confirm("🚨 MASS SEEDER: This will generate 1200+ local entries for stress testing. Proceed?")) return;
        
        setLoading(true);
        try {
            const data = generateMassMockData();
            
            setUsers(INITIAL_USERS);
            setProducts([...INITIAL_PRODUCTS, ...data.products]);
            setShops([...INITIAL_SHOPS, ...data.shops]);
            setVehicles(INITIAL_VEHICLES);
            setOrders(data.orders);
            setExpenses(data.expenses);
            setEmployees(data.employees);
            setPayrollRecords(data.payroll);
            setMovementLog([]); // Reset log for clean start

            alert("✅ Mass data seeder complete! 1200+ entries generated.");
        } catch (err) {
            console.error("Mass seeding failed:", err);
            alert("Mass seeding failed.");
        } finally {
            setLoading(false);
        }
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

    const getShopName = (shopId) => {
        if (shopId === 'POS-WALKIN') return 'Walk-in Customer';
        const shop = shops.find(s => s.id === shopId);
        return shop ? shop.name : 'Unknown Shop';
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
        const { error } = await supabase.from('vehicles').upsert(newVehicle);
        if (error) {
            console.error("Error adding vehicle to Supabase:", error);
            addNotification("Failed to save vehicle to cloud", "error");
            return;
        }
        setVehicles([...vehicles, newVehicle]);
    };

    const updateVehicle = async (updated) => {
        const { error } = await supabase.from('vehicles').upsert(updated);
        if (error) {
            console.error("Error updating vehicle in Supabase:", error);
            addNotification("Failed to update vehicle in cloud", "error");
            return;
        }
        setVehicles(vehicles.map(v => v.id === updated.id ? updated : v));
    };

    const dispatchRoute = async (routeData) => {
        const newRoute = {
            ...routeData,
            id: routeData.id || `RT-${Date.now()}`,
            status: 'ACTIVE',
            date: new Date().toISOString()
        };

        const { error: routeError } = await supabase.from('routes').upsert(newRoute);
        if (routeError) {
            console.error("Error dispatching route to Supabase:", routeError);
            addNotification("Failed to dispatch route to cloud", "error");
            return;
        }

        const updatedProducts = [...products];
        const stockUpdates = [];

        for (const item of routeData.loadedStock) {
            const pIndex = updatedProducts.findIndex(p => p.id === item.productId);
            if (pIndex > -1 && item.quantity > 0) {
                updatedProducts[pIndex].stock -= item.quantity;
                logMovement(item.productId, updatedProducts[pIndex].name, 'OUT', item.quantity, `Loaded onto Route ${newRoute.id}`, currentUser?.id);
                stockUpdates.push(supabase.from('products').update({ stock: updatedProducts[pIndex].stock }).eq('id', item.productId));
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

        const { error: routeError } = await supabase.from('routes').upsert(updatedRoute);
        if (routeError) {
            console.error("Error reconciling route in Supabase:", routeError);
            addNotification("Failed to reconcile route in cloud", "error");
            return;
        }

        const updatedProducts = [...products];
        const stockUpdates = [];

        for (const item of returnedStock) {
            if (item.quantity > 0) {
                const pIndex = updatedProducts.findIndex(p => p.id === item.productId);
                if (pIndex > -1) {
                    updatedProducts[pIndex].stock += item.quantity;
                    logMovement(item.productId, updatedProducts[pIndex].name, 'IN', item.quantity, `Returned from Route ${routeId}`, currentUser?.id);
                    stockUpdates.push(supabase.from('products').update({ stock: updatedProducts[pIndex].stock }).eq('id', item.productId));
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
        const newEmp = {
            ...emp,
            id: emp.id || `EMP-${Date.now()}`,
            status: 'ACTIVE',
            created_at: new Date().toISOString()
        };
        const { error } = await supabase.from('employees').upsert(newEmp);
        if (error) {
            console.error("Error adding employee to Supabase:", error);
            addNotification("Failed to save employee to cloud", "error");
            return;
        }
        setEmployees(prev => [...prev, newEmp]);
    };

    const updateEmployee = async (updated) => {
        const { error } = await supabase.from('employees').upsert(updated);
        if (error) {
            console.error("Error updating employee in Supabase:", error);
            addNotification("Failed to update employee in cloud", "error");
            return;
        }
        setEmployees(employees.map(e => e.id === updated.id ? updated : e));
    };

    const deleteEmployee = async (empId) => {
        const { error } = await supabase.from('employees').delete().eq('id', empId);
        if (error) {
            console.error("Error deleting employee from Supabase:", error);
            addNotification("Failed to delete employee from cloud", "error");
            return;
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
        const { error } = await supabase.from('payroll').upsert(newRecord);
        if (error) {
            console.error("Error processing payroll in Supabase:", error);
            addNotification("Failed to process payroll in cloud", "error");
            return;
        }
        setPayrollRecords(prev => [newRecord, ...prev]);
    };

    const deletePayrollRecord = async (recordId) => {
        const { error } = await supabase.from('payroll').delete().eq('id', recordId);
        if (error) {
            console.error("Error deleting payroll record from Supabase:", error);
            addNotification("Failed to delete payroll record from cloud", "error");
            return;
        }
        setPayrollRecords(payrollRecords.filter(r => r.id !== recordId));
    };

    const migrateLocalToSupabase = async () => {
        setLoading(true);
        try {
            addNotification("Starting migration to Supabase...", "info");
            
            // 1. Fetch current local data
            const localProducts = JSON.parse(localStorage.getItem('sm_products') || '[]');
            const localShops = JSON.parse(localStorage.getItem('sm_shops') || '[]');
            const localOrders = JSON.parse(localStorage.getItem('sm_orders') || '[]');
            const localExpenses = JSON.parse(localStorage.getItem('sm_expenses') || '[]');
            const localUsers = JSON.parse(localStorage.getItem('sm_users') || '[]');
            const localEmployees = JSON.parse(localStorage.getItem('sm_employees') || '[]');
            const localVehicles = JSON.parse(localStorage.getItem('sm_vehicles') || '[]');

            // 2. Upsert to Supabase
            const migrationTasks = [
                localProducts.length > 0 && supabase.from('products').upsert(localProducts),
                localShops.length > 0 && supabase.from('shops').upsert(localShops),
                localOrders.length > 0 && supabase.from('orders').upsert(localOrders),
                localExpenses.length > 0 && supabase.from('expenses').upsert(localExpenses),
                localUsers.length > 0 && supabase.from('users').upsert(localUsers),
                localEmployees.length > 0 && supabase.from('employees').upsert(localEmployees),
                localVehicles.length > 0 && supabase.from('vehicles').upsert(localVehicles)
            ].filter(Boolean);

            await Promise.all(migrationTasks);

            addNotification("Migration complete! Data is now in the cloud.", "success");
            
            // Re-initialize to fetch fresh data
            window.location.reload(); 
        } catch (err) {
            console.error("Migration failed:", err);
            addNotification("Migration failed. Please check console.", "error");
        } finally {
            setLoading(false);
        }
    };

    const updateBusinessProfile = async (profile) => {
        const { error } = await supabase.from('business_profile').upsert({ id: 'current', ...profile });
        if (error) {
            console.error("Error updating business profile in Supabase:", error);
            addNotification("Failed to update business profile in cloud", "error");
            return;
        }
        setBusinessProfile(profile);
    };

    const addExpenseCategory = async (name) => {
        if (!name || expenseCategories.includes(name)) return;
        const newCategories = [...expenseCategories, name];
        
        const { error } = await supabase.from('settings').upsert({ key: 'expense_categories', value: newCategories });
        if (error) {
            console.error("Error adding expense category to Supabase:", error);
            addNotification("Failed to save category to cloud", "error");
            return;
        }

        setExpenseCategories(newCategories);
        addNotification(`Category added: ${name}`, 'success');
    };

    const updateExpenseCategory = async (oldName, newName) => {
        if (!newName || expenseCategories.includes(newName)) return;
        const newCategories = expenseCategories.map(c => c === oldName ? newName : c);
        
        const { error } = await supabase.from('settings').upsert({ key: 'expense_categories', value: newCategories });
        if (error) {
            console.error("Error updating expense category in Supabase:", error);
            addNotification("Failed to update category in cloud", "error");
            return;
        }

        setExpenseCategories(newCategories);
        setExpenses(expenses.map(e => e.category === oldName ? { ...e, category: newName } : e));
        addNotification(`Category updated: ${newName}`, 'success');
    };

    const deleteExpenseCategory = async (name) => {
        const newCategories = expenseCategories.filter(c => c !== name);
        
        const { error } = await supabase.from('settings').upsert({ key: 'expense_categories', value: newCategories });
        if (error) {
            console.error("Error deleting expense category from Supabase:", error);
            addNotification("Failed to delete category from cloud", "error");
            return;
        }

        setExpenseCategories(newCategories);
        addNotification(`Category removed: ${name}`, 'success');
    };

    const value = {
        currentUser, login, logout,
        businessProfile, updateBusinessProfile,
        products, addProduct, updateProduct, deleteProduct, adjustStock,
        shops, addShop, updateShop, deleteShop,
        orders, placeOrder, updateOrder, settleOrder,
        expenses, addExpense, updateExpense, deleteExpense,
        expenseCategories, addExpenseCategory, updateExpenseCategory, deleteExpenseCategory,
        movementLog,
        vehicles, addVehicle, updateVehicle,
        routes, dispatchRoute, reconcileRoute,
        users, addUser, updateUser, deleteUser,
        hasRole, hasPermission, isViewOnly,
        getUserName, getVehicleName, getShopName, getEmployeeName,
        employees, addEmployee, updateEmployee, deleteEmployee,
        payrollRecords, processPayroll, deletePayrollRecord,
        notifications, addNotification,
        loading, migrateLocalToSupabase, resetAndSeedLocal
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
