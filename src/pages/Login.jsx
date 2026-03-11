import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { ShieldCheck, ShoppingCart, Package, Eye, Truck } from 'lucide-react';

const ROLE_ICONS = { ADMIN: ShieldCheck, SALES: ShoppingCart, INVENTORY: Package, FLEET: Truck, VIEW_ONLY: Eye };
const ROLE_COLORS = {
    ADMIN: { bg: 'rgba(79, 70, 229, 0.1)', color: 'var(--primary)' },
    SALES: { bg: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' },
    INVENTORY: { bg: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)' },
    FLEET: { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' },
    VIEW_ONLY: { bg: 'rgba(148, 163, 184, 0.1)', color: 'var(--text-muted)' },
};

const Login = () => {
    const { login, users } = useAppContext();
    const navigate = useNavigate();

    const handleLogin = (user) => {
        login(user.id);
        const roles = user.roles || [user.role || 'SALES'];
        if (roles.includes('ADMIN')) navigate('/dashboard');
        else if (roles.includes('SALES')) navigate('/sales');
        else navigate('/dashboard');
    };

    const activeUsers = users.filter(u => u.status === 'ACTIVE');

    return (
        <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '1rem' }}>
            <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '900px', display: 'flex', overflow: 'hidden', borderRadius: '24px', padding: 0 }}>

                {/* Left Branding Side */}
                <div style={{ flex: 1, backgroundColor: 'var(--primary)', padding: '3rem', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '1rem' }}>Cashbook</h1>
                    <p style={{ fontSize: '1.1rem', opacity: 0.9, lineHeight: 1.6 }}>
                        The integrated operational platform for manufacturing, inventory, and sales order tracking.
                    </p>
                </div>

                {/* Right Login Action Side */}
                <div style={{ flex: 1, padding: '3rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', backgroundColor: 'var(--surface)' }}>
                    <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem', fontWeight: 700 }}>Welcome Back</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Select your role to access the platform.</p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {activeUsers.length === 0 ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No active users found.</div>
                        ) : (
                            activeUsers.map(user => {
                                const roles = user.roles || [user.role || 'SALES'];
                                const primaryRole = roles[0];
                                const rc = ROLE_COLORS[primaryRole] || ROLE_COLORS.SALES;
                                const PrimaryIcon = ROLE_ICONS[primaryRole] || ShoppingCart;
                                return (
                                    <button
                                        key={user.id}
                                        className="btn"
                                        style={{ padding: '1.25rem', justifyContent: 'flex-start', border: '1px solid var(--border-color)', backgroundColor: 'transparent', color: 'var(--text-main)' }}
                                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.backgroundColor = 'rgba(79, 70, 229, 0.05)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                                        onClick={() => handleLogin(user)}
                                    >
                                        <div style={{ backgroundColor: rc.bg, padding: '0.5rem', borderRadius: '8px', color: rc.color }}>
                                            <PrimaryIcon size={24} />
                                        </div>
                                        <div style={{ textAlign: 'left', marginLeft: '1rem' }}>
                                            <div style={{ fontWeight: 600 }}>{user.name}</div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
                                                {roles.map(r => (
                                                    <span key={r} style={{
                                                        fontSize: '0.7rem', fontWeight: 600,
                                                        padding: '0.1rem 0.4rem', borderRadius: '4px',
                                                        backgroundColor: (ROLE_COLORS[r] || ROLE_COLORS.SALES).bg,
                                                        color: (ROLE_COLORS[r] || ROLE_COLORS.SALES).color
                                                    }}>{r}</span>
                                                ))}
                                                <span style={{ color: 'var(--text-muted)', marginLeft: '0.25rem' }}>• {user.email}</span>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
