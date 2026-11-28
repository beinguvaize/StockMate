// Password recovery — second half of the reset flow. The "Forgot password?"
// email link lands here with a recovery session (Supabase detectSessionInUrl
// + PASSWORD_RECOVERY event). User sets a new password via updateUser.
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  AuthShell, AuthTitle, AuthMark, AuthField, PasswordInput, AuthNote, AuthButton, Hint, Icon,
} from '../components/auth/AuthParts';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);   // recovery session present?
  const [email, setEmail] = useState('');      // whose password, shown under the heading
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    // The recovery link establishes a session; confirm one exists.
    supabase.auth.getSession().then(({ data }) => {
      setReady(!!data?.session);
      if (data?.session?.user?.email) setEmail(data.session.user.email);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true);
      if (session?.user?.email) setEmail(session.user.email);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setMsg('');
    if (pw.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (pw !== pw2) { setErr('Passwords do not match.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setErr(error.message || 'Could not update password.'); return; }
    setMsg('Password updated. Redirecting to sign in…');
    await supabase.auth.signOut();
    setTimeout(() => navigate('/login'), 1200);
  };

  return (
    <AuthShell>
      {!ready ? (
        // auth-13
        <>
          <AuthMark tone="rd"><Icon.warn size={24} /></AuthMark>
          <AuthTitle title="Open the link from your email"
            sub="This page sets a new password only when it is opened from the reset email. If you came here directly, or the link has expired, ask for a fresh one." />
          <AuthButton onClick={() => navigate('/login')}>Go to sign in for a new link</AuthButton>
        </>
      ) : (
        // auth-12
        <>
          <AuthTitle title="Set a new password" sub={email ? `For ${email}` : 'Choose a new password for your account.'} />
          <form onSubmit={submit}>
            <AuthField label="New password" htmlFor="reset-pw">
              <PasswordInput id="reset-pw" value={pw} onChange={e => setPw(e.target.value)} minLength={8} required autoFocus
                autoComplete="new-password" bad={!!err} />
            </AuthField>
            <AuthField label="Confirm password" htmlFor="reset-pw2">
              <PasswordInput id="reset-pw2" value={pw2} onChange={e => setPw2(e.target.value)} minLength={8} required
                autoComplete="new-password" bad={!!err} />
            </AuthField>
            {err && <AuthNote tone="rd">{err}</AuthNote>}
            {msg && <AuthNote tone="gr">{msg}</AuthNote>}
            {!err && !msg && <Hint className="-mt-1.5 mb-3">At least 8 characters. After saving you go back to sign in.</Hint>}
            <AuthButton type="submit" disabled={busy} busy={busy}>
              {busy ? 'Updating…' : 'Update password'}
            </AuthButton>
          </form>
        </>
      )}
    </AuthShell>
  );
}
