// Password recovery — second half of the reset flow. The "Forgot password?"
// email link lands here with a recovery session (Supabase detectSessionInUrl
// + PASSWORD_RECOVERY event). User sets a new password via updateUser.
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);   // recovery session present?
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    // The recovery link establishes a session; confirm one exists.
    supabase.auth.getSession().then(({ data }) => setReady(!!data?.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true);
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
    <div className="min-h-screen flex items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm bg-white border border-black/5 rounded-2xl shadow-sm p-7">
        <h1 className="text-xl font-extrabold text-ink-primary">Reset password<span className="text-accent-signature">.</span></h1>
        {!ready ? (
          <p className="mt-4 text-[13px] text-muted-foreground font-medium">
            Open the reset link from your email to set a new password. If you arrived here directly,
            request a fresh link from the <button onClick={() => navigate('/login')} className="text-accent-signature underline">sign-in page</button>.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-3">
            <label className="block">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">New password</span>
              <input type="password" value={pw} onChange={e => setPw(e.target.value)} minLength={8} required autoFocus
                className="mt-1 w-full h-11 px-3 border border-black/10 rounded-xl text-[14px] outline-none focus:border-accent-signature/70 focus:ring-2 focus:ring-accent-signature/20" />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Confirm password</span>
              <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} minLength={8} required
                className="mt-1 w-full h-11 px-3 border border-black/10 rounded-xl text-[14px] outline-none focus:border-accent-signature/70 focus:ring-2 focus:ring-accent-signature/20" />
            </label>
            {err && <p className="text-[12px] font-semibold text-red-600">{err}</p>}
            {msg && <p className="text-[12px] font-semibold text-emerald-600">{msg}</p>}
            <button type="submit" disabled={busy} className="w-full h-11 rounded-xl bg-accent-signature text-white text-[13px] font-bold disabled:opacity-50 hover:bg-accent-signature-hover">
              {busy ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
