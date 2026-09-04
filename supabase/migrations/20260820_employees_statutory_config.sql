-- Applied to prod 20 Aug 2026.
-- Per-employee statutory setup. Everything defaults OFF: EPF is compulsory at
-- 20 employees and ESI at 10, and the largest tenant here has three, so
-- defaulting them on would invent deductions from real wages.
--
-- On the employee rather than the tenant because they genuinely vary per
-- person: PF membership follows the individual, ESI stops applying once a wage
-- passes the limit, and TDS is a figure an accountant gives for one employee.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS epf_enabled            boolean NOT NULL DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS epf_on_full_wage       boolean NOT NULL DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS esi_enabled            boolean NOT NULL DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS professional_tax_state text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS tds_monthly            numeric NOT NULL DEFAULT 0;
