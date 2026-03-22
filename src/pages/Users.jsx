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
                    <p className="text-sm font-bold text-[#747576] tracking-widest uppercase opacity-70 mb-10 leading-relaxed">
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
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-6 border-b border-black/5">
                <div>
                    <h1 className="text-4xl font-black tracking-tighter text-ink-primary uppercase leading-none mb-2">STAFF.</h1>
                    <p className="text-[10px] font-black text-ink-secondary uppercase tracking-widest opacity-70">PERSONNEL & ACCESS CONTROL</p>
                </div>
                <button className="btn-signature h-14 !text-sm" onClick={openAdd}>
                    ADD STAFF MEMBER
                    <div className="icon-nest ml-4">
                        <UserPlus size={20} />
                    </div>
                </button>
            </div>

            {/* Personnel Form Modal */}
            {isAdding && (
                <div className="modal-overlay">
                    <div className="glass-modal">
                        <div className="flex justify-between items-start mb-5">
                            <div>
                                <h1 className="text-3xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-2">
                                    {editingUser ? 'PERMISSIONS.' : 'NEW STAFF.'}
                                </h1>
                                <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em] opacity-70">CONFIGURE ACCESS LEVEL & IDENTITYCLE</p>
                            </div>
                            <button 
                                onClick={() => { setIsAdding(false); setEditingUser(null); }}
                                className="w-8 h-8 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary mb-1.5 opacity-70">Legal Identity</label>
                                    <input 
                                        required 
                                        type="text" 
                                        className="w-full bg-canvas border-none rounded-2xl p-4 font-black text-base text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase" 
                                        placeholder="FULL NAME..."
                                        value={formData.name} 
                                        onChange={e => setFormData({...formData, name: e.target.value})} 
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary mb-1.5 opacity-70">Access Credential</label>
                                    <input 
                                        required 
                                        type="email" 
                                        className="w-full bg-canvas border-none rounded-2xl p-4 font-black text-sm text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all" 
                                        placeholder="institutional@domain.com"
                                        value={formData.email} 
                                        onChange={e => setFormData({...formData, email: e.target.value})} 
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary mb-2 opacity-70">Role Access Levels</label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {AVAILABLE_ROLES.map(role => {
                                        const isSelected = formData.roles.includes(role.key);
                                        const RoleIcon = ROLE_ICONS[role.key] || User;
                                        return (
                                            <div
                                                key={role.key}
                                                onClick={() => toggleRole(role.key)}
                                                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center gap-4 group ${
                                                    isSelected 
                                                    ? 'bg-ink-primary border-ink-primary text-surface shadow-premium scale-[1.02]' 
                                                    : 'bg-surface border-black/5 hover:border-black/10 text-ink-primary'
                                                }`}
                                            >
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                                                    isSelected ? 'bg-accent-signature text-ink-primary' : 'bg-canvas'
                                                }`}>
                                                    <RoleIcon size={18} />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-xs font-black uppercase tracking-tight leading-none mb-1">{role.label}</div>
                                                    <div className={`text-[8px] font-black uppercase tracking-widest opacity-70 truncate ${isSelected ? 'text-surface/60' : 'text-ink-secondary'}`}>{role.description}</div>
                                                </div>
                                                {isSelected && <Check size={16} className="ml-auto text-accent-signature" />}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-black/5">
                                <button type="button" className="px-6 py-3 rounded-pill border border-black/10 font-black text-ink-primary text-[10px] uppercase tracking-[0.2em] hover:bg-black/5 transition-all cursor-pointer" onClick={() => { setIsAdding(false); setEditingUser(null); }}>Cancel</button>
                                <button type="submit" className="btn-signature !h-12 !text-xs flex items-center justify-center px-6 !rounded-pill">
                                    {editingUser ? 'SAVE CHANGES' : 'ADD STAFF'}
                                    <div className="icon-nest !w-8 !h-8 ml-4">
                                        <Save size={18} />
                                    </div>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Personnel Ledger */}
            <div className="glass-panel !p-0 !rounded-bento overflow-hidden border border-black/5 shadow-premium bg-surface">
                <div className="bg-ink-primary p-6 flex items-center gap-4">
                    <Fingerprint size={24} className="text-accent-signature" />
                    <h2 className="text-xs font-black uppercase tracking-[0.4em] text-surface">Staff List.</h2>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-black/5 bg-canvas">
                                <th className="px-8 py-5 text-[9px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-70">Staff Member</th>
                                <th className="px-8 py-5 text-[9px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-70">Access Levels</th>
                                <th className="px-8 py-5 text-[9px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-70">Status</th>
                                <th className="px-8 py-5 text-[9px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-70 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5 bg-surface">
                            {users.map(user => {
                                const userRoles = user.roles || [user.role || 'SALES'];
                                const primaryRole = userRoles[0];
                                return (
                                    <tr key={user.id} className={`group hover:bg-canvas transition-colors ${user.status !== 'ACTIVE' ? 'opacity-70 grayscale' : ''}`}>
                                        <td className="px-8 py-5">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-canvas border border-black/5 shadow-sm flex items-center justify-center text-ink-primary group-hover:bg-ink-primary group-hover:text-accent-signature transition-all duration-500">
                                                    {(() => { const Icon = ROLE_ICONS[primaryRole] || User; return <Icon size={18} />; })()}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-black text-ink-primary uppercase tracking-tight leading-none mb-1.5">{user.name}</div>
                                                    <div className="text-[9px] font-black text-ink-secondary uppercase tracking-[0.1em] opacity-70">{user.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
                                            <div className="flex gap-1.5 flex-wrap">
                                                {userRoles.map(r => (
                                                    <span key={r} className="px-3 py-1 rounded-pill bg-canvas text-ink-primary text-[8px] font-black uppercase tracking-widest border border-black/5 shadow-sm">
                                                        {r}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
                                            <div className="flex items-center gap-2.5">
                                                <div className={`w-2.5 h-2.5 rounded-full shadow-lg ${user.status === 'ACTIVE' ? 'bg-accent-signature shadow-accent-signature/40' : 'bg-red-500 shadow-red-500/40'}`} />
                                                <span className="text-[10px] font-black uppercase tracking-widest text-ink-primary opacity-60">
                                                    {user.status}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5 text-right">
                                            <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-all duration-500 translate-x-2 group-hover:translate-x-0">
                                                <button 
                                                    className="w-9 h-9 rounded-xl bg-surface border border-black/5 shadow-premium flex items-center justify-center text-ink-primary hover:bg-accent-signature transition-all"
                                                    onClick={() => openEdit(user)}
                                                    title="Edit Permissions"
                                                >
                                                    <Edit3 size={16} />
                                                </button>
                                                <button 
                                                    className={`w-9 h-9 rounded-xl bg-surface border border-black/5 shadow-premium flex items-center justify-center transition-all ${user.status === 'ACTIVE' ? 'text-red-500 hover:bg-red-50' : 'text-green-500 hover:bg-green-50'}`}
                                                    onClick={() => toggleStatus(user)}
                                                    disabled={user.id === currentUser.id}
                                                    title={user.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                                                >
                                                    <Activity size={16} />
                                                </button>
                                                {user.id !== currentUser.id && (
                                                    <button 
                                                        className="w-9 h-9 rounded-xl bg-surface border border-black/5 shadow-premium flex items-center justify-center text-red-500 hover:bg-red-50 transition-all"
                                                        onClick={() => { if(window.confirm('Remove staff record?')) handleDelete(user.id); }}
                                                    >
                                                        <Trash2 size={16} />
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
