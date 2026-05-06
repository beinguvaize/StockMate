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

## Conventions

- Tests must be idempotent and side-effect-free (use `ROLLBACK`).
- Tests must NOT depend on fixture data the app creates — use
  `SET LOCAL request.jwt.claims` with a known-existing user id.
- On assertion failure, `RAISE EXCEPTION` with the expected vs. actual
  values so a failed run is self-documenting.
