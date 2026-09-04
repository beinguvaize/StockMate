-- Applied via apply_migration; recorded here for history.
--
-- Link a salary expense back to the payroll run that created it.
--
-- Deleting a run soft-deleted the payroll row and left its expenses standing in
-- DayBook and the P&L, because the only thing tying them together was a note
-- string: 'Payroll 2026-08-01/2026-08-08 — Akbar'. Matching on that would break
-- the first time a name is edited or the period format changes.
--
-- Precedent: expenses.recurring_template_id already records what made a row.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payroll_id text DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_payroll_id
  ON expenses (tenant_id, payroll_id) WHERE payroll_id IS NOT NULL;

-- Backfill from the note so runs made before this column are reversible too.
-- Aborts unless it claims exactly the 2 rows a dry run found.
DO $$
DECLARE n integer;
BEGIN
  UPDATE expenses e
     SET payroll_id = p.id
    FROM payroll p
   WHERE p.tenant_id = e.tenant_id
     AND p.deleted_at IS NULL
     AND e.category = 'Salary'
     AND e.deleted_at IS NULL
     AND e.payroll_id IS NULL
     AND e.note LIKE 'Payroll ' || p.period || ' — %';

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN
    RAISE EXCEPTION 'Backfill matched % salary expenses, expected 2 — aborting', n;
  END IF;
END $$;
