import React, { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { supabase } from '../../lib/supabase';
import { linkPhone, confirmPhoneLink, formatPhone, toE164 } from '../../lib/phoneAuth';
import { Button } from '../../components/ui/button';
import AskSettingsCard from '../../components/ask/AskSettingsCard';
import { PanelHead, Stack, SCard, FormRow, Note, TextLink, fieldCls, useSaveState, SaveMsg } from './parts';

/**
 * Account (approved settings-01 and 02): profile, password, WhatsApp sign-in,
 * Ask (owner, when offered) and sign out. Same calls as before.
 */

// Adding a number here is what makes phone login possible at all: the login
// screen refuses any number it does not recognise, so that an unknown number
// can never mint a fresh auth user with no `users` row behind it. Linking from
// inside a session attaches the number to the uid the user ALREADY has, so
// they keep their tenant, role and history.
function WhatsAppSignInCard() {
  const [current, setCurrent] = useState(null);   // number already on the account
  const [input, setInput] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('idle');       // 'idle' | 'code'
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // auth.users.phone is the only source of truth here.
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setCurrent(data?.user?.phone ? `+${String(data.user.phone).replace(/^\+/, '')}` : null);
    });
    return () => { alive = false; };
  }, []);

  const send = async () => {
    setErr(''); setMsg(''); setBusy(true);
    const { error } = await linkPhone(input);
    setBusy(false);
    if (error) { if (error.cause) console.error('[phone-link] send failed', error.cause); setErr(error.message); return; }
    setStep('code');
    setMsg('Code sent on WhatsApp.');
  };

  const confirm = async () => {
    setErr(''); setMsg(''); setBusy(true);
    const { error, phone } = await confirmPhoneLink(input, code);
    setBusy(false);
    if (error) { if (error.cause) console.error('[phone-link] verify failed', error.cause); setErr(error.message); return; }
    setCurrent(phone);
    setStep('idle'); setInput(''); setCode('');
    setMsg('This number can now sign in.');
  };

  const footer = (
    <>
      {msg && !err && <span className="mr-auto font-tight text-[12.5px] font-semibold text-good-text" role="status">{msg}</span>}
      {step === 'code'
        ? <Button variant="dark" size="sm" onClick={confirm} disabled={busy || code.length < 4}>{busy ? 'Checking…' : 'Confirm number'}</Button>
        : <Button variant={current ? 'secondary' : 'dark'} size="sm" onClick={send} disabled={busy || !toE164(input)}>{busy ? 'Sending…' : current ? 'Change number' : 'Send code'}</Button>}
    </>
  );

  return (
    <SCard title="WhatsApp sign-in" sub="Sign in with a one-time code instead of a password. The code arrives on WhatsApp." footer={footer}>
      <FormRow label="Current number" text>
        {current ? formatPhone(current) : <span className="text-body">Not set, password sign-in only</span>}
      </FormRow>
      {step === 'idle' ? (
        <FormRow label={current ? 'New number' : 'Mobile number'} hint="Indian mobile. The code arrives on WhatsApp, not SMS.">
          <input type="tel" inputMode="numeric" autoComplete="tel" className={`${fieldCls} max-w-[380px]`} aria-label={current ? 'New number' : 'Mobile number'}
            placeholder="98765 43210" value={input} onChange={(e) => setInput(e.target.value)} />
        </FormRow>
      ) : (
        <FormRow label="Code" hint={`Sent to ${formatPhone(toE164(input))} on WhatsApp.`}>
          <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={8} aria-label="Code"
            className={`${fieldCls} max-w-[380px] tracking-[0.2em]`}
            placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <TextLink className="mt-2" onClick={() => { setStep('idle'); setCode(''); setErr(''); setMsg(''); }}>Cancel</TextLink>
        </FormRow>
      )}
      {err && <div className="pb-3.5"><Note tone="rd" role="alert">{err}</Note></div>}
    </SCard>
  );
}

export default function AccountPanel() {
  const { currentUser, logout, isOwner } = useAuth();
  const { currentTenant } = useTenant();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [check, setCheck] = useState('');
  const save = useSaveState();

  const changePassword = async () => {
    setCheck(''); save.clear();
    if (pw.length < 8) { setCheck('Password must be at least 8 characters.'); return; }
    if (pw !== pw2) { setCheck('Passwords do not match.'); return; }
    const ok = await save.run(() => supabase.auth.updateUser({ password: pw }), 'Password updated.');
    if (ok) { setPw(''); setPw2(''); }
  };

  return (
    <div>
      <PanelHead title="Account" sub="Your own login: name, password, WhatsApp sign-in and this session." />
      <Stack>
        <SCard title="Profile" sub="Your personal account details.">
          <FormRow label="Name" text>{currentUser?.name || '—'}</FormRow>
          <FormRow label="Email" text>{currentUser?.email || '—'}</FormRow>
          <FormRow label="Roles" text>
            <span className="flex flex-wrap gap-1.5">
              {(currentUser?.roles || []).map((r) => (
                <span key={r} className="rounded-pill bg-well px-[9px] py-[3px] font-tight text-[11.5px] font-semibold text-ink-2">{r}</span>
              ))}
            </span>
          </FormRow>
        </SCard>

        <SCard title="Password" sub="Use at least 8 characters. You'll stay signed in on this device."
          footer={<>
            {check
              ? <span className="mr-auto font-tight text-[12.5px] font-semibold text-bad-text" role="alert">{check}</span>
              : <SaveMsg state={save} noun="password change" />}
            <Button variant="dark" size="sm" onClick={changePassword} disabled={save.busy}>{save.busy ? 'Saving…' : 'Update password'}</Button>
          </>}>
          <FormRow label="New password">
            <input type="password" autoComplete="new-password" aria-label="New password" className={`${fieldCls} max-w-[380px]`} placeholder="••••••••" value={pw} onChange={(e) => setPw(e.target.value)} />
          </FormRow>
          <FormRow label="Confirm password">
            <input type="password" autoComplete="new-password" aria-label="Confirm password" className={`${fieldCls} max-w-[380px]`} placeholder="••••••••" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </FormRow>
        </SCard>

        <WhatsAppSignInCard />

        {isOwner && currentTenant?.settings?.ai_chat_available === true && <AskSettingsCard />}

        <SCard title="Session" sub="Sign out of bookledger on this device.">
          {/* No "other devices stay signed in" (settings-01): logout calls
              supabase signOut with its default, global, scope. */}
          <FormRow label="Sign out">
            <Button variant="outline" size="sm" onClick={logout} className="text-bad-text shadow-[inset_0_0_0_1px_var(--color-bad-soft)] hover:bg-bad-soft">
              <LogOut aria-hidden="true" />Log out
            </Button>
          </FormRow>
        </SCard>
      </Stack>
    </div>
  );
}
