import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { Shield, ChevronRight, Mail, Lock } from 'lucide-react';

const MinimalistLogin = () => {
    const { login, users } = useAppContext();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const activeUsers = users.filter(u => u.status === 'ACTIVE');

    const [error, setError] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        const result = await login(email, password);
        if (result.success) {
            navigate('/');
        } else {
            setError(result.error || 'Invalid credentials');
        }
    };

    const handleQuickLogin = async (user) => {
        setEmail(user.email);
        setPassword('password');
        setError('');
        const result = await login(user.email, 'password');
        if (result.success) {
            navigate('/');
        } else {
            setError(result.error || 'Quick login failed');
        }
    };

    return (
        <div className="min-h-screen bg-[#fcfcfc] text-[#747576] font-inter selection:bg-slate-900 selection:text-white flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-[420px] animate-in fade-in slide-in-from-bottom-8 duration-700">
                {/* Brand Header */}
                <div className="mb-12 text-center">
                    <div className="flex justify-center mb-8">
                        <div className="p-3 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
                            <img src="/images/ledger_logo.png" alt="Ledgr Logo" className="h-10 grayscale hover:grayscale-0 transition-all duration-500" />
                        </div>
                    </div>
                    <h1 className="text-[32px] font-semibold tracking-tight text-[#747576] mb-2">Sign in to your account</h1>
                    <p className="text-[#747576] font-medium">Professional financial management for enterprise.</p>
                </div>

                <div className="bg-white p-10 rounded-[32px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.04)] border border-slate-100 mb-8">
                    {error && (
                        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-medium animate-in fade-in slide-in-from-top-2">
                            {error}
                        </div>
                    )}
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[13px] font-semibold text-[#747576] ml-1">Email address</label>
                            <div className="relative group">
                                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-[#747576]/40 group-focus-within:text-[#747576] transition-colors">
                                    <Mail size={18} strokeWidth={2.5} />
                                </div>
                                <input 
                                    type="email" 
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="name@company.com"
                                    className="w-full pl-14 pr-6 py-4 rounded-xl bg-slate-50 border border-transparent focus:bg-white focus:border-slate-200 focus:outline-none transition-all placeholder:text-[#747576]/40 font-medium text-[15px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center ml-1">
                                <label className="text-[13px] font-semibold text-[#747576]">Password</label>
                                <a href="#" className="text-[13px] font-semibold text-[#747576] hover:opacity-60 transition-opacity">Forgot?</a>
                            </div>
                            <div className="relative group">
                                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-[#747576]/40 group-focus-within:text-[#747576] transition-colors">
                                    <Lock size={18} strokeWidth={2.5} />
                                </div>
                                <input 
                                    type="password" 
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full pl-14 pr-6 py-4 rounded-xl bg-slate-50 border border-transparent focus:bg-white focus:border-slate-200 focus:outline-none transition-all placeholder:text-[#747576]/40 font-medium text-[15px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                                    required
                                />
                            </div>
                        </div>

                        <button 
                            type="submit"
                            className="w-full bg-slate-900 text-white py-4 rounded-xl font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-slate-800 transition-all active:scale-[0.98] shadow-[0_8px_20px_-4px_rgba(15,23,42,0.15)] mt-10 disabled:opacity-50"
                        >
                            Sign in
                            <ChevronRight size={18} strokeWidth={3} />
                        </button>
                    </form>
                </div>

                {/* Quick Access Area */}
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
                    <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-[#747576]/40">Quick Access Points</p>
                    <div className="grid grid-cols-2 gap-3">
                        {activeUsers.slice(0, 4).map(user => (
                            <button 
                                key={user.id}
                                onClick={() => handleQuickLogin(user)}
                                className="p-4 rounded-2xl bg-white border border-slate-100 hover:border-slate-300 hover:shadow-sm transition-all text-left group active:scale-[0.97]"
                            >
                                <div className="font-semibold text-[13px] text-[#747576] truncate">{user.name}</div>
                                <div className="text-[10px] font-bold text-[#747576] uppercase tracking-wider mt-1 truncate">{user.role}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Footer Security */}
                <div className="mt-16 flex items-center justify-center gap-6 text-[#747576]/40 animate-in fade-in duration-1000 delay-500">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest">
                        <Shield size={14} strokeWidth={3} />
                        Enterprise Security
                    </div>
                    <div className="w-1 h-1 rounded-full bg-slate-200"></div>
                    <div className="text-[11px] font-bold uppercase tracking-widest hover:text-[#747576] cursor-pointer transition-colors">
                        Privacy Protocol
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MinimalistLogin;
