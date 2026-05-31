# StockMate / LedgrPro — Project Rules

> Read this file before writing or reviewing any code. Rules here override
> default behaviour and personal preferences.

---

## SECURITY: NEVER trust `auth.jwt() -> 'user_metadata'`

Supabase's `user_metadata` is **writable by the authenticated user themselves**:

```js
// any logged-in user can run this from devtools
await supabase.auth.updateUser({
  data: { tenant_id: 'some-other-tenant-uuid', roles: ['GLOBAL_ADMIN'] }
});
```

The change propagates into `auth.jwt() -> 'user_metadata'`. Any RPC,
policy, function or edge function that reads from there to make a
**security decision** is exploitable for full RLS bypass.

### Rules

1. **Do not** read `auth.jwt() -> 'user_metadata'` for authorization
   anywhere — RLS policies, SQL functions, PL/pgSQL, edge functions.
2. **Do not** read `raw_user_meta_data` from `auth.users` for the same
   reason — that is the canonical store for `user_metadata`.
3. Authorization helpers must resolve identity from `auth.uid()` and
   query the trusted `public.users` table:

   ```sql
   -- Correct: db-only, ignores JWT metadata
   CREATE OR REPLACE FUNCTION public.is_global_admin()
   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
   SET search_path TO 'public'
   AS $$
     SELECT EXISTS (
       SELECT 1 FROM public.users
        WHERE id = (auth.uid())::text
          AND roles @> ARRAY['GLOBAL_ADMIN']::text[]
     );
   $$;
   ```

4. Use the existing helpers (`public.current_tenant_id()`,
   `public.is_global_admin()`, `public.is_tenant_admin()`) in every new
   RLS policy. Do not roll your own JWT parsing.
5. If you need a JWT-side claim for a security decision, use
   `app_metadata` (set via the admin API / service role, **not**
   writable by the user) — but prefer the DB lookup above.
6. Writing to `user_metadata` from edge functions is fine for cosmetic
   fields (display name, preferred locale). Never use those values to
   decide who can read or write what.

### Client-side companion

The client must also gate impersonation by the verified
`currentUser.roles` value — even though RLS is the real backstop, the
UI should not flip into another tenant's chrome for non-admins.
`TenantContext.impersonateTenant` already enforces this.

---

## Environment + deploy

- Dev first, prod after sign-off. Two Supabase projects:
  - **Prod**: `lmviftlynuhopzmvaxeu` (LedgeproProd)
  - **Dev**:  `tiywdsbaymrnqmlkxupj` (LedgrproDev)
- Web: Vercel auto-deploys `main` → prod, `develop` → dev preview.
- Mobile: builds bundle prod Supabase URL. Distribute via GitHub
  releases with `mobile-v<MAJOR>.<MINOR>.<PATCH>` tag; the in-app
  auto-updater regex matches that pattern.
- Desktop wraps the web build in Electron + electron-updater.

## Architecture invariants

- Web and mobile are kept feature-parity. Only desktop diverges
  (online auth + tenant resolution then manual sync).
- Mobile print uses the web embed routes
  (`/embed/receipt/:saleId`, `/embed/invoice/:invoiceId`) via the
  offscreen `WebPrintService` so the React templates are the single
  source of truth for receipt + invoice layout.
- Outbox + exponential backoff for sync. Triggers on `sales` and
  `client_payments` keep `clients.outstanding_balance` correct;
  nightly `audit_outstanding_drift` job flags any drift > ₹1.

## Communication

- Caveman mode is for chat prose only. Code, commits and PRs are
  written in normal English.
- Destructive prod operations (DROP, hard delete, force push to main,
  bypassing hooks) require explicit user confirmation in chat before
  execution. The RLS helper rewrite in this file is the model: dev
  first, audit, then prod.
