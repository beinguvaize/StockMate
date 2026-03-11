import React from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { LayoutDashboard, Package, ShoppingCart, Receipt, LogOut, Menu, Settings as SettingsIcon, Truck, Users, BarChart3, UsersRound, Banknote } from 'lucide-react';

const Sidebar = ({ isMobileOpen, setIsMobileOpen }) => {
    const { currentUser, logout } = useAppContext();

    const getNavItems = () => {
        const items = [];
        if (!currentUser) return items;

        const roles = currentUser.roles || [currentUser.role || 'SALES'];
        const isAdmin = roles.includes('ADMIN');

        if (isAdmin) {
            items.push({ label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} /> });
            items.push({ label: 'Sales POS', path: '/sales', icon: <ShoppingCart size={20} /> });
            items.push({ label: 'Clients', path: '/clients', icon: <UsersRound size={20} /> });
            items.push({ label: 'Orders', path: '/orders', icon: <ShoppingCart size={20} /> });
            items.push({ label: 'Inventory', path: '/inventory', icon: <Package size={20} /> });
            items.push({ label: 'Vehicles', path: '/vehicles', icon: <Truck size={20} /> });
            items.push({ label: 'Expenses', path: '/expenses', icon: <Receipt size={20} /> });
            items.push({ label: 'Reports', path: '/reports', icon: <BarChart3 size={20} /> });
            items.push({ label: 'Payroll', path: '/payroll', icon: <Banknote size={20} /> });
            items.push({ label: 'Users', path: '/users', icon: <Users size={20} /> });
            items.push({ label: 'Settings', path: '/settings', icon: <SettingsIcon size={20} /> });
        } else {
            const added = new Set();
            const addItem = (item) => {
                if (!added.has(item.path)) {
                    items.push(item);
                    added.add(item.path);
                }
            };

            if (!roles.every(r => r === 'VIEW_ONLY')) {
                addItem({ label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} /> });
            }

            if (roles.includes('SALES') || roles.includes('VIEW_ONLY')) {
                addItem({ label: 'Sales POS', path: '/sales', icon: <ShoppingCart size={20} /> });
                addItem({ label: 'Clients', path: '/clients', icon: <UsersRound size={20} /> });
                addItem({ label: 'Orders', path: '/orders', icon: <ShoppingCart size={20} /> });
            }
            if (roles.includes('INVENTORY') || roles.includes('VIEW_ONLY')) {
                addItem({ label: 'Inventory', path: '/inventory', icon: <Package size={20} /> });
            }
            if (roles.includes('FLEET') || roles.includes('VIEW_ONLY')) {
                addItem({ label: 'Vehicles', path: '/vehicles', icon: <Truck size={20} /> });
            }
            addItem({ label: 'Reports', path: '/reports', icon: <BarChart3 size={20} /> });
        }
        return items;
    };

    const navItems = getNavItems();

    return (
        <>
            <div
                className={`sidebar-overlay ${isMobileOpen ? 'open' : ''}`}
                onClick={() => setIsMobileOpen(false)}
            />
            <aside className={`sidebar ${isMobileOpen ? 'open' : ''}`}>
                <div style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '12px',
                            background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
                            boxShadow: '0 4px 12px rgba(129, 140, 248, 0.3)', flexShrink: 0
                        }}>
                            <LayoutDashboard size={24} />
                        </div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, letterSpacing: '0.05em' }}>Cash<span style={{color: 'var(--primary)'}}>Book</span></h2>
                    </div>
                    <button className="mobile-only-btn" onClick={() => setIsMobileOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        ✕
                    </button>
                </div>
                
                <nav style={{ padding: '1rem 0', flex: 1, overflowY: 'auto' }}>
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={() => setIsMobileOpen(false)}
                            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                        >
                            {item.icon}
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border-light)', marginTop: 'auto', background: 'rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', color: 'var(--text-main)' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(45deg, var(--primary-dark), var(--primary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                            {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{currentUser?.name || 'User'}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--primary)', letterSpacing: '0.05em' }}>
                                {(currentUser?.roles || [currentUser?.role || 'SALES'])[0]}
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={logout}
                        className="btn btn-secondary" 
                        style={{ width: '100%', border: '1px solid var(--border-light)', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
                    >
                        <LogOut size={16} /> Logout
                    </button>
                </div>
            </aside>
            <style>{`
                .sidebar {
                    width: 260px;
                    background: var(--surface);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    color: white;
                    display: flex;
                    flex-direction: column;
                    position: fixed;
                    top: 0;
                    bottom: 0;
                    left: 0;
                    z-index: 50;
                    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                    transform: translateX(-100%);
                    border-right: 1px solid var(--border-color);
                }
                .sidebar.open {
                    transform: translateX(0);
                }
                .sidebar-overlay {
                    position: fixed;
                    inset: 0;
                    background-color: rgba(15, 23, 42, 0.6);
                    backdrop-filter: blur(4px);
                    z-index: 40;
                    display: none;
                }
                .sidebar-overlay.open {
                    display: block;
                }
                .sidebar-link {
                    display: flex;
                    align-items: center;
                    gap: 0.85rem;
                    padding: 0.85rem 1.5rem;
                    color: var(--text-muted);
                    text-decoration: none;
                    transition: var(--transition);
                    border-left: 3px solid transparent;
                    font-weight: 500;
                    margin: 0.2rem 1rem;
                    border-radius: var(--radius-sm);
                }
                .sidebar-link:hover {
                    background: var(--surface-hover);
                    color: white;
                }
                .sidebar-link.active {
                    background: linear-gradient(90deg, var(--primary-transparent) 0%, transparent 100%);
                    color: white;
                    border-left-color: var(--primary);
                    font-weight: 600;
                }
                @media (min-width: 1024px) {
                    .sidebar {
                        transform: translateX(0);
                    }
                    .sidebar-overlay {
                        display: none !important;
                    }
                    .main-content {
                        margin-left: 260px;
                    }
                    .mobile-header {
                        display: none !important;
                    }
                    .mobile-only-btn {
                        display: none !important;
                    }
                }
            `}</style>
        </>
    );
};

const AppLayout = () => {
    const { currentUser } = useAppContext();
    const [isMobileOpen, setIsMobileOpen] = React.useState(false);

    if (!currentUser) return <Navigate to="/login" />;

    return (
        <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
            <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />
            
            <main className="main-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%' }}>
                <header className="mobile-header" style={{ display: 'flex', alignItems: 'center', padding: '1rem', backgroundColor: 'white', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 30 }}>
                    <button onClick={() => setIsMobileOpen(true)} style={{ background: 'none', border: 'none', marginRight: '1rem', cursor: 'pointer', color: 'var(--text-main)' }}>
                        <Menu size={24} />
                    </button>
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>CashBook</h1>
                </header>
                <div style={{ padding: '1.5rem', flex: 1 }}>
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default AppLayout;
