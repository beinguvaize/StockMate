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

## SUPABASE RPC: never ship a second overload

PostgREST cannot disambiguate two functions with the same name when a
caller omits the parameter that differs between them. It returns
PGRST203 "Could not choose the best candidate function" and the call
fails. This bit us twice — `convert_sale_to_invoice` (10-arg vs
11-arg `p_phone`) and `process_sale` (13-arg vs 14-arg
`p_paid_amount`) — and in the second case it silently blocked every
mobile sale from syncing.

### Rules

1. To add a parameter to an existing RPC, **alter it in place** with
   `CREATE OR REPLACE FUNCTION` and give the new param a DEFAULT. Do
   NOT create a second overload with a different arity.
2. If a migration ever does introduce a second overload, it must
   `DROP FUNCTION` the old signature in the **same** migration so only
   one version is ever live.
3. New params go at the **end** of the signature with a DEFAULT so old
   callers (cached web bundles, older mobile builds) keep resolving.
4. Before shipping an RPC change, check for duplicates:
   ```sql
   SELECT oid::regprocedure::text, pronargs
   FROM pg_proc WHERE proname = '<fn>' ORDER BY pronargs;
   ```
   More than one row = a sync-breaking overload is live. Drop the
   stale one (dev first, then prod, with confirmation).

---

## Always filter by tenant_id. RLS is not the filter.

Nearly every tenant-table policy reads:

```sql
is_global_admin() OR tenant_id = (SELECT current_tenant_id())
```

A global admin is therefore **entitled to every tenant's rows**. Leaning on RLS
alone means any list, aggregate, or delete silently spans all tenants the moment
an admin — or anyone impersonating — runs it. Every Supabase query against a
tenant table gets an explicit `.eq('tenant_id', currentTenantId)`, including
deletes and upserts.

These are not hypothetical; all four shipped:

| Bug | Effect |
|---|---|
| `ExpiryAlertCard` | dashboard totalled every tenant's expiring stock into one figure |
| `AuditLog` | tenant activity trail showed all tenants' entries to an admin |
| `budgetRepo.fetchBudget` | merged all tenants' lines into one category-keyed map, colliding |
| `budgetRepo.upsertBudgetLine` | setting a line to 0 **deleted that category for every tenant** |

Two traps that go with it:

- **Never rely on the `tenant_id` column default.** 22 tables default it to
  `a0000000-0000-0000-0000-000000000001`, which belongs to no tenant. Omitting
  `tenant_id` on an insert orphans the row: invisible to the shop that created
  it, visible only to global admins. This is how 14 budget lines were stranded.
- **Put `currentTenantId` in the dependency array.** A query that filters
  correctly but never re-runs shows the previous tenant's data after a switch or
  an impersonation, which looks identical to the unfiltered bug.

Deliberate exceptions, all admin surfaces: `AdminPanel`, `SuperAdminPortal`,
`useBugReports` in `adminMode`. Cross-tenant is the point there — leave them.

---

## Data repairs: snapshot first, in `snap`

Any repair that writes to prod takes a before-image first. Snapshots live in
the **`snap` schema — never in `public`**, where seventeen of them once piled
up over eleven days, reachable by PostgREST and indistinguishable from real
tables.

```sql
SELECT snap.take(
  'purchase_transfer',                                    -- lower_snake_case slug
  $$SELECT * FROM purchases WHERE id = 'PUR-E6PRCT'$$,    -- what to capture
  'before moving the batch to 13*16 Pkt Cover',           -- why (required)
  30);                                                    -- keep days, default 30
-- -> snap.purchase_transfer_20260722
```

- `snap.registry` — one row per snapshot: reason, row count, who, expiry.
- `snap.pin('<table>')` — sets `expires_at` NULL so the sweep skips it. Pin
  anything backing work that is not yet settled.
- `snap.sweep()` — drops everything past expiry and returns what it removed.
  Runs weekly via the `snapshot-sweep` cron job (Sun 03:30).
- `snap.unregistered` — tables created by hand that never registered, and so
  would never expire. Should stay empty.

`snap.take()` executes the SQL it is handed, so it is **not** granted to
`authenticated` — it is a repair tool, not something the app may call. The
slug is validated against `^[a-z][a-z0-9_]*$` before it reaches the table
name. Snapshots are verbatim copies carrying none of the source table's RLS,
which is why `anon` and `authenticated` have no access to the schema at all.

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
