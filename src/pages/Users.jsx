import React, { useState } from 'react';
import { useAppContext, AVAILABLE_ROLES } from '../context/AppContext';
import { ShieldCheck, User, Plus, Trash2, Edit3, X, Check, Eye, Save, Package, Truck } from 'lucide-react';

const ROLE_ICONS = {
    ADMIN: ShieldCheck,
    SALES: User,
    INVENTORY: Package,
    FLEET: Truck,
    VIEW_ONLY: Eye,
};

const ROLE_COLORS = {
    ADMIN: { bg: 'rgba(79, 70, 229, 0.1)', color: 'var(--primary)' },
    SALES: { bg: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' },
    INVENTORY: { bg: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)' },
    FLEET: { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' },
    VIEW_ONLY: { bg: 'rgba(148, 163, 184, 0.1)', color: 'var(--text-muted)' },
};

const Users = () => {
    const { users, addUser, updateUser, deleteUser, currentUser } = useAppContext();
    const [isAdding, setIsAdding] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [formData, setFormData] = useState({ name: '', email: '', roles: ['SALES'] });
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const isAdmin = currentUser?.roles?.includes('ADMIN') || currentUser?.role === 'ADMIN';

    const openAdd = () => {
        setEditingUser(null);
        setFormData({ name: '', email: '', roles: ['SALES'] });
        setIsAdding(true);
    };

    const openEdit = (user) => {
        setEditingUser(user);
        setFormData({
            name: user.name,
            email: user.email,
            roles: user.roles || [user.role || 'SALES']
        });
        setIsAdding(true);
    };

    const toggleRole = (roleKey) => {
        setFormData(prev => {
            const hasRole = prev.roles.includes(roleKey);
            let newRoles;
            if (hasRole) {
                newRoles = prev.roles.filter(r => r !== roleKey);
                if (newRoles.length === 0) newRoles = ['VIEW_ONLY']; // Must have at least one role
            } else {
                // If selecting VIEW_ONLY, clear other roles. If selecting anything else, clear VIEW_ONLY.
                if (roleKey === 'VIEW_ONLY') {
                    newRoles = ['VIEW_ONLY'];
                } else {
                    newRoles = [...prev.roles.filter(r => r !== 'VIEW_ONLY'), roleKey];
                }
            }
            return { ...prev, roles: newRoles };
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (editingUser) {
            updateUser({ ...editingUser, ...formData });
        } else {
            addUser(formData);
        }
        setIsAdding(false);
        setEditingUser(null);
        setFormData({ name: '', email: '', roles: ['SALES'] });
    };

    const toggleStatus = (user) => {
        updateUser({ ...user, status: user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
    };

    const handleDelete = (userId) => {
        deleteUser(userId);
        setDeleteConfirm(null);
    };

    if (!isAdmin) {
        return <div style={{ padding: '2rem', textAlign: 'center' }}>Access Denied. Admins only.</div>;
    }

    return (
        <div className="page-container animate-fade-in" style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="page-title">User Management</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Manage team access, roles, and permissions.</p>
                </div>
                <button className="btn btn-primary" onClick={openAdd}>
                    <Plus size={18} /> Add User
                </button>
            </div>

            {isAdding && (
                <div className="glass-panel" style={{ marginBottom: '2rem', padding: '1.5rem', borderLeft: `4px solid ${editingUser ? 'var(--warning)' : 'var(--primary)'}` }}>
                    <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 600 }}>
                        {editingUser ? 'Edit User' : 'Create New User'}
                    </h3>
                    <form onSubmit={handleSubmit}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                            <div>
                                <label style={{ fontSize: '0.8rem', marginBottom: '0.3rem', display: 'block' }}>Name</label>
                                <input required type="text" className="input-field" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="John Doe" />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', marginBottom: '0.3rem', display: 'block' }}>Email</label>
                                <input required type="email" className="input-field" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="john@example.com" />
                            </div>
                        </div>

                        {/* Role Selection - Checkbox Grid */}
                        <div style={{ marginBottom: '1.25rem' }}>
                            <label style={{ fontSize: '0.8rem', marginBottom: '0.75rem', display: 'block', fontWeight: 600 }}>Roles & Permissions</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                                {AVAILABLE_ROLES.map(role => {
                                    const isSelected = formData.roles.includes(role.key);
                                    const RoleIcon = ROLE_ICONS[role.key] || User;
                                    const colors = ROLE_COLORS[role.key] || ROLE_COLORS.VIEW_ONLY;
                                    return (
                                        <div
                                            key={role.key}
                                            onClick={() => toggleRole(role.key)}
                                            style={{
                                                padding: '0.75rem',
                                                borderRadius: '10px',
                                                border: isSelected ? `2px solid ${colors.color}` : '2px solid var(--border-color)',
                                                backgroundColor: isSelected ? colors.bg : 'white',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.75rem',
                                                transition: 'all 0.2s',
                                            }}
                                        >
                                            <div style={{
                                                width: '20px', height: '20px', borderRadius: '4px',
                                                border: isSelected ? `2px solid ${colors.color}` : '2px solid var(--border-color)',
                                                backgroundColor: isSelected ? colors.color : 'white',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                flexShrink: 0,
                                            }}>
                                                {isSelected && <Check size={12} style={{ color: 'white' }} />}
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <RoleIcon size={14} style={{ color: colors.color }} />
                                                    {role.label}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{role.description}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Save size={16} /> {editingUser ? 'Update User' : 'Create User'}
                            </button>
                            <button type="button" className="btn btn-secondary" onClick={() => { setIsAdding(false); setEditingUser(null); }}>Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Email</th>
                            <th>Roles</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => {
                            const userRoles = user.roles || [user.role || 'SALES'];
                            const primaryRole = userRoles[0];
                            const colors = ROLE_COLORS[primaryRole] || ROLE_COLORS.VIEW_ONLY;
                            return (
                                <tr key={user.id} style={{ opacity: user.status === 'ACTIVE' ? 1 : 0.5 }}>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: colors.bg, color: colors.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {(() => { const Icon = ROLE_ICONS[primaryRole] || User; return <Icon size={18} />; })()}
                                            </div>
                                            <div style={{ fontWeight: 600 }}>{user.name}</div>
                                        </div>
                                    </td>
                                    <td style={{ color: 'var(--text-muted)' }}>{user.email}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                            {userRoles.map(r => {
                                                const rc = ROLE_COLORS[r] || ROLE_COLORS.VIEW_ONLY;
                                                return (
                                                    <span key={r} style={{
                                                        fontSize: '0.75rem', fontWeight: 600,
                                                        padding: '0.15rem 0.5rem', borderRadius: '4px',
                                                        backgroundColor: rc.bg, color: rc.color
                                                    }}>
                                                        {r}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </td>
                                    <td>
                                        <span style={{ color: user.status === 'ACTIVE' ? 'var(--success)' : 'var(--danger)', fontWeight: 600, fontSize: '0.85rem' }}>
                                            {user.status}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                            <button
                                                className="btn btn-secondary"
                                                style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                                                onClick={() => openEdit(user)}
                                                title="Edit user"
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                            <button
                                                className="btn btn-secondary"
                                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                                                onClick={() => toggleStatus(user)}
                                                disabled={user.id === currentUser.id}
                                            >
                                                {user.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                                            </button>
                                            {deleteConfirm === user.id ? (
                                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                    <button className="btn" style={{ padding: '0.3rem', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: '6px' }} onClick={() => handleDelete(user.id)}>
                                                        <Check size={14} style={{ color: 'var(--danger)' }} />
                                                    </button>
                                                    <button className="btn" style={{ padding: '0.3rem', borderRadius: '6px' }} onClick={() => setDeleteConfirm(null)}>
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', color: 'var(--danger)' }}
                                                    onClick={() => setDeleteConfirm(user.id)}
                                                    disabled={user.id === currentUser.id}
                                                    title="Delete user"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Users;
