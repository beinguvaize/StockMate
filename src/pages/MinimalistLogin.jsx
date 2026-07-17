import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { ChevronRight, Mail, Lock, Shield } from 'lucide-react';

const MinimalistLogin = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(''); setNote('');
    setBusy(true);
    try {
      const result = await login(email, password);
      if (result.success) navigate('/');
      else setError(result.error || 'Invalid credentials');
    } catch (err) {
      setError(err?.message || 'Could not sign in. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async () => {
    setError(''); setNote('');
    if (!email) { setError('Enter your email above, then tap Forgot.'); return; }
    const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (e) setError(e.message);
    else setNote('Reset link sent to ' + email + ' — check your inbox.');
  };

  return (
    <div className="min-h-screen bg-canvas text-ink-primary font-sans flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-[420px]">
        <div className="mb-10 text-center">
          <div className="flex justify-center mb-6">
            <img src={`${import.meta.env.BASE_URL}ledgrpro-logo.png`} alt="bookledger" className="h-10 w-auto" />
          </div>
          <h1 className="text-2xl font-extrabold">Sign in to your account<span className="text-accent-signature">.</span></h1>
          <p className="text-[13px] font-medium text-gray-400 mt-1.5">GST billing, inventory &amp; reports for Indian business.</p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5">
          {error && <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-medium">{error}</div>}
          {note && <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-[13px] font-medium">{note}</div>}
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-gray-500 ml-1">Email address</label>
              <div className="relative group">
                <Mail size={17} strokeWidth={2.4} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-accent-signature transition-colors" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required
                  className="w-full pl-11 pr-4 h-11 rounded-xl bg-gray-50 border border-transparent focus:bg-white focus:border-accent-signature/40 focus:ring-2 focus:ring-accent-signature/20 focus:outline-none transition-all placeholder:text-gray-300 font-medium text-[14px]" />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center ml-1">
                <label className="text-[12px] font-bold text-gray-500">Password</label>
                <button type="button" onClick={handleForgot} className="text-[12px] font-semibold text-accent-signature hover:text-accent-signature-hover transition-colors">Forgot?</button>
              </div>
              <div className="relative group">
                <Lock size={17} strokeWidth={2.4} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-accent-signature transition-colors" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required
                  className="w-full pl-11 pr-4 h-11 rounded-xl bg-gray-50 border border-transparent focus:bg-white focus:border-accent-signature/40 focus:ring-2 focus:ring-accent-signature/20 focus:outline-none transition-all placeholder:text-gray-300 font-medium text-[14px]" />
              </div>
            </div>

            <button type="submit" disabled={busy}
              className="w-full bg-accent-signature text-white h-11 rounded-xl font-bold text-[14px] flex items-center justify-center gap-2 hover:bg-accent-signature-hover transition-all active:scale-[0.99] disabled:opacity-60">
              {busy ? 'Signing in…' : <>Sign in <ChevronRight size={17} strokeWidth={3} /></>}
            </button>
          </form>
        </div>

        <p className="text-center text-[13px] text-gray-400 mt-5">
          New here? <Link to="/register" className="text-accent-signature font-semibold hover:underline">Create an account</Link>
        </p>

        <div className="mt-10 flex items-center justify-center gap-3 text-gray-300">
          <div className="flex items-center gap-1.5 text-[11px] font-bold"><Shield size={13} strokeWidth={2.8} /> Bank-grade security</div>
        </div>
      </div>
    </div>
  );
};

export default MinimalistLogin;
