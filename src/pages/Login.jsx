import React, { useState, useEffect } from 'react';
import { useNavigate} from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { isElectron as isDesktopApp, loadBootstrap, isGraceValid, isSubscriptionActive, OFFLINE_GRACE_MS } from '../lib/offline/authGuard';
import { sendLoginOtp, verifyLoginOtp, formatPhone, toE164 } from '../lib/phoneAuth';
import {
  AuthShell, AuthTitle, AuthMark, AuthField, AuthInput, PasswordInput, PhonePrefix, AuthNote,
  AuthButton, OrRule, BackLink, AuthLink, Swap, Hint, OtpBoxes, Icon,
} from '../components/auth/AuthParts';

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
  // ── WhatsApp OTP sign-in ────────────────────────────────────────────
  // Two steps in one mode: enter the number, then the code. Kept here rather
  // than as a separate route so a half-finished login cannot be reached by URL
  // and so "back" returns to the password form the user came from.
  const [phoneStep, setPhoneStep] = useState('number'); // 'number' | 'code'
  const [phoneInput, setPhoneInput] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [resendIn, setResendIn] = useState(0);

  // Supabase rate-limits OTP sends. Counting down is kinder than letting
  // someone press Send four times and then be told they are locked out.
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const goPhoneMode = () => {
    setMode('phone'); setPhoneStep('number');
    setError(''); setInfo(''); setOtpCode(''); setSentTo('');
  };

  const handleSendOtp = async (e) => {
    e?.preventDefault();
    if (phoneLoading || resendIn > 0) return;
    setError(''); setInfo(''); setPhoneLoading(true);

    const { error: err, phone } = await sendLoginOtp(phoneInput);
    setPhoneLoading(false);

    if (err) {
      // describeOtpError already turned this into something readable, and
      // kept the original on .cause for the console.
      if (err.cause) console.error('[phone-login] send failed', err.cause);
      setError(err.message);
      return;
    }
    setSentTo(phone);
    setPhoneStep('code');
    setResendIn(60);
    setInfo(`Code sent on WhatsApp to ${formatPhone(phone)}`);
  };

  const handleVerifyOtp = async (e) => {
    e?.preventDefault();
    if (phoneLoading) return;
    setError(''); setPhoneLoading(true);

    const { error: err } = await verifyLoginOtp(sentTo || phoneInput, otpCode);
    setPhoneLoading(false);

    if (err) {
      if (err.cause) console.error('[phone-login] verify failed', err.cause);
      setError(err.message);
      return;
    }
    // Nothing to navigate here: verifyOtp puts the session on the client,
    // AuthContext's onAuthStateChange loads the profile, and the redirect
    // effect at the top of this component takes it from there.
  };

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


  const clearMsgs = () => { setError(''); setInfo(''); };
  const offlineBlocked = desktopOfflineFirstSignIn || desktopOfflineGraceExpired || desktopOfflineSubscriptionBlocked;
  const signupPwBad = !!error && /password/i.test(error);

  // Desktop app, no connection: say so above the form (auth-03).
  const offlineNote = offlineState.desktop && !offlineState.online && (
    <AuthNote tone={offlineBlocked ? 'rd' : 'am'}>
      {desktopOfflineFirstSignIn && (<><b>Offline.</b> The first sign-in on this computer needs the internet. Connect, then sign in.</>)}
      {desktopOfflineSubscriptionBlocked && (<><b>Subscription suspended.</b> Reconnect to refresh your status.</>)}
      {desktopOfflineGraceExpired && (<><b>Offline access has expired.</b> Connect to re-verify your account.</>)}
      {!offlineBlocked && (
        <><b>Working offline.</b> {desktopOfflineGraceDaysLeft} day{desktopOfflineGraceDaysLeft === 1 ? '' : 's'} of offline access left. Connect to extend.</>
      )}
    </AuthNote>
  );

  const googleButton = (
    <AuthButton variant="alt" onClick={handleGoogleSignIn} disabled={loading || googleLoading} busy={googleLoading}
      className={mode === 'login' ? 'mt-2' : ''}>
      {!googleLoading && <Icon.google />}Continue with Google
    </AuthButton>
  );

  let body;
  if (mode === 'signup' && info) {
    // auth-08: the account exists and is waiting on the confirmation link.
    body = (
      <>
        <AuthMark><Icon.mail size={24} /></AuthMark>
        <AuthTitle title="Check your email"
          sub={<>We sent a confirmation link to <b className="font-semibold text-ink">{signup.email}</b>. Open it, then come back to sign in.</>} />
        <AuthNote tone="gy">Nothing in your inbox after a few minutes? Look in spam.</AuthNote>
        <AuthButton variant="alt" onClick={() => { setMode('login'); clearMsgs(); }}>Back to sign in</AuthButton>
        <Swap>Wrong address? <AuthLink onClick={clearMsgs}>Sign up again</AuthLink></Swap>
      </>
    );
  } else if (mode === 'forgot' && info) {
    // auth-11
    body = (
      <>
        <AuthMark><Icon.mail size={24} /></AuthMark>
        <AuthTitle title="Reset link sent"
          sub={<>We sent it to <b className="font-semibold text-ink">{credentials.email}</b>. Check your inbox, and spam.</>} />
        <AuthButton variant="alt" onClick={() => { setMode('login'); clearMsgs(); }}>Back to sign in</AuthButton>
      </>
    );
  } else if (mode === 'login') {
    // auth-01 / 02 / 03
    body = (
      <>
        <AuthTitle title="Welcome back" sub="Sign in to your shop." />
        {offlineNote}
        <form onSubmit={handleSubmit}>
          <AuthField label="Email" htmlFor="login-email">
            <AuthInput id="login-email" type="email" placeholder="you@business.com" autoComplete="off" required bad={!!error}
              value={credentials.email} onChange={(e) => setCredentials({ ...credentials, email: e.target.value })} />
          </AuthField>
          <AuthField label="Password" htmlFor="login-password"
            action={<AuthLink className="text-[12.5px]" onClick={() => { setMode('forgot'); clearMsgs(); }}>Forgot password?</AuthLink>}>
            <PasswordInput id="login-password" placeholder="Password" autoComplete="off" required bad={!!error}
              value={credentials.password} onChange={(e) => setCredentials({ ...credentials, password: e.target.value })} />
          </AuthField>
          {error && <AuthNote tone="rd">{error}</AuthNote>}
          <AuthButton type="submit" disabled={loading || googleLoading}>Sign in</AuthButton>
          <OrRule />
          {/* Passwords are the main way people get locked out of this app. A number
              they already have on WhatsApp is the fallback. */}
          <AuthButton variant="alt" onClick={goPhoneMode}><Icon.whatsapp />Sign in with WhatsApp</AuthButton>
        </form>
        {googleButton}
        <Swap>New to bookledger? <AuthLink onClick={() => { setMode('signup'); clearMsgs(); }}>Create an account</AuthLink></Swap>
      </>
    );
  } else if (mode === 'phone') {
    // auth-04 / 05 / 06
    body = (
      <>
        <BackLink onClick={() => { setMode('login'); clearMsgs(); }}>Use email and password instead</BackLink>
        {phoneStep === 'number'
          ? <AuthTitle title="Sign in with WhatsApp" sub="We will send a code to your WhatsApp." />
          : <AuthTitle title="Enter the code" sub={`The 6-digit code sent to ${formatPhone(sentTo)} on WhatsApp.`} />}
        <form onSubmit={phoneStep === 'number' ? handleSendOtp : handleVerifyOtp}>
          {phoneStep === 'number' ? (
            <>
              <AuthField label="Mobile number" htmlFor="login-phone">
                {/* The country code is shown, not typed. Every user is in India and a
                    free-text +91 is one more thing to get wrong at a counter. */}
                <AuthInput id="login-phone" type="tel" inputMode="numeric" autoComplete="tel" placeholder="98765 43210"
                  required autoFocus bad={!!error} lead={<PhonePrefix />} className="tracking-[0.02em]"
                  value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} />
              </AuthField>
              {!error && <Hint className="-mt-1.5 mb-3.5">The number must already be on your login. Add it in Settings, Account.</Hint>}
            </>
          ) : (
            <>
              {info && !error && <AuthNote tone="gr">{info}</AuthNote>}
              <OtpBoxes aria-label="WhatsApp code" type="text" inputMode="numeric" autoComplete="one-time-code"
                required autoFocus maxLength={8}
                value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))} />
              <div className="mt-3 flex justify-between font-tight text-[13px] font-semibold text-body">
                <button type="button" className="hover:text-ink"
                  onClick={() => { setPhoneStep('number'); setError(''); setInfo(''); setOtpCode(''); }}>
                  Change number
                </button>
                <button type="button" disabled={resendIn > 0 || phoneLoading} onClick={handleSendOtp}
                  className="hover:text-ink disabled:cursor-not-allowed disabled:text-faint">
                  {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                </button>
              </div>
            </>
          )}
          {error && <AuthNote tone="rd" className={phoneStep === 'code' ? 'mt-4' : ''}>{error}</AuthNote>}
          <AuthButton type="submit" busy={phoneLoading}
            className={phoneStep === 'code' ? 'mt-5' : ''}
            disabled={phoneLoading || (phoneStep === 'number' && !toE164(phoneInput))}>
            {phoneLoading ? 'Please wait…' : phoneStep === 'number' ? 'Send code' : 'Verify and sign in'}
          </AuthButton>
        </form>
      </>
    );
  } else if (mode === 'signup') {
    // auth-07 / 09
    body = (
      <>
        <AuthTitle title="Create your account" sub="60 days free. No card needed." />
        <form onSubmit={handleSignUp}>
          <AuthField label="Full name" htmlFor="signup-name">
            <AuthInput id="signup-name" type="text" placeholder="Full name" autoComplete="off" required
              value={signup.name} onChange={(e) => setSignup({ ...signup, name: e.target.value })} />
          </AuthField>
          <AuthField label="Email" htmlFor="signup-email">
            <AuthInput id="signup-email" type="email" placeholder="you@business.com" autoComplete="off" required
              value={signup.email} onChange={(e) => setSignup({ ...signup, email: e.target.value })} />
          </AuthField>
          <AuthField label="Password" htmlFor="signup-password">
            <PasswordInput id="signup-password" placeholder="Password" autoComplete="off" required bad={signupPwBad}
              value={signup.password} onChange={(e) => setSignup({ ...signup, password: e.target.value })} />
          </AuthField>
          <AuthField label="Confirm password" htmlFor="signup-confirm">
            <PasswordInput id="signup-confirm" placeholder="Confirm password" autoComplete="off" required bad={signupPwBad}
              value={signup.confirm} onChange={(e) => setSignup({ ...signup, confirm: e.target.value })} />
          </AuthField>
          {error
            ? <AuthNote tone="rd">{error}</AuthNote>
            : <Hint className="-mt-1.5 mb-3">At least 8 characters.</Hint>}
          <AuthButton type="submit" disabled={signupLoading || googleLoading} busy={signupLoading}>
            {signupLoading ? 'Creating…' : 'Start free trial'}
          </AuthButton>
          <p className="mt-3 text-center text-[12px] text-mute">By signing up you agree to the Terms of Service.</p>
        </form>
        <OrRule />
        {googleButton}
        <Swap>Already have an account? <AuthLink onClick={() => { setMode('login'); clearMsgs(); }}>Sign in</AuthLink></Swap>
      </>
    );
  } else {
    // auth-10
    body = (
      <>
        <BackLink onClick={() => { setMode('login'); clearMsgs(); }}>Back to sign in</BackLink>
        <AuthTitle title="Reset your password" sub="Enter your email and we will send a reset link." />
        <form onSubmit={handleForgot}>
          <AuthField label="Email" htmlFor="forgot-email">
            <AuthInput id="forgot-email" type="email" placeholder="you@business.com" autoComplete="email" required autoFocus
              bad={!!error} lead={<Icon.mail className="text-mute" />}
              value={credentials.email} onChange={(e) => setCredentials({ ...credentials, email: e.target.value })} />
          </AuthField>
          {error && <AuthNote tone="rd">{error}</AuthNote>}
          <AuthButton type="submit" disabled={resetLoading} busy={resetLoading}>
            {resetLoading ? 'Sending…' : 'Send reset link'}
          </AuthButton>
        </form>
      </>
    );
  }

  return <AuthShell onLogoClick={handleLogoClick}>{body}</AuthShell>;
};

export default Login;
