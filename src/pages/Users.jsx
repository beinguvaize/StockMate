import React, { useState } from 'react';
import { useAppContext, AVAILABLE_ROLES, DEFAULT_PERMISSIONS, MODULES_CONFIG } from '../context/AppContext';
import { 
    ShieldCheck, User, Plus, Trash2, Edit3, X, Check, 
    Eye, Save, Package, Truck, Lock, ShieldAlert,
    UserPlus, Mail, Fingerprint, Activity, ShoppingCart, ShoppingBag, Wallet, Users as UsersIcon, BarChart3, Banknote, Settings as SettingsIcon, BookOpen
} from 'lucide-react';

const MODULE_ICONS = {
    inventory: Package,
    sales: ShoppingCart,
    purchases: ShoppingBag,
    expenses: Wallet,
    clients: UsersIcon,
    suppliers: Truck,
    vehicles: Truck,
    reports: BarChart3,
    payroll: Banknote,
    users: UserPlus,
    settings: SettingsIcon,
    daybook: BookOpen
};

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

const INTERNAL_ROLES = [
    { id: 'ADMIN', label: 'System Architect', description: 'Full Unrestricted Access' },
    { id: 'SALES', label: 'Commercial Agent', description: 'Sales & Client Relations' },
    { id: 'INVENTORY', label: 'Logistics Lead', description: 'Stock & Warehouse' },
    { id: 'VIEW_ONLY', label: 'Auditor', description: 'Read-only Access' },
];

const Users = () => {
    const { users, addUser, updateUser, deleteUser, currentUser, hasPermission } = useAppContext();
    const [isAdding, setIsAdding] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [formData, setFormData] = useState({ name: '', email: '', roles: ['STAFF'], permissions: { ...DEFAULT_PERMISSIONS } });
    const [isSaving, setIsSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const openAdd = () => {
        setEditingUser(null);
        setFormData({ name: '', email: '', roles: ['STAFF'], permissions: { ...DEFAULT_PERMISSIONS } });
        setIsAdding(true);
    };

    const openEdit = (user) => {
        setEditingUser(user);
        setFormData({
            name: user.name,
            email: user.email,
            roles: user.roles || [user.role || 'STAFF'],
            permissions: user.permissions || { ...DEFAULT_PERMISSIONS }
        });
        setIsAdding(true);
    };

    const toggleModulePermission = (moduleKey, action) => {
        setFormData(prev => {
            const currentPerms = prev.permissions || { ...DEFAULT_PERMISSIONS };
            const modulePerms = currentPerms[moduleKey] || { view: false, edit: false };
            
            const newModulePerms = { ...modulePerms, [action]: !modulePerms[action] };
            
            if (action === 'view' && !newModulePerms.view) {
                newModulePerms.edit = false;
            }
            if (action === 'edit' && newModulePerms.edit) {
                newModulePerms.view = true;
            }

            return {
                ...prev,
                permissions: { ...currentPerms, [moduleKey]: newModulePerms }
            };
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSaving) return;
        
        setIsSaving(true);
        try {
            if (editingUser) {
                await updateUser({ ...editingUser, ...formData });
            } else {
                await addUser(formData);
            }
            setIsAdding(false);
            setEditingUser(null);
            setFormData({ name: '', email: '', roles: ['SALES'] });
        } catch (err) {
            console.error("Form submission error:", err);
        } finally {
            setIsSaving(false);
        }
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

    React.useEffect(() => {
        if (isAdding || editingUser) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isAdding, editingUser]);

    return (
        <>
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

            {/* Personnel Form Modal */}
            {isAdding && (
                <div className="modal-overlay">
                    <div className="glass-modal !max-w-xl">
                        <div className="flex justify-between items-start mb-3 border-b border-black/5 pb-3">
                            <div>
                                <h2 className="text-lg font-black text-ink-primary uppercase tracking-tighter">
                                    {editingUser ? 'EDIT PERMISSIONS' : 'NEW STAFF'}
                                </h2>
                                <p className="text-[9px] font-black text-ink-secondary uppercase tracking-widest opacity-60">Configure access level & identity</p>
                            </div>
                            <button 
                                onClick={() => { setIsAdding(false); setEditingUser(null); }}
                                className="w-7 h-7 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-2.5 mt-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                <div className="md:col-span-1">
                                    <label className="block text-[8px] font-black uppercase tracking-widest text-ink-secondary mb-0.5 ml-1 opacity-50">Legal Identity</label>
                                    <input 
                                        required 
                                        type="text" 
                                        className="w-full bg-canvas border-none rounded-lg p-2 font-black text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all uppercase" 
                                        placeholder="NAME..."
                                        value={formData.name} 
                                        onChange={e => setFormData({...formData, name: e.target.value})} 
                                    />
                                </div>
                                <div className="md:col-span-1">
                                    <label className="block text-[8px] font-black uppercase tracking-widest text-ink-secondary mb-0.5 ml-1 opacity-50">Email</label>
                                    <input 
                                        required 
                                        type="email" 
                                        className="w-full bg-canvas border-none rounded-lg p-2 font-black text-xs text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all" 
                                        placeholder=" institutional@domain.com"
                                        value={formData.email} 
                                        onChange={e => setFormData({...formData, email: e.target.value})} 
                                    />
                                </div>

                                {!editingUser && (
                                    <div className="md:col-span-2">
                                        <label className="block text-[8px] font-black uppercase tracking-widest text-ink-secondary mb-0.5 ml-1 opacity-50">Security Secret</label>
                                        <input 
                                            required 
                                            type="password" 
                                            className="w-full bg-canvas border-none rounded-lg p-2 font-black text-xs text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all" 
                                            placeholder="MIN 6 CHAR..."
                                            value={formData.password || ''} 
                                            onChange={e => setFormData({...formData, password: e.target.value})} 
                                        />
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-[8px] font-black uppercase tracking-widest text-ink-secondary mb-1.5 opacity-50">Granular Module RBAC</label>
                                <div className="space-y-1 max-h-[160px] overflow-y-auto pr-1.5 custom-scrollbar">
                                    <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[8px] font-black uppercase tracking-widest text-ink-secondary opacity-50">
                                        <div className="col-span-6">Module Segment</div>
                                        <div className="col-span-3 text-center">View</div>
                                        <div className="col-span-3 text-center">Edit</div>
                                    </div>
                                    {MODULES_CONFIG.map(mod => {
                                        const perms = formData.permissions?.[mod.key] || { view: false, edit: false };
                                        const Icon = MODULE_ICONS[mod.key] || Package;
                                        return (
                                            <div key={mod.key} className="grid grid-cols-12 items-center gap-2 p-2 bg-canvas rounded-xl border border-black/5 group hover:border-accent-signature/30 transition-all">
                                                <div className="col-span-6 flex items-center gap-2.5">
                                                    <div className="w-7 h-7 rounded-lg bg-surface flex items-center justify-center text-ink-primary shadow-sm border border-black/5 group-hover:bg-ink-primary group-hover:text-accent-signature transition-all shrink-0">
                                                        <Icon size={12} />
                                                    </div>
                                                    <span className="text-[10px] font-black text-ink-primary uppercase truncate">{mod.label}</span>
                                                </div>
                                                <div className="col-span-3 flex justify-center">
                                                    <button 
                                                        type="button"
                                                        onClick={() => toggleModulePermission(mod.key, 'view')}
                                                        className={`w-10 h-6 rounded-pill relative transition-all ${perms.view ? 'bg-accent-signature' : 'bg-black/10'}`}
                                                    >
                                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${perms.view ? 'left-5' : 'left-1'}`} />
                                                    </button>
                                                </div>
                                                <div className="col-span-3 flex justify-center">
                                                    <button 
                                                        type="button"
                                                        onClick={() => toggleModulePermission(mod.key, 'edit')}
                                                        className={`w-10 h-6 rounded-pill relative transition-all ${perms.edit ? 'bg-ink-primary' : 'bg-black/10'}`}
                                                    >
                                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${perms.edit ? 'left-5' : 'left-1'}`} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div>
                                <label className="block text-[8px] font-black uppercase tracking-widest text-ink-secondary mb-1.5 opacity-50">Legacy Role Template</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {INTERNAL_ROLES.map(role => {
                                        const isSelected = formData.roles?.includes(role.id);
                                        const RoleIcon = ROLE_ICONS[role.id] || User;
                                        return (
                                            <div 
                                                key={role.id}
                                                onClick={() => {
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        roles: isSelected ? ['STAFF'] : [role.id]
                                                    }));
                                                }}
                                                className={`p-2 rounded-lg border-2 cursor-pointer transition-all flex items-center gap-2 group ${
                                                    isSelected 
                                                    ? 'bg-ink-primary border-ink-primary text-surface shadow-premium' 
                                                    : 'bg-surface border-black/5 hover:border-black/10 text-ink-primary'
                                                 }`}
                                            >
                                                <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-all ${
                                                    isSelected ? 'bg-accent-signature text-ink-primary' : 'bg-canvas'
                                                }`}>
                                                    <RoleIcon size={12} />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-[9px] font-black uppercase tracking-tight leading-none">{role.label}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-black/5">
                                <button type="button" className="px-6 py-3 rounded-pill border border-black/10 font-black text-ink-primary text-[10px] uppercase tracking-[0.2em] hover:bg-black/5 transition-all cursor-pointer" onClick={() => { setIsAdding(false); setEditingUser(null); }}>Cancel</button>
                                <button type="submit" disabled={isSaving} className="btn-signature !h-10 !text-sm flex items-center justify-center !rounded-pill">
                                    {isSaving ? 'SYNCHRONIZING...' : (editingUser ? 'UPDATE PERMISSIONS' : 'INITIALIZE PERSONNEL')}
                                    <div className="icon-nest ml-2.5 !w-7 !h-7">
                                        <UserPlus size={14} />
                                    </div>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
};

export default Users;
