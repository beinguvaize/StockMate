import React from 'react';
import { AuthShell, AuthTitle, AuthMark, AuthButton, Icon } from './auth/AuthParts';

/**
 * Shown when someone is signed in but has no row in `users` (approved auth-14).
 *
 * That state is not a permissions problem the user can work around: without a
 * row, current_tenant_id() is null and is_global_admin() is false, so every RLS
 * policy denies. Reads can still look normal because the cache serves rows, and
 * every write matches nothing and does nothing.
 *
 * Before this, the app invented a profile in memory and carried on, so an
 * account in this state looked completely healthy while quietly discarding
 * everything typed into it. Blocking is the honest response: the alternative is
 * letting someone do an afternoon's work that was never saved.
 */
const AccountNotProvisioned = ({ email, onSignOut, removed = false }) => (
  <AuthShell>
    <AuthMark tone="rd"><Icon.lock size={24} /></AuthMark>
    <AuthTitle
      title={removed ? 'This account no longer has access' : 'This account is not set up yet'}
      sub={removed ? (
        <>You are signed in as <b className="font-semibold text-ink">{email}</b>, but this address has been removed from the
          shop it belonged to. If this was not intended, ask the owner to add this address again in Settings, Users &amp; roles.</>
      ) : (
        <>You are signed in as <b className="font-semibold text-ink">{email}</b>, but no shop has this address. If you have
          another address for this business, sign out and use that one. Otherwise ask the owner to add this address in
          Settings, Users &amp; roles.</>
      )}
    />
    <AuthButton variant="alt" onClick={onSignOut}>Sign out</AuthButton>
  </AuthShell>
);

export default AccountNotProvisioned;
