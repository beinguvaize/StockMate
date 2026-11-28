# Supabase integration tests

Plain SQL regression scripts. Each file asserts a migration's behavior
end-to-end against a real Postgres role (`authenticated`) using JWT
impersonation via `request.jwt.claims`.

## Running

Via the Supabase MCP `execute_sql` or any psql session connected to the
project database:

```bash
psql "$DATABASE_URL" -f supabase/tests/rls01_plan_gates_test.sql
```

Every script wraps its work in `BEGIN / ROLLBACK` so no rows persist.
On success the script emits `RAISE NOTICE 'OK: ...'` lines. On failure
it raises an exception naming the specific assertion that broke.

## Files

| File | What it verifies |
|---|---|
| `rls01_plan_gates_test.sql` | `has_module_access()` returns correct allow/deny for STARTER / PRO / ENTERPRISE across representative modules |
| `restore_test.sql` | Restore round trip: every shop table byte-identical after restore and after undo; every insert/delete trigger guarded; incomplete backups and non-owners refused |
| `ai_chat_test.sql` | AI chat read functions: STABLE, no tenant argument, no DML, anon refused; one shop cannot read another; a global admin gets their own tenant only; staff refused; voided and soft-deleted rows excluded; cache, quota and the on/off switch; both tables outside shop backups. Over MCP, swap the closing SELECT and ROLLBACK for a RAISE so the pass list shows and nothing can commit |
| `gl_posting_test.sql` | GL posts each event once on its own date: a payment never rewrites the sale journal; sales debit Receivables; ledger receipts, supplier payments and UPI purchases post to Cash; a real receipt replaces an inferred one |
| `staff_advances_test.sql` | Staff advances end to end in a throwaway shop: give and replay; recovery capped at net, oldest first, skip, recover all; delete a run with `delete_payroll_run` and the old two-step way; a failure mid-run saves nothing; an old app is refused only when a recovery is due; a shop with no advances gets exactly what the old `process_payroll_run` wrote; collect, write off, replay; update and cancel; who may; anon refused; GL 1300 = sum of `staff_advance_balances`. Over MCP: drop BEGIN/ROLLBACK and run `SELECT set_config('staff_test.mcp','on',false);` first |
| `staff_advances_concurrency_test.sql` | DEV ONLY, commits then cleans up: two pay runs at once (one through a one-off pg_cron job) cannot recover the same money |

## Conventions

- Tests must be idempotent and side-effect-free (use `ROLLBACK`).
- Tests must NOT depend on fixture data the app creates — use
  `SET LOCAL request.jwt.claims` with a known-existing user id.
- On assertion failure, `RAISE EXCEPTION` with the expected vs. actual
  values so a failed run is self-documenting.
