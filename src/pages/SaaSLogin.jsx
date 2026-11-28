import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  AuthShell, AuthTitle, AuthMark, AuthField, AuthInput, PasswordInput, AuthNote,
  AuthButton, OrRule, AuthLink, Swap, Hint, Icon,
} from '../components/auth/AuthParts';

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

  const switchTo = (m) => { setMode(m); setError(''); setInfo(''); };
  const pwBad = !!error && /password/i.test(error);

  const google = (
    <AuthButton variant="alt" onClick={handleGoogleSignIn} disabled={googleLoading || loading} busy={googleLoading}
      className={mode === 'login' ? 'mt-2' : ''}>
      {!googleLoading && <Icon.google />}Continue with Google
    </AuthButton>
  );

  let body;
  if (mode === 'signup' && info) {
    body = (
      <>
        <AuthMark><Icon.mail size={24} /></AuthMark>
        <AuthTitle title="Check your email"
          sub={<>We sent a confirmation link to <b className="font-semibold text-ink">{email}</b>. Open it, then come back to sign in.</>} />
        <AuthNote tone="gy">Nothing in your inbox after a few minutes? Look in spam.</AuthNote>
        <AuthButton variant="alt" onClick={() => switchTo('login')}>Back to sign in</AuthButton>
        <Swap>Wrong address? <AuthLink onClick={() => setInfo('')}>Sign up again</AuthLink></Swap>
      </>
    );
  } else if (mode === 'login') {
    body = (
      <>
        <AuthTitle title="Welcome back" sub="Sign in to your shop." />
        <form onSubmit={handleLogin}>
          <AuthField label="Email" htmlFor="reg-login-email">
            <AuthInput id="reg-login-email" type="email" placeholder="you@business.com" required bad={!!error}
              value={email} onChange={e => setEmail(e.target.value)} />
          </AuthField>
          <AuthField label="Password" htmlFor="reg-login-password">
            <PasswordInput id="reg-login-password" placeholder="Password" required bad={!!error}
              value={password} onChange={e => setPassword(e.target.value)} />
          </AuthField>
          {error && <AuthNote tone="rd">{error}</AuthNote>}
          <AuthButton type="submit" disabled={loading} busy={loading}>Sign in</AuthButton>
        </form>
        <OrRule />
        {google}
        <Swap>New to bookledger? <AuthLink onClick={() => switchTo('signup')}>Create an account</AuthLink></Swap>
      </>
    );
  } else {
    body = (
      <>
        <AuthTitle title="Create your account" sub="60 days free. No card needed." />
        <form onSubmit={handleSignUp}>
          <AuthField label="Full name" htmlFor="reg-name">
            <AuthInput id="reg-name" type="text" placeholder="Full name" required
              value={name} onChange={e => setName(e.target.value)} />
          </AuthField>
          <AuthField label="Email" htmlFor="reg-email">
            <AuthInput id="reg-email" type="email" placeholder="you@business.com" required
              value={email} onChange={e => setEmail(e.target.value)} />
          </AuthField>
          <AuthField label="Password" htmlFor="reg-password">
            <PasswordInput id="reg-password" placeholder="Password" required bad={pwBad}
              value={password} onChange={e => setPassword(e.target.value)} />
          </AuthField>
          <AuthField label="Confirm password" htmlFor="reg-confirm">
            <PasswordInput id="reg-confirm" placeholder="Confirm password" required bad={pwBad}
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
          </AuthField>
          {error
            ? <AuthNote tone="rd">{error}</AuthNote>
            : <Hint className="-mt-1.5 mb-3">At least 8 characters.</Hint>}
          <AuthButton type="submit" disabled={loading} busy={loading}>Start free trial</AuthButton>
          <p className="mt-3 text-center text-[12px] text-mute">By signing up you agree to the Terms of Service.</p>
        </form>
        <OrRule />
        {google}
        <Swap>Already have an account? <AuthLink onClick={() => switchTo('login')}>Sign in</AuthLink></Swap>
      </>
    );
  }

  return <AuthShell>{body}</AuthShell>;
};

export default SaaSLogin;
