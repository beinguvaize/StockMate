import React, { createContext, useContext, useState, useEffect } from 'react';

const AppContext = createContext();

export const useAppContext = () => useContext(AppContext);

// Force clear old localStorage schema
const clearOldData = () => {
    if (!localStorage.getItem('stockmate_version_3')) {
        localStorage.removeItem('sm_products');
        localStorage.removeItem('sm_vehicles');
        localStorage.setItem('stockmate_version_3', '1.0');
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

// Migrate orders to include totalAmount (handle legacy "total" property)
const migrateOrders = () => {
    const saved = localStorage.getItem('sm_orders');
    if (saved) {
        try {
            const orders = JSON.parse(saved);
            let needsMigration = false;
            const migrated = orders.map(o => {
                if (o.totalAmount === undefined && o.total !== undefined) {
                    needsMigration = true;
                    return { ...o, totalAmount: o.total };
                }
                return o;
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
];

const INITIAL_USERS = [
    { id: 'u1', name: 'Admin User', email: 'admin@stockmate.com', roles: ['ADMIN'], status: 'ACTIVE' },
    { id: 'u2', name: 'Sales Rep 1', email: 'sales@stockmate.com', roles: ['SALES'], status: 'ACTIVE' },
];

const INITIAL_SHOPS = [
    { id: '1', name: 'Downtown Electronics', contact: 'John Doe', phone: '555-0101', address: '123 Main St' },
    { id: '2', name: 'Gadget World', contact: 'Jane Smith', phone: '555-0202', address: '456 Market Ave' },
];

const INITIAL_BUSINESS = {
    name: 'StockMate Demo Corp',
    currency: 'USD',
    currencySymbol: '$',
    lowStockThreshold: 20
};

// Available role definitions
export const AVAILABLE_ROLES = [
    { key: 'ADMIN', label: 'Administrator', description: 'Full access to all features' },
    { key: 'SALES', label: 'Sales Rep', description: 'Can create sales and manage POS' },
    { key: 'INVENTORY', label: 'Inventory Manager', description: 'Can manage products and stock' },
    { key: 'FLEET', label: 'Fleet Manager', description: 'Can manage vehicles and routes' },
    { key: 'VIEW_ONLY', label: 'View Only', description: 'Read-only access to all pages' },
];

export const AppProvider = ({ children }) => {
    // Users
    const [users, setUsers] = useState(() => {
        const saved = localStorage.getItem('sm_users');
        return saved ? JSON.parse(saved) : INITIAL_USERS;
    });

    const [currentUser, setCurrentUser] = useState(null);

    // Business Profile
    const [businessProfile, setBusinessProfile] = useState(() => {
        const saved = localStorage.getItem('sm_business');
        return saved ? JSON.parse(saved) : INITIAL_BUSINESS;
    });

    // Data States
    const [products, setProducts] = useState(() => {
        const saved = localStorage.getItem('sm_products');
        return saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
    });

    const [shops, setShops] = useState(() => {
        const saved = localStorage.getItem('sm_shops');
        return saved ? JSON.parse(saved) : INITIAL_SHOPS;
    });

    const [orders, setOrders] = useState(() => {
        const saved = localStorage.getItem('sm_orders');
        return saved ? JSON.parse(saved) : [];
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
        return saved ? JSON.parse(saved) : [{ id: 'v1', name: 'Delivery Van 1', plate: 'XYZ-123', image: '/images/van.png' }];
    });

    const [routes, setRoutes] = useState(() => {
        const saved = localStorage.getItem('sm_routes');
        return saved ? JSON.parse(saved) : [];
    });

    // Payroll: Employees
    const [employees, setEmployees] = useState(() => {
        const saved = localStorage.getItem('sm_employees');
        return saved ? JSON.parse(saved) : [];
    });

    // Payroll: Pay Records
    const [payrollRecords, setPayrollRecords] = useState(() => {
        const saved = localStorage.getItem('sm_payroll');
        return saved ? JSON.parse(saved) : [];
    });

    // Persistence Effects
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

    // Helper: check if current user has a specific role
    const hasRole = (role) => {
        if (!currentUser) return false;
        // Legacy support: if user has single 'role' string
        if (currentUser.role && !currentUser.roles) {
            return currentUser.role === role;
        }
        // Admin has all roles
        if (currentUser.roles && currentUser.roles.includes('ADMIN')) return true;
        return currentUser.roles && currentUser.roles.includes(role);
    };

    const isViewOnly = () => {
        if (!currentUser) return true;
        if (currentUser.roles && currentUser.roles.length === 1 && currentUser.roles.includes('VIEW_ONLY')) return true;
        return false;
    };

    // Actions
    const login = (userId) => {
        const user = users.find(u => u.id === userId);
        if (user && user.status === 'ACTIVE') {
            // Ensure roles array exists (backward compat)
            const normalizedUser = {
                ...user,
                roles: user.roles || (user.role ? [user.role] : ['SALES'])
            };
            setCurrentUser(normalizedUser);
            return true;
        }
        return false;
    };
    const logout = () => setCurrentUser(null);

    const addUser = (userData) => {
        const newUser = {
            ...userData,
            id: `USR-${Date.now()}`,
            status: 'ACTIVE',
            roles: userData.roles || [userData.role || 'SALES']
        };
        setUsers([...users, newUser]);
    };

    const updateUser = (updatedUser) => {
        setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
    };

    const deleteUser = (userId) => {
        if (userId === currentUser?.id) return; // Can't delete yourself
        setUsers(users.filter(u => u.id !== userId));
    };

    const addShop = (shop) => {
        const newShop = { ...shop, id: `CLI-${Date.now()}` };
        setShops([newShop, ...shops]);
    };

    const updateShop = (updatedShop) => {
        setShops(shops.map(s => s.id === updatedShop.id ? updatedShop : s));
    };

    const deleteShop = (shopId) => {
        setShops(shops.filter(s => s.id !== shopId));
    };

    const addExpense = (expense) => {
        const newExpense = { ...expense, id: Date.now().toString(), date: new Date().toISOString() };
        setExpenses([newExpense, ...expenses]);
    };

    const logMovement = (productId, productName, type, quantity, reason, userId) => {
        const newLog = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            productId, productName, type, quantity, reason, userId
        };
        setMovementLog(prev => [newLog, ...prev]);
    };

    const placeOrder = (shopId, cartItems, subtotal, discount, tax, totalAmount, customerInfo, paymentMethod = 'CASH', routeId = null, status = 'COMPLETED') => {
        // 1. Deduct stock & log movement (Only if not a route sale, as route stock is deducted on dispatch)
        let totalCogs = 0;

        if (!routeId) {
            const updatedProducts = [...products];
            cartItems.forEach(item => {
                const pIndex = updatedProducts.findIndex(p => p.id === item.productId);
                if (pIndex > -1) {
                    updatedProducts[pIndex].stock -= item.quantity;
                    item.cogs = updatedProducts[pIndex].costPrice * item.quantity;
                    logMovement(
                        item.productId,
                        item.name,
                        'OUT',
                        item.quantity,
                        `Sale to Shop #${shopId}`,
                        currentUser.id
                    );
                }
            });
            setProducts(updatedProducts);
            totalCogs = cartItems.reduce((sum, item) => sum + (item.cogs || 0), 0);
        } else {
            // For route sales, we still need to calculate COGS but DON'T deduct from main inventory
            cartItems.forEach(item => {
                const product = products.find(p => p.id === item.productId);
                item.cogs = (product?.costPrice || 0) * item.quantity;
            });
            totalCogs = cartItems.reduce((sum, item) => sum + (item.cogs || 0), 0);
        }

        // 2. Create order
        const newOrder = {
            id: `ORD-${Date.now()}`,
            shopId,
            customerInfo,
            paymentMethod,
            routeId,
            items: cartItems,
            subtotal, discount, tax, totalAmount,
            totalCogs,
            date: new Date().toISOString(),
            salesRepId: currentUser.id,
            bookedBy: currentUser.id,
            status,
            deliveredBy: routeId || null
        };
        setOrders([newOrder, ...orders]);

        return newOrder.id; // Return ID for receipt generation
    };

    const updateOrder = (updatedOrder) => {
        const oldOrder = orders.find(o => o.id === updatedOrder.id);

        // If transitioning from PENDING to COMPLETED, deduct stock
        if (oldOrder && oldOrder.status === 'PENDING' && updatedOrder.status === 'COMPLETED') {
            const updatedProducts = [...products];
            updatedOrder.items.forEach(item => {
                const pIndex = updatedProducts.findIndex(p => p.id === item.productId);
                if (pIndex > -1) {
                    updatedProducts[pIndex] = {
                        ...updatedProducts[pIndex],
                        stock: Math.max(0, updatedProducts[pIndex].stock - item.quantity)
                    };
                }
                logMovement(item.productId, item.name, 'OUT', item.quantity, `Fulfilled Order #${updatedOrder.id}`, currentUser?.id);
            });
            setProducts(updatedProducts);
        }

        setOrders(orders.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    };

    const addProduct = (product) => {
        const newProduct = { ...product, id: Date.now().toString(), stock: product.stock || 0, taxRate: product.taxRate || 0 };
        setProducts([...products, newProduct]);
        if (newProduct.stock > 0) {
            logMovement(newProduct.id, newProduct.name, 'IN', newProduct.stock, 'Initial Stock', currentUser?.id);
        }
    };

    const updateProduct = (updatedProduct) => {
        setProducts(products.map(p => p.id === updatedProduct.id ? updatedProduct : p));
    };

    const adjustStock = (productId, amount, reason, source = 'ADJUSTMENT') => {
        setProducts(products.map(p =>
            p.id === productId ? { ...p, stock: Math.max(0, p.stock + amount) } : p
        ));

        const type = amount > 0 ? 'IN' : 'OUT';
        const product = products.find(p => p.id === productId);
        setMovementLog([{
            id: `LOG-${Date.now()}`,
            date: new Date().toISOString(),
            productId,
            productName: product?.name || 'Unknown',
            type,
            quantity: Math.abs(amount),
            reason,
            source
        }, ...movementLog]);
    };

    const updateBusinessProfile = (profile) => setBusinessProfile(profile);

    const addVehicle = (vehicle) => setVehicles([...vehicles, { ...vehicle, id: `VH-${Date.now()}` }]);
    const updateVehicle = (updated) => setVehicles(vehicles.map(v => v.id === updated.id ? updated : v));

    const dispatchRoute = (routeData) => {
        const newRoute = {
            ...routeData,
            id: `RT-${Date.now()}`,
            status: 'ACTIVE',
            date: new Date().toISOString()
        };

        // If orders were assigned, attach them to the route
        if (routeData.assignedOrders && routeData.assignedOrders.length > 0) {
            const updatedOrders = orders.map(o => {
                if (routeData.assignedOrders.includes(o.id)) {
                    return { ...o, deliveredBy: newRoute.id };
                }
                return o;
            });
            setOrders(updatedOrders);
        }

        // Deduct loaded stock from main inventory
        const updatedProducts = [...products];
        routeData.loadedStock.forEach(item => {
            const pIndex = updatedProducts.findIndex(p => p.id === item.productId);
            if (pIndex > -1 && item.quantity > 0) {
                updatedProducts[pIndex].stock -= item.quantity;
                logMovement(item.productId, updatedProducts[pIndex].name, 'OUT', item.quantity, `Loaded onto Route ${newRoute.id}`, currentUser?.id);
            }
        });
        setProducts(updatedProducts);

        setRoutes([newRoute, ...routes]);
    };

    const reconcileRoute = (routeId, finalOdometer, returnedStock, actualCash) => {
        const route = routes.find(r => r.id === routeId);
        if (!route) return;

        // Return unsold stock to main inventory
        const updatedProducts = [...products];
        returnedStock.forEach(item => {
            if (item.quantity > 0) {
                const pIndex = updatedProducts.findIndex(p => p.id === item.productId);
                if (pIndex > -1) {
                    updatedProducts[pIndex].stock += item.quantity;
                    logMovement(item.productId, updatedProducts[pIndex].name, 'IN', item.quantity, `Returned from Route ${routeId}`, currentUser?.id);
                }
            }
        });
        setProducts(updatedProducts);

        const updatedRoute = {
            ...route,
            status: 'COMPLETED',
            finalOdometer,
            actualCash,
            reconciledAt: new Date().toISOString()
        };

        setRoutes(routes.map(r => r.id === routeId ? updatedRoute : r));
    };

    // ========== PAYROLL ==========
    const addEmployee = (emp) => {
        const newEmp = {
            ...emp,
            id: `EMP-${Date.now()}`,
            status: 'ACTIVE',
            createdAt: new Date().toISOString()
        };
        setEmployees(prev => [...prev, newEmp]);
    };

    const updateEmployee = (updated) => {
        setEmployees(employees.map(e => e.id === updated.id ? updated : e));
    };

    const deleteEmployee = (empId) => {
        setEmployees(employees.filter(e => e.id !== empId));
    };

    const processPayroll = (payRun) => {
        const newRecord = {
            ...payRun,
            id: `PAY-${Date.now()}`,
            processedAt: new Date().toISOString(),
            processedBy: currentUser?.id
        };
        setPayrollRecords(prev => [newRecord, ...prev]);
    };

    const deletePayrollRecord = (recordId) => {
        setPayrollRecords(payrollRecords.filter(r => r.id !== recordId));
    };

    const value = {
        currentUser, login, logout,
        businessProfile, updateBusinessProfile,
        products, addProduct, updateProduct, adjustStock,
        shops, addShop, updateShop, deleteShop,
        orders, placeOrder, updateOrder,
        expenses, addExpense,
        movementLog,
        vehicles, addVehicle, updateVehicle,
        routes, dispatchRoute, reconcileRoute,
        users, addUser, updateUser, deleteUser,
        hasRole, isViewOnly,
        employees, addEmployee, updateEmployee, deleteEmployee,
        payrollRecords, processPayroll, deletePayrollRecord
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
