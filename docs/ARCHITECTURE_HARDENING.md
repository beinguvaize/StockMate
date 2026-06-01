# Architecture Hardening Plan

Goal: reduce recurring bugs and ship new features **without touching the
current web (React) / mobile (Flutter) / Supabase structure**. Every item
here is an additive guardrail, not a rewrite.

## Why — the four root causes

Most production incidents traced back to four patterns, not unique bugs:

| # | Root cause | Real incidents it caused |
|---|---|---|
| 1 | **Business logic duplicated per surface** — web JS, mobile Dart, and the RPC each re-implement the same rule, then drift | tax_mode ignored on mobile checkout; invoice list sorted differently on web vs mobile; VOIDED sale shown as "Pending" on web but "Failed" on mobile; three different invoice-number formats |
| 2 | **DB drift** — schema changes applied ad-hoc, duplicate RPC overloads, dev ≠ prod | `process_sale` + `convert_sale_to_invoice` PGRST203 (blocked all sale sync); `deleted_at` column missing on dev broke checkout; `settle_sale_payment` missing entirely |
| 3 | **No safety net** — no tests, no schema diff, manual dev→prod | every fix shipped blind; regressions found only in production |
| 4 | **Trusting client-controlled data** | `user_metadata` read in RLS allowed cross-tenant access |

## Phase 1 — Stop the bleeding *(in progress)*

Zero user-facing change. Highest ROI.

1. **Migrations as committed files.** Every DB change lives in
   `supabase/migrations/<date>_<name>.sql`, applied to dev then prod from
   the *same* file. No more hand-typed one-off SQL. → kills new drift (#2).
2. **Duplicate-overload guard.** `audit_function_overloads()` RPC +
   `scripts/check-rpc-overloads.sh`. Fails CI if any public function has
   >1 signature. → prevents the PGRST203 sync-block class (#2).
3. **Dev↔prod schema diff.** `schema_signature()` RPC +
   `scripts/check-schema-drift.sh`. Fails CI if the two environments'
   columns/functions differ. → prevents the `deleted_at` class (#2).

Wired in `.github/workflows/schema-guard.yml` (runs on PRs into main).

### Duplicate-overload backlog

Each is a latent PGRST203. **Procedure per function:** grep callers in
`src/` + `mobile_app/lib/` → confirm the live signature → drop the other
signatures on **dev** → re-run the guard → only then apply the same drop
on **prod**. Do one function per work block; never bulk-drop high-blast
functions in a long/tired session.

Resolved (dev):
- [x] `get_next_invoice_number` — both signatures dropped; AppContext +
  SalesContext now call `issue_invoice_number`. (prod still has them)
- [x] `create_staff_account` — legacy 4-arg dropped, 5-arg kept. No live
  caller (staff created via the edge function). (prod still has both)

Resolved (dev) — `supabase/migrations/20260601_defuse_duplicate_overloads.sql`:
- [x] `recompute_client_outstanding` — was a **false positive**: the
  0-arg is a trigger function (returns `trigger`), never REST-callable.
  The guard now excludes trigger functions, so this no longer flags.
- [x] `adjust_inventory_atomic` — dropped 6-arg; kept 9-arg superset (all
  extras default, adds movement logging). All callers pass base args only.
- [x] `dispatch_vehicle_route` — dropped legacy 6-arg (text[] invoice ids,
  no caller); kept the 10-arg both surfaces call.

**Dev is now at 0 overloads.**

Open (prod only — not yet touched, defuse during the dev→prod sync):
- [ ] `get_next_invoice_number` (both), `create_staff_account` (4-arg) —
  mirror the dev drops above.
- [ ] `process_purchase_return` — 3 signatures on prod (two 12-arg, one
  13-arg with `p_location_id`). Both web + mobile callers pass 13 args
  incl. location → keep the 13-arg, drop the two 12-arg.

**Sequencing rule:** finish all dev defusals first, then do one clean
dev→prod migration sync, then re-run the guard against both. Avoids a
half-defused prod state.

## Phase 2 — One source of truth for business rules

Kills root cause #1 at the source.

4. **Shared logic in RPCs.** Tax totals, invoice numbering, and payment-
   status resolution become DB functions both surfaces call, instead of
   each re-deriving. Already half-done: `issue_invoice_number`,
   `process_sale` (tax), `settle_sale_payment`. Finish the set; have web +
   mobile call them rather than recomputing.
5. **Generated shared constants.** Status enums (PAID / PARTIAL / VOIDED),
   sort keys, payment methods defined once (JSON) and code-generated into
   both JS and Dart. No more web≠mobile divergence on enums.

## Phase 3 — Catch regressions before prod

6. **RPC contract tests** against the dev DB before merge: `process_sale`,
   `convert_sale_to_invoice`, `settle_sale_payment`, `issue_invoice_number`
   — assert single overload + happy path + correct tax math (inclusive and
   exclusive).
7. **Golden fixtures.** One canonical sample sale → expected receipt
   number, totals, CGST/SGST split. Both the web render and the mobile
   total computation assert against the same fixture so they can't drift.

## Phase 4 — Release safety

8. **Min-supported-app-version gate** (server-side). A breaking RPC change
   forces a mobile update instead of silently failing sync (as the
   `process_sale` overload did).
9. **Per-release smoke checklist** — codify the manual verification steps
   we already run (checkout tax, print parity, sync, impersonation block).
10. **Feature flags.** New features default-off per tenant/plan so they
    cannot affect existing flows until explicitly enabled.

## Scaling notes (index audit — 2026-06-01)

Indexing on hot tables (sales, expenses, invoices, purchases,
client_payments, clients, products) is already mature: each has
`(tenant_id, id)`, `(tenant_id, created_at)`, category/status
composites, and `updated_at` (for incremental sync). Not a current
bottleneck. Deferred items, in priority order, for when scale demands:

1. **Move report/dashboard aggregation server-side.** Lists + totals
   currently fetch `select('*').limit(500)` and sum/filter in JS. Caps
   results and loads slow past ~10k rows/tenant. Return summaries from
   RPCs / views instead (the pattern already used by
   audit_outstanding_drift + FIFO COGS).
2. **Add `(tenant_id, date)` on the business-date column** when reports
   go server-side. Today the `idx_*_tenant_date` indexes actually cover
   `created_at`, not the `date` text column the period filter uses.
3. **Incremental pull sync.** pullSync fetches ~22 tables on resume;
   switch to "rows changed since last sync" via `updated_at`.
4. **Drop duplicate indexes.** sales/expenses/purchases/client_payments
   each carry two identical `(tenant_id, created_at)` indexes
   (`_tenant_date` + `_tenant_created`). Drop one of each to cut write
   amplification — only worth it at high write volume.

Applied now: `idx_recurring_templates_tenant` (the one table that had
only a PK).

## Operating rules (already in CLAUDE.md)

- Never trust `auth.jwt() -> 'user_metadata'` for authorization (#4).
- Never ship a second RPC overload — alter in place with a DEFAULT; if one
  appears, DROP the old signature in the same migration (#2).
- Dev first, prod after confirmation, for destructive operations.
