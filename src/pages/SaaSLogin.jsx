import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowRight, Mail, Lock, User, AlertCircle, Loader2 } from 'lucide-react';

// Google icon SVG (brand mark — no lucide equivalent)
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const SaaSLogin = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // ── Google OAuth ────────────────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/welcome`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
    // On success Supabase redirects browser — no further action needed
  };

  // ── Email Login ─────────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    // RootRedirect handles where to send them
    navigate('/');
  };

  // ── Email Signup ────────────────────────────────────────────────────────────
  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    setLoading(false);

    if (error) { setError(error.message); return; }

    // Supabase may require email confirmation
    if (data?.user && !data.session) {
      setInfo('Check your email for a confirmation link, then come back to sign in.');
      return;
    }
    // Auto-confirmed (no email confirmation needed) — go set up workspace
    navigate('/welcome');
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4 relative overflow-hidden font-inter selection:bg-accent-signature/30">

      {/* Background grid */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.04)_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>
      {/* Ambient orbs */}
      <div className="absolute top-[10%] left-[15%] w-[500px] h-[500px] rounded-full bg-accent-signature/8 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[5%] right-[10%] w-[400px] h-[400px] rounded-full bg-blue-500/5 blur-[130px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="p-4 rounded-2xl bg-white border border-black/5 shadow-premium">
            <img src="/images/ledgr_metallic_logo.png" alt="StockMate" className="h-10" onError={(e) => { e.target.style.display='none'; }} />
            <span className="text-xl font-black text-ink-primary tracking-tight hidden">StockMate</span>
          </div>
        </div>

        <div className="bg-white/70 backdrop-blur-xl border border-black/5 rounded-[2rem] shadow-glass p-8">

          {/* Mode tabs */}
          <div className="flex bg-canvas rounded-2xl p-1 mb-8">
            <button
              onClick={() => { setMode('login'); setError(''); setInfo(''); }}
              className={`flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${mode === 'login' ? 'bg-ink-primary text-white shadow-lg' : 'text-gray-500 hover:text-ink-primary'}`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('signup'); setError(''); setInfo(''); }}
              className={`flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${mode === 'signup' ? 'bg-ink-primary text-white shadow-lg' : 'text-gray-500 hover:text-ink-primary'}`}
            >
              Create Account
            </button>
          </div>

          {/* Heading */}
          <div className="mb-6">
            <h1 className="text-2xl font-black text-ink-primary tracking-tight">
              {mode === 'login' ? 'Welcome back' : 'Start your free trial'}
            </h1>
            <p className="text-[11px] text-gray-500 font-semibold mt-1">
              {mode === 'login'
                ? 'Sign in to your workspace'
                : '60 days free. No credit card required.'}
            </p>
          </div>

          {/* Error / Info */}
          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[11px] font-semibold">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}
          {info && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold">
              <Mail size={14} className="shrink-0" />
              {info}
            </div>
          )}

          {/* Google button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 mb-5 border border-black/10 rounded-xl bg-white hover:bg-gray-50 transition-all text-[12px] font-bold text-ink-primary shadow-sm hover:shadow-md disabled:opacity-60"
          >
            {googleLoading ? <Loader2 size={18} className="animate-spin" /> : <GoogleIcon />}
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-black/5" />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-black/5" />
          </div>

          {/* Email form */}
          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="relative">
                <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full pl-9 pr-4 py-3 bg-canvas border border-black/8 rounded-xl text-[13px] font-medium text-ink-primary placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-signature/30 focus:border-accent-signature transition-all"
                />
              </div>
              <div className="relative">
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full pl-9 pr-4 py-3 bg-canvas border border-black/8 rounded-xl text-[13px] font-medium text-ink-primary placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-signature/30 focus:border-accent-signature transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-ink-primary text-white text-[12px] font-black uppercase tracking-widest hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 mt-2"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <>Sign In <ArrowRight size={14} /></>}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="relative">
                <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Full name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className="w-full pl-9 pr-4 py-3 bg-canvas border border-black/8 rounded-xl text-[13px] font-medium text-ink-primary placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-signature/30 focus:border-accent-signature transition-all"
                />
              </div>
              <div className="relative">
                <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  placeholder="Work email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full pl-9 pr-4 py-3 bg-canvas border border-black/8 rounded-xl text-[13px] font-medium text-ink-primary placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-signature/30 focus:border-accent-signature transition-all"
                />
              </div>
              <div className="relative">
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  placeholder="Password (min 8 chars)"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full pl-9 pr-4 py-3 bg-canvas border border-black/8 rounded-xl text-[13px] font-medium text-ink-primary placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-signature/30 focus:border-accent-signature transition-all"
                />
              </div>
              <div className="relative">
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  className="w-full pl-9 pr-4 py-3 bg-canvas border border-black/8 rounded-xl text-[13px] font-medium text-ink-primary placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-signature/30 focus:border-accent-signature transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-signature text-black text-[12px] font-black uppercase tracking-widest hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 mt-2"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <>Start Free Trial <ArrowRight size={14} /></>}
              </button>
              <p className="text-center text-[10px] text-gray-400 font-medium">
                By signing up you agree to our Terms of Service.
              </p>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-gray-400 font-semibold mt-6 uppercase tracking-widest">
          StockMate · GST Billing & Inventory for India
        </p>
      </div>
    </div>
  );
};

export default SaaSLogin;
