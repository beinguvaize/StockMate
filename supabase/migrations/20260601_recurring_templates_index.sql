-- The recurring-expense generator and the manage list both query
-- recurring_expense_templates by tenant_id (+ active / deleted_at). The
-- table only had a PK on id, so add a tenant index. Partial on the live
-- rows since deleted templates are never queried.
CREATE INDEX IF NOT EXISTS idx_recurring_templates_tenant
  ON public.recurring_expense_templates (tenant_id)
  WHERE deleted_at IS NULL;
