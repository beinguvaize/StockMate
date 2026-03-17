import React, { useState, useRef } from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { LayoutDashboard, Package, LogOut, Truck, BarChart3, Banknote, User, ShoppingCart, ClipboardList, Wallet, Users, Settings } from 'lucide-react';
import NotificationStack from './NotificationStack';

const Navbar = () => {
    const { currentUser, logout, businessProfile } = useAppContext();
    const [isUserMenuOpen, setIsUserMenuOpen] = React.useState(false);
    const dropdownRef = React.useRef(null);

    const roles = currentUser?.roles || (currentUser?.role ? [currentUser?.role] : ['STAFF']);
    const isOwner = roles.includes('OWNER') || roles.includes('GLOBAL_ADMIN');

    const navItems = [
        { label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} /> },
        { label: 'Inventory', path: '/inventory', icon: <Package size={20} /> },
        { label: 'Sales', path: '/sales', icon: <ShoppingCart size={20} /> },
        { label: 'Orders', path: '/orders', icon: <ClipboardList size={20} /> },
        { label: 'Expenses', path: '/expenses', icon: <Wallet size={20} /> },
        { label: 'Clients', path: '/clients', icon: <Users size={20} /> },
        { label: 'Payroll', path: '/payroll', icon: <Banknote size={20} />, hidden: !isOwner },
        { label: 'Vehicles', path: '/vehicles', icon: <Truck size={20} /> },
        { label: 'Reports', path: '/reports', icon: <BarChart3 size={20} />, hidden: !isOwner },
    ];

    const adminItems = [
        { label: 'User Management', path: '/users', icon: <Users size={18} />, hidden: !isOwner },
        { label: 'Settings', path: '/settings', icon: <Settings size={18} />, hidden: !isOwner },
    ];

    React.useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsUserMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <header className="sticky top-0 z-50 bg-canvas/80 backdrop-blur-md border-b border-black/5">
            <div className="max-w-[1800px] mx-auto px-8 sm:px-10 lg:px-12">
                <div className="flex items-center justify-between h-20">
                    {/* Branding */}
                    <div className="flex items-center gap-4">
                        <img 
                            src="/logo.png" 
                            alt="Ledger Logo" 
                            className="h-14 w-auto object-contain mix-blend-multiply animate-in fade-in duration-700"
                        />
                    </div>

                    {/* Pill Navigation */}
                    <div className="hidden md:flex items-center space-x-1 bg-white p-1.5 rounded-full shadow-sm border border-black/5">
                        {navItems.filter(i => !i.hidden).map((item) => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={({ isActive }) => `flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold transition-all ${
                                    isActive 
                                    ? 'bg-ink-primary text-white shadow-md' 
                                    : 'text-ink-secondary hover:text-ink-primary hover:bg-gray-100'
                                }`}
                            >
                                {({ isActive }) => (
                                    <>
                                        <span className={isActive ? 'text-white/60' : 'opacity-40'}>{item.icon}</span>
                                        {item.label}
                                    </>
                                )}
                            </NavLink>
                        ))}
                    </div>

                    {/* User Profile */}
                    <div className="flex items-center gap-4">
                        <div className="relative" ref={dropdownRef}>
                            <button 
                                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                                className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-white border border-black/5 shadow-sm hover:shadow-md transition-all group"
                            >
                                <div className="w-8 h-8 rounded-full bg-accent-signature flex items-center justify-center text-ink-primary text-xs font-bold ring-2 ring-black/5">
                                    {currentUser?.name?.charAt(0).toUpperCase() || <User size={14} />}
                                </div>
                                <span className="hidden sm:block text-sm font-medium text-ink-primary">{currentUser?.name?.split(' ')[0] || 'Member'}</span>
                            </button>

                            {isUserMenuOpen && (
                                <div className="absolute top-full right-0 mt-3 w-64 bg-surface rounded-[2rem] border border-black/5 shadow-2xl p-4 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300 z-[100]">
                                    <div className="mb-4 pb-4 border-b border-black/5">
                                        <p className="text-[10px] font-bold text-ink-secondary uppercase tracking-widest mb-3 px-2 opacity-40">Administration</p>
                                        <div className="space-y-1">
                                            {adminItems.filter(i => !i.hidden).map(item => (
                                                <NavLink
                                                    key={item.path}
                                                    to={item.path}
                                                    onClick={() => setIsUserMenuOpen(false)}
                                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-ink-primary hover:bg-canvas rounded-xl transition-all"
                                                >
                                                    {item.label}
                                                </NavLink>
                                            ))}
                                        </div>
                                    </div>
                                    <button onClick={logout} className="w-full flex items-center gap-3 p-3 text-sm font-medium text-red-500 hover:bg-red-50 rounded-xl transition-all">
                                        <LogOut size={16} /> Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};

const AppLayout = () => {
    const { currentUser, loading } = useAppContext();

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-canvas">
                <div className="text-center">
                    <div className="w-16 h-16 border-[6px] border-ink-primary/5 border-t-accent-signature rounded-pill animate-spin mb-6 mx-auto"></div>
                    <p className="text-[10px] font-black tracking-[0.4em] uppercase opacity-30">Synchronizing Infrastructure</p>
                </div>
            </div>
        );
    }

    // Auth redirect disabled for pure UI focus
    // if (!currentUser) return <Navigate to="/login" />;

    return (
        <div className="min-h-screen bg-canvas font-inter selection:bg-accent-signature/30 flex flex-col relative">
            <Navbar />
            <NotificationStack />
            
            <main className="flex-1 max-w-[1800px] w-full mx-auto px-8 sm:px-10 lg:px-12 py-6">
                <Outlet />
            </main>
        </div>
    );
};

export default AppLayout;
