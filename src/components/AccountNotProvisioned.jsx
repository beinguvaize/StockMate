import React from 'react';
import { AlertTriangle, LogOut } from 'lucide-react';

/**
 * Shown when someone is signed in but has no row in `users`.
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
  <div className="min-h-screen flex items-center justify-center bg-canvas px-6">
    <div className="max-w-md w-full bg-white rounded-2xl border border-black/8 shadow-premium p-8 text-center">
      <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-5">
        <AlertTriangle size={22} className="text-amber-600" />
      </div>

      <h1 className="text-lg font-bold text-ink-primary">
        {removed ? 'This account no longer has access' : 'This account is not set up yet'}
      </h1>

      <p className="text-[13px] text-muted-foreground mt-3 leading-relaxed">
        You are signed in as <b className="text-ink-primary">{email}</b>
        {removed
          ? ', but this address has been removed from the workspace it belonged to.'
          : ', but this address has no profile in bookledger, so it is not attached to a business.'}
      </p>

      {/* Say plainly why we are stopping rather than letting them carry on. */}
      <p className="text-[12.5px] text-muted-foreground mt-3 leading-relaxed">
        Nothing you enter would be saved — the database has no record of this account, so every
        change would be rejected. That is why we have stopped here rather than letting you work.
      </p>

      <p className="text-[12.5px] text-muted-foreground mt-3 leading-relaxed">
        {removed
          ? 'If this was not intended, ask the business owner to add this address again from '
          : 'If you have another address for this business, sign out and use that one. Otherwise ask the business owner to invite this address from '}
        <b className="text-ink-primary">Settings → Users</b>.
      </p>

      <button
        onClick={onSignOut}
        className="btn-signature !h-11 !px-6 !text-sm mt-6 mx-auto flex items-center gap-2"
      >
        <LogOut size={15} /> Sign out
      </button>
    </div>
  </div>
);

export default AccountNotProvisioned;
