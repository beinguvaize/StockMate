import React, { useState } from 'react';
import { useAppContext, AVAILABLE_ROLES } from '../context/AppContext';
import { 
    ShieldCheck, User, Plus, Trash2, Edit3, X, Check, 
    Eye, Save, Package, Truck, Lock, ShieldAlert,
    UserPlus, Mail, Fingerprint, Activity
} from 'lucide-react';

const ROLE_ICONS = {
    ADMIN: ShieldCheck,
    SALES: User,
    INVENTORY: Package,
    FLEET: Truck,
    VIEW_ONLY: Eye,
};

const ROLE_COLORS = {
    ADMIN: { bg: 'rgba(17, 17, 17, 0.05)', color: '#111111' },
    SALES: { bg: 'rgba(200, 241, 53, 0.1)', color: '#111111' },
    INVENTORY: { bg: 'rgba(79, 70, 229, 0.05)', color: '#4f46e5' },
    FLEET: { bg: 'rgba(59, 130, 246, 0.05)', color: '#3b82f6' },
    VIEW_ONLY: { bg: 'rgba(116, 117, 118, 0.05)', color: '#747576' },
};

const Users = () => {
    const { users, addUser, updateUser, deleteUser, currentUser, hasPermission } = useAppContext();
    const [isAdding, setIsAdding] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [formData, setFormData] = useState({ name: '', email: '', roles: ['SALES'] });
    const [deleteConfirm, setDeleteConfirm] = useState(null);

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
                if (newRoles.length === 0) newRoles = ['VIEW_ONLY']; 
            } else {
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

    if (!hasPermission('MANAGE_USERS')) {
        return (
            <div className="animate-fade-in flex flex-col items-center justify-center min-h-[60vh] p-8">
                <div className="glass-panel max-w-[500px] w-full text-center p-12 border-none">
                    <div className="flex justify-center mb-8">
                        <div className="bg-red-50 p-8 rounded-full text-red-500">
                            <Lock size={64} strokeWidth={2.5} />
                        </div>
                    </div>
                    <h2 className="text-4xl font-black tracking-tighter text-[#111] uppercase mb-4">Access Denied</h2>
                    <p className="text-sm font-bold text-[#747576] tracking-widest uppercase opacity-40 mb-10 leading-relaxed">
                        Security Clearance Insufficient. Staff records are restricted to Administrators.
                    </p>
                    <button className="btn-signature w-full h-16" onClick={() => window.history.back()}>
                        SYSTEM ABORT
                        <div className="icon-nest">
                            <ShieldAlert size={20} />
                        </div>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in flex flex-col gap-10 pb-20">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-12 border-b border-black/5">
                <div>
                    <h1 className="text-6xl font-black tracking-tighter text-ink-primary uppercase leading-none mb-2">STAFF.</h1>
                    <p className="text-[10px] font-black text-ink-secondary uppercase tracking-widest opacity-40">PERSONNEL & ACCESS CONTROL</p>
                </div>
                <button className="btn-signature h-20 !text-base" onClick={openAdd}>
                    ADD STAFF MEMBER
                    <div className="icon-nest ml-6">
                        <UserPlus size={28} />
                    </div>
                </button>
            </div>

            {/* Personnel Form Modal */}
            {isAdding && (
                <div className="modal-overlay">
                    <div className="glass-modal !max-w-[750px] !overflow-hidden !p-16">
                        <button 
                            onClick={() => { setIsAdding(false); setEditingUser(null); }}
                            className="absolute top-10 right-10 w-16 h-16 rounded-pill bg-canvas flex items-center justify-center text-ink-primary hover:scale-110 transition-transform z-10 shadow-premium"
                        >
                            <X size={28} />
                        </button>

                        <div className="absolute top-0 left-0 w-3 h-full bg-accent-signature shadow-2xl"></div>

                        <div className="mb-16">
                            <h3 className="text-5xl font-black tracking-tighter text-ink-primary uppercase mb-3">
                                {editingUser ? 'Edit Access.' : 'New Staff.'}
                            </h3>
                            <p className="text-xs font-black text-ink-secondary uppercase tracking-[0.4em] opacity-40">Access Level Configuration</p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-16">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary mb-4 opacity-50">Legal Identity</label>
                                    <input 
                                        required 
                                        type="text" 
                                        className="input-field !rounded-2xl !py-6 font-black !bg-canvas border border-black/5 shadow-sm text-xl" 
                                        placeholder="Full Name..."
                                        value={formData.name} 
                                        onChange={e => setFormData({...formData, name: e.target.value})} 
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary mb-4 opacity-50">Access Credential (Email)</label>
                                    <input 
                                        required 
                                        type="email" 
                                        className="input-field !rounded-2xl !py-6 font-black !bg-canvas border border-black/5 shadow-sm text-xl" 
                                        placeholder="institutional@domain.com"
                                        value={formData.email} 
                                        onChange={e => setFormData({...formData, email: e.target.value})} 
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary mb-8 opacity-50">Role Access Levels</label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {AVAILABLE_ROLES.map(role => {
                                        const isSelected = formData.roles.includes(role.key);
                                        const RoleIcon = ROLE_ICONS[role.key] || User;
                                        return (
                                            <div
                                                key={role.key}
                                                onClick={() => toggleRole(role.key)}
                                                className={`p-10 rounded-bento border-4 cursor-pointer transition-all flex items-center gap-8 group ${
                                                    isSelected 
                                                    ? 'bg-ink-primary border-ink-primary text-surface shadow-2xl scale-105' 
                                                    : 'bg-surface border-black/5 hover:border-black/20 text-ink-primary hover:scale-[1.02]'
                                                }`}
                                            >
                                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
                                                    isSelected ? 'bg-accent-signature text-ink-primary shadow-lg' : 'bg-canvas'
                                                }`}>
                                                    <RoleIcon size={28} />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-base font-black uppercase tracking-tight leading-none mb-2">{role.label}</div>
                                                    <div className={`text-[10px] font-black uppercase tracking-[0.2em] opacity-40 truncate ${isSelected ? 'text-surface' : 'text-ink-secondary'}`}>{role.description}</div>
                                                </div>
                                                {isSelected && <Check size={24} className="ml-auto text-accent-signature" />}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex gap-6 pt-10 border-t border-black/5">
                                <button type="button" className="flex-1 py-7 rounded-pill border border-black/10 font-black text-ink-primary hover:bg-black/5 transition-all text-xs tracking-widest uppercase" onClick={() => { setIsAdding(false); setEditingUser(null); }}>Abort</button>
                                <button type="submit" className="btn-signature flex-[2.5] !h-[84px] !text-lg">
                                    {editingUser ? 'SAVE CHANGES' : 'ADD STAFF MEMBER'}
                                    <div className="icon-nest ml-6">
                                        <Save size={28} />
                                    </div>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Personnel Ledger */}
            <div className="glass-panel !p-0 !rounded-bento overflow-hidden border border-black/5 shadow-premium bg-surface">
                <div className="bg-ink-primary p-10 flex items-center gap-5">
                    <Fingerprint size={28} className="text-accent-signature" />
                    <h2 className="text-sm font-black uppercase tracking-[0.5em] text-surface">Staff List.</h2>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-black/5 bg-canvas">
                                <th className="p-10 text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary opacity-50">Staff Member</th>
                                <th className="p-10 text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary opacity-50">Access Levels</th>
                                <th className="p-10 text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary opacity-50">Status</th>
                                <th className="p-10 text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary opacity-50 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5 bg-surface">
                            {users.map(user => {
                                const userRoles = user.roles || [user.role || 'SALES'];
                                const primaryRole = userRoles[0];
                                return (
                                    <tr key={user.id} className={`group hover:bg-canvas transition-colors ${user.status !== 'ACTIVE' ? 'opacity-40 grayscale' : ''}`}>
                                        <td className="p-10">
                                            <div className="flex items-center gap-6">
                                                <div className="w-16 h-16 rounded-2xl bg-canvas border border-black/5 shadow-sm flex items-center justify-center text-ink-primary group-hover:bg-ink-primary group-hover:text-accent-signature transition-all duration-500">
                                                    {(() => { const Icon = ROLE_ICONS[primaryRole] || User; return <Icon size={24} />; })()}
                                                </div>
                                                <div>
                                                    <div className="text-base font-black text-ink-primary uppercase tracking-tight leading-none mb-2">{user.name}</div>
                                                    <div className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.2em] opacity-40">{user.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-10">
                                            <div className="flex gap-2 flex-wrap">
                                                {userRoles.map(r => (
                                                    <span key={r} className="px-5 py-2 rounded-pill bg-canvas text-ink-primary text-[10px] font-black uppercase tracking-widest border border-black/5 shadow-sm">
                                                        {r}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="p-10">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-3 h-3 rounded-full shadow-lg ${user.status === 'ACTIVE' ? 'bg-accent-signature shadow-accent-signature/40' : 'bg-red-500 shadow-red-500/40'}`} />
                                                <span className="text-[11px] font-black uppercase tracking-widest text-ink-primary opacity-60">
                                                    {user.status}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-10 text-right">
                                            <div className="flex gap-3 justify-end opacity-0 group-hover:opacity-100 transition-all duration-500 translate-x-4 group-hover:translate-x-0">
                                                <button 
                                                    className="w-12 h-12 rounded-2xl bg-surface border border-black/5 shadow-premium flex items-center justify-center text-ink-primary hover:bg-accent-signature transition-all"
                                                    onClick={() => openEdit(user)}
                                                    title="Edit Permissions"
                                                >
                                                    <Edit3 size={18} />
                                                </button>
                                                <button 
                                                    className={`w-12 h-12 rounded-2xl bg-surface border border-black/5 shadow-premium flex items-center justify-center transition-all ${user.status === 'ACTIVE' ? 'text-red-500 hover:bg-red-50' : 'text-green-500 hover:bg-green-50'}`}
                                                    onClick={() => toggleStatus(user)}
                                                    disabled={user.id === currentUser.id}
                                                    title={user.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                                                >
                                                    <Activity size={18} />
                                                </button>
                                                {user.id !== currentUser.id && (
                                                    <button 
                                                        className="w-12 h-12 rounded-2xl bg-surface border border-black/5 shadow-premium flex items-center justify-center text-red-500 hover:bg-red-50 transition-all"
                                                        onClick={() => { if(window.confirm('Remove staff record?')) handleDelete(user.id); }}
                                                    >
                                                        <Trash2 size={18} />
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

                {users.length === 0 && (
                    <div className="p-40 text-center">
                        <div className="flex justify-center mb-10 opacity-10">
                            <Activity size={100} strokeWidth={1} />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-[0.5em] text-ink-secondary">No staff members found</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Users;
