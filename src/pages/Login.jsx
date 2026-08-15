import React, { useState, useEffect } from 'react';
import { useNavigate} from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { isElectron as isDesktopApp, loadBootstrap, isGraceValid, isSubscriptionActive, OFFLINE_GRACE_MS } from '../lib/offline/authGuard';

const Login = () => {
  const [credentials, setCredentials] = useState({ email: '', password: ''});
  // Typing a password blind on a phone keyboard at a counter is how people
  // get locked out. Default hidden; revealing is the user's choice.
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [btnClicked, setBtnClicked] = useState(false);
  const [markSpin, setMarkSpin] = useState(false);
  const [logoClickCount, setLogoClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);
  const { login, logout, loading, currentUser } = useAuth();
  const navigate = useNavigate();
  const [googleLoading, setGoogleLoading] = useState(false);

  // Already signed in (e.g. clicked "Sign In" on the landing page in a new
  // tab while a session exists) → don't show the form; hand off to
  // RootRedirect, which routes global admins to /nexus-hq and everyone else
  // to their tenant dashboard.
  useEffect(() => {
    if (!loading && currentUser) navigate('/', { replace: true });
  }, [loading, currentUser, navigate]);

  // Inline signup — same page, right panel swaps between login and register.
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [signup, setSignup] = useState({ name: '', email: '', password: '', confirm: '' });
  const [signupLoading, setSignupLoading] = useState(false);
  const [info, setInfo] = useState('');

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (signup.password !== signup.confirm) { setError('Passwords do not match'); return; }
    if (signup.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setSignupLoading(true);
    const { data, error: err } = await supabase.auth.signUp({
      email: signup.email,
      password: signup.password,
      options: { data: { full_name: signup.name } },
    });
    setSignupLoading(false);
    if (err) { setError(err.message); return; }
    if (data?.user && !data.session) {
      setInfo('Check your email for a confirmation link, then come back to sign in.');
      return;
    }
    navigate('/welcome');
  };

  // Password reset request — own screen (mode === 'forgot').
  const [resetLoading, setResetLoading] = useState(false);
  const handleForgot = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (!credentials.email) { setError('Enter your email address.'); return; }
    setResetLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(credentials.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetLoading(false);
    if (error) { setError(error.message); return; }
    setInfo(`Reset link sent to ${credentials.email}. Check your inbox (and spam).`);
  };

  // Desktop offline status: track navigator.onLine + cached bootstrap so we can
  // (a) show a clear "first sign-in requires internet" warning to fresh users,
  // (b) tell returning users how many days of offline grace remain.
  const [offlineState, setOfflineState] = useState({
    desktop: false, online: true, bootstrap: null,
  });
  useEffect(() => {
    if (!isDesktopApp()) return;
    let cancelled = false;
    const refresh = async () => {
      const bootstrap = await loadBootstrap();
      if (cancelled) return;
      setOfflineState({
        desktop: true,
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
        bootstrap,
      });
    };
    refresh();
    const onChange = () => refresh();
    window.addEventListener('online',  onChange);
    window.addEventListener('offline', onChange);
    return () => {
      cancelled = true;
      window.removeEventListener('online',  onChange);
      window.removeEventListener('offline', onChange);
    };
  }, []);

  const desktopOfflineFirstSignIn =
    offlineState.desktop && !offlineState.online && !offlineState.bootstrap;
  const desktopOfflineGraceExpired =
    offlineState.desktop && !offlineState.online && offlineState.bootstrap &&
    !isGraceValid(offlineState.bootstrap);
  const desktopOfflineSubscriptionBlocked =
    offlineState.desktop && !offlineState.online && offlineState.bootstrap &&
    !isSubscriptionActive(offlineState.bootstrap);
  const desktopOfflineGraceDaysLeft = offlineState.bootstrap?.validatedAt
    ? Math.max(0, Math.ceil((OFFLINE_GRACE_MS - (Date.now() - offlineState.bootstrap.validatedAt)) / (24 * 60 * 60 * 1000)))
    : 0;

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
  };

  const handleLogoClick = () => {
    const currentTime = Date.now();
    if (currentTime - lastClickTime < 1000) {
      const newCount = logoClickCount + 1;
      if (newCount === 3) {
        navigate('/nexus-hq');
        setLogoClickCount(0);
      } else {
        setLogoClickCount(newCount);
      }
    } else {
      setLogoClickCount(1);
    }
    setLastClickTime(currentTime);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Desktop: block first-time sign-in attempts while offline. supabase
    // signInWithPassword requires a network round-trip and would just hang.
    if (desktopOfflineFirstSignIn) {
      setError('First sign-in requires an internet connection. Connect, then try again.');
      return;
    }
    if (desktopOfflineSubscriptionBlocked) {
      setError('Subscription is suspended. Reconnect to the internet to refresh your status.');
      return;
    }
    if (desktopOfflineGraceExpired) {
      setError('Offline grace period has expired. Connect to the internet to re-verify your account.');
      return;
    }

    setBtnClicked(false);
    setMarkSpin(false);
    setTimeout(() => {
      setBtnClicked(true);
      setMarkSpin(true);
    }, 0);
    setTimeout(() => {
      setBtnClicked(false);
      setMarkSpin(false);
    }, 500);

    setError('');
    const result = await login(credentials.email, credentials.password);

    if (result.success) {
      // Hand off to RootRedirect — it reads currentUser + currentTenant from
      // their respective contexts (populated by AuthContext/TenantContext
      // listening to the new session) and routes to /nexus-hq, the tenant
      // dashboard, or /welcome. Doing it here was racing the contexts and
      // breaking sign-ins for users whose tenant_id lives in public.users
      // rather than supabase user_metadata.
      navigate('/');
    } else {
      setError(result.error || 'Invalid email or password');
    }
  };

 return (
 <div className="flex w-full h-screen overflow-hidden bg-[#141c1a] font-inter select-none">
 {/* Left Panel: Branding */}
 <div className="hidden lg:flex w-1/2 bg-white flex-col items-center justify-center gap-4">
  <img 
  className="w-[420px] max-w-[88%] block cursor-pointer transition-transform active:scale-95" 
  src={`${import.meta.env.BASE_URL}logo.png`}
  alt="bookledger Logo"
  onClick={handleLogoClick}
  />
 <p className="text-[13px] text-[#747576] font-medium">
 Inventory, billing &amp; reports — built for Indian SMBs.
 </p>
 </div>

 {/* Right Panel: Login Form */}
 <div className="w-full lg:w-1/2 bg-[#1a2320] flex relative overflow-y-auto">
 {/* Decorative Gradients */}
 <div className="absolute top-0 left-0 w-[160px] h-full bg-gradient-to-r from-white/28 via-white/12 to-transparent pointer-events-none z-0" />
 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[460px] bg-[radial-gradient(ellipse_at_center,rgba(56,224,160,0.16)_0%,rgba(56,224,160,0.08)_28%,rgba(56,224,160,0.03)_55%,transparent_75%)] pointer-events-none z-0" />
 <div className="absolute -top-[80px] left-1/2 -translate-x-1/2 w-[400px] h-[300px] bg-[radial-gradient(ellipse_at_top,rgba(56,224,160,0.07)_0%,transparent_65%)] pointer-events-none z-0" />

 <div className="relative z-1 w-[370px] form-card m-auto py-10">
 <h1 className="font-space font-bold text-[26px] text-white text-center mb-[10px]">
 {mode === 'login' ? 'WELCOME BACK' : mode === 'signup' ? 'CREATE ACCOUNT' : 'RESET PASSWORD'}
 </h1>
 <p className="text-center text-[12px] text-[#747576] mb-[24px]">
 {mode === 'login' ? 'Sign in to your workspace'
   : mode === 'signup' ? '60 days free. No credit card required.'
   : 'Enter your email — we\'ll send a reset link.'}
 </p>

 {offlineState.desktop && !offlineState.online && (
   <div className={`mb-5 px-4 py-3 rounded-xl border text-[12px] leading-snug ${
     desktopOfflineFirstSignIn || desktopOfflineGraceExpired || desktopOfflineSubscriptionBlocked
       ? 'bg-red-500/10 border-red-500/30 text-red-300'
       : 'bg-accent-signature/10 border-accent-signature/30 text-accent-signature/40'
   }`}>
     {desktopOfflineFirstSignIn && (
       <span><strong>Offline.</strong> First sign-in requires internet. Connect, then sign in.</span>
     )}
     {desktopOfflineSubscriptionBlocked && (
       <span><strong>Subscription suspended.</strong> Reconnect to refresh status.</span>
     )}
     {desktopOfflineGraceExpired && (
       <span><strong>Offline grace expired.</strong> Reconnect to re-verify your account.</span>
     )}
     {!desktopOfflineFirstSignIn && !desktopOfflineSubscriptionBlocked && !desktopOfflineGraceExpired && (
       <span><strong>Working offline.</strong> {desktopOfflineGraceDaysLeft} day{desktopOfflineGraceDaysLeft === 1 ? '' : 's'} of offline access remaining. Connect to extend.</span>
     )}
   </div>
 )}

 {mode === 'login' ? (
 <form onSubmit={handleSubmit}>
 <div className="mb-[18px]">
 <label className="block text-[#747576] text-[14px] font-medium mb-[7px]">Email Address</label>
 <div className="flex items-center bg-[#0d1411] border-[1.5px] border-[#253028] rounded-[6px] transition-colors focus-within:border-[#38e0a0]/45">
 <span className="pl-[13px] pr-[13px] text-[#747576] flex items-center shrink-0">
 <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
 <rect x="2" y="4" width="20" height="16" rx="2"/>
 <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
 </svg>
 </span>
 <input 
 type="email" 
 placeholder="Email Address" 
 autoComplete="off"
 required
 className="flex-1 bg-transparent border-none outline-none text-[#747576] font-inter text-[14px] pt-[13px] pr-[13px] pb-[13px] pl-0 placeholder:text-ink-secondary/30"
 value={credentials.email}
 onChange={(e) => setCredentials({ ...credentials, email: e.target.value})}
 />
 </div>
 </div>

 <div className="mb-[18px]">
 <label className="block text-[#747576] text-[14px] font-medium mb-[7px]">Password</label>
 <div className="flex items-center bg-[#0d1411] border-[1.5px] border-[#253028] rounded-[6px] transition-colors focus-within:border-[#38e0a0]/45">
 <span className="pl-[13px] pr-[13px] text-[#747576] flex items-center shrink-0">
 <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
 <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
 <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
 </svg>
 </span>
 <input 
 type={showPassword ? 'text' : 'password'}
 placeholder="Password" 
 autoComplete="off"
 required
 className="flex-1 bg-transparent border-none outline-none text-[#747576] font-inter text-[14px] pt-[13px] pr-[13px] pb-[13px] pl-0 placeholder:text-ink-secondary/30"
 value={credentials.password}
 onChange={(e) => setCredentials({ ...credentials, password: e.target.value})}
 />
 {/* type=button so it never submits the form, and aria-pressed so a screen
     reader says whether the password is currently visible. */}
 <button
   type="button"
   onClick={() => setShowPassword(v => !v)}
   aria-label={showPassword ? 'Hide password' : 'Show password'}
   aria-pressed={showPassword}
   title={showPassword ? 'Hide password' : 'Show password'}
   className="px-[13px] py-[13px] text-[#747576] hover:text-[#38e0a0] transition-colors shrink-0"
 >
   {showPassword ? (
     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
       <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
       <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
       <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
       <line x1="1" y1="1" x2="23" y2="23"/>
     </svg>
   ) : (
     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
       <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
       <circle cx="12" cy="12" r="3"/>
     </svg>
   )}
 </button>
 </div>
 <button type="button"
  onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}
  className="block text-right text-[#747576] text-[12.5px] underline underline-offset-[3px] mt-[9px] cursor-pointer opacity-85 hover:text-white hover:opacity-100 transition-all ml-auto bg-transparent border-0">
 Forgot Password?
 </button>
 </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="shrink-0 w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-[11px] font-bold text-red-500/90 uppercase tracking-tight leading-tight">
                {error}
              </p>
            </div>
          )}

 <button
 type="submit"
 disabled={loading || googleLoading}
 className={`btn-login w-full mt-[26px] bg-white border-none rounded-[6px] cursor-pointer h-[54px] flex items-center justify-center hover:shadow-[0_8px_28px_rgba(0,0,0,0.45)] active:scale-[0.98] ${btnClicked ? 'clicked' : ''}`}
 >
 <span className="font-arial font-bold text-[15px] text-[#111] relative z-1">LOG IN</span>
 </button>
 </form>
 ) : mode === 'signup' ? (
 <form onSubmit={handleSignUp}>
   {[
     { key: 'name',     type: 'text',     label: 'Full Name',        ph: 'Full name' },
     { key: 'email',    type: 'email',    label: 'Work Email',       ph: 'Email address' },
     { key: 'password', type: 'password', label: 'Password',         ph: 'Password (min 8 chars)' },
     { key: 'confirm',  type: 'password', label: 'Confirm Password', ph: 'Confirm password' },
   ].map(f => (
     <div className="mb-[16px]" key={f.key}>
       <label className="block text-[#747576] text-[14px] font-medium mb-[7px]">{f.label}</label>
       <div className="flex items-center bg-[#0d1411] border-[1.5px] border-[#253028] rounded-[6px] transition-colors focus-within:border-[#38e0a0]/45">
         <input
           type={f.type}
           placeholder={f.ph}
           autoComplete="off"
           required
           className="flex-1 bg-transparent border-none outline-none text-[#747576] font-inter text-[14px] p-[13px] placeholder:text-ink-secondary/30"
           value={signup[f.key]}
           onChange={(e) => setSignup({ ...signup, [f.key]: e.target.value })}
         />
       </div>
     </div>
   ))}

   {error && (
     <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[12px] font-semibold">
       {error}
     </div>
   )}
   {info && (
     <div className="mb-4 p-3 rounded-xl bg-[#38e0a0]/10 border border-[#38e0a0]/25 text-[#38e0a0] text-[12px] font-semibold">
       {info}
     </div>
   )}

   <button
     type="submit"
     disabled={signupLoading || googleLoading}
     className="w-full mt-[10px] bg-[#38e0a0] border-none rounded-[6px] cursor-pointer h-[54px] flex items-center justify-center hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60"
   >
     <span className="font-arial font-bold text-[15px] text-[#0d1411]">
       {signupLoading ? 'CREATING…' : 'START FREE TRIAL'}
     </span>
   </button>
   <p className="mt-3 text-center text-[10.5px] text-[#747576]">
     By signing up you agree to our Terms of Service.
   </p>
 </form>
 ) : (
 <form onSubmit={handleForgot}>
   <div className="mb-[18px]">
     <label className="block text-[#747576] text-[14px] font-medium mb-[7px]">Email Address</label>
     <div className="flex items-center bg-[#0d1411] border-[1.5px] border-[#253028] rounded-[6px] transition-colors focus-within:border-[#38e0a0]/45">
       <span className="pl-[13px] pr-[13px] text-[#747576] flex items-center shrink-0">
         <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
           <rect x="2" y="4" width="20" height="16" rx="2"/>
           <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
         </svg>
       </span>
       <input
         type="email"
         placeholder="you@business.com"
         autoComplete="email"
         required
         autoFocus
         className="flex-1 bg-transparent border-none outline-none text-[#747576] font-inter text-[14px] pt-[13px] pr-[13px] pb-[13px] pl-0 placeholder:text-ink-secondary/30"
         value={credentials.email}
         onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
       />
     </div>
   </div>

   {error && (
     <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[12px] font-semibold">
       {error}
     </div>
   )}
   {info && (
     <div className="mb-4 p-3 rounded-xl bg-[#38e0a0]/10 border border-[#38e0a0]/25 text-[#38e0a0] text-[12px] font-semibold">
       {info}
     </div>
   )}

   <button
     type="submit"
     disabled={resetLoading}
     className="w-full h-[54px] bg-white border-none rounded-[6px] cursor-pointer flex items-center justify-center hover:shadow-[0_8px_28px_rgba(0,0,0,0.45)] active:scale-[0.98] transition-all disabled:opacity-60"
   >
     <span className="font-arial font-bold text-[15px] text-[#111]">
       {resetLoading ? 'SENDING…' : 'SEND RESET LINK'}
     </span>
   </button>

   <button type="button"
     onClick={() => { setMode('login'); setError(''); setInfo(''); }}
     className="w-full mt-3 text-center text-[12.5px] text-[#747576] hover:text-white transition-colors bg-transparent border-0">
     ← Back to sign in
   </button>
 </form>
 )}

 {mode !== 'forgot' && (<>
 {/* Divider */}
 <div className="flex items-center gap-3 mt-[22px] mb-[18px]">
   <div className="flex-1 h-px bg-white/10" />
   <span className="text-[11px] font-bold text-[#747576] uppercase tracking-widest">or</span>
   <div className="flex-1 h-px bg-white/10" />
 </div>

 {/* Google Sign In */}
 <button
   onClick={handleGoogleSignIn}
   disabled={loading || googleLoading}
   className="w-full h-[54px] flex items-center justify-center gap-3 bg-[#0d1411] border-[1.5px] border-[#253028] rounded-[6px] cursor-pointer hover:border-[#38e0a0]/45 hover:bg-[#0d1411]/80 active:scale-[0.98] transition-all disabled:opacity-50"
 >
   {googleLoading ? (
     <svg className="animate-spin w-5 h-5 text-[#38e0a0]" fill="none" viewBox="0 0 24 24">
       <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
       <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
     </svg>
   ) : (
     <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
       <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
       <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
       <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
       <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
     </svg>
   )}
   <span className="font-bold text-[14px] text-[#747576]">Continue with Google</span>
 </button>

 {/* Mode toggle — stays on this page */}
 <p className="mt-6 text-center text-[12.5px] text-[#747576]">
   {mode === 'login' ? 'New to bookledger?' : 'Already have an account?'}{' '}
   <button type="button"
     onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setInfo(''); }}
     className="text-[#38e0a0] font-bold hover:underline cursor-pointer bg-transparent border-0">
     {mode === 'login' ? 'Create an account →' : 'Sign in →'}
   </button>
 </p>
 </>)}
 </div>

 {mode === 'login' && (
 <div className="absolute bottom-[20px] left-1/2 -translate-x-1/2 text-[#747576] text-[11px] font-normal whitespace-nowrap z-1">
 © 2026 BOOKLEDGER. ALL RIGHTS RESERVED.
 </div>
 )}
 </div>
 </div>
 );
};

export default Login;
