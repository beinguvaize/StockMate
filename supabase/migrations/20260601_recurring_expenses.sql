-- Expense feature: recurring expenses (rent, salary, subscriptions).
--
-- A template holds the repeating expense definition. A generator RPC,
-- run nightly, clones any template due "today" into a real expenses row
-- — once per period — and advances the template's last_generated marker.
-- Kept as a separate table so the existing expenses flow is untouched;
-- generated rows are ordinary expenses (with a back-link for audit).

CREATE TABLE IF NOT EXISTS public.recurring_expense_templates (
  id              text PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  note            text,
  amount          numeric NOT NULL,
  category        text NOT NULL DEFAULT 'Other',
  payment_method  text NOT NULL DEFAULT 'CASH',
  -- MONTHLY only for now; day_of_month 1..28 (cap at 28 so every month
  -- has the day — Feb-safe). frequency left as a column for future
  -- WEEKLY/YEARLY without a schema change.
  frequency       text NOT NULL DEFAULT 'MONTHLY',
  day_of_month    int  NOT NULL DEFAULT 1,
  active          boolean NOT NULL DEFAULT true,
  last_generated  date,            -- last date an instance was created
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

ALTER TABLE public.recurring_expense_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ret_select ON public.recurring_expense_templates;
DROP POLICY IF EXISTS ret_insert ON public.recurring_expense_templates;
DROP POLICY IF EXISTS ret_update ON public.recurring_expense_templates;
DROP POLICY IF EXISTS ret_delete ON public.recurring_expense_templates;

CREATE POLICY ret_select ON public.recurring_expense_templates
  FOR SELECT USING (tenant_id = public.current_tenant_id() OR public.is_global_admin());
CREATE POLICY ret_insert ON public.recurring_expense_templates
  FOR INSERT WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_global_admin());
CREATE POLICY ret_update ON public.recurring_expense_templates
  FOR UPDATE USING (tenant_id = public.current_tenant_id() OR public.is_global_admin());
CREATE POLICY ret_delete ON public.recurring_expense_templates
  FOR DELETE USING ((tenant_id = public.current_tenant_id() AND public.is_tenant_admin()) OR public.is_global_admin());

-- Link generated expenses back to their template (nullable; manual
-- expenses leave it null).
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS recurring_template_id text;

-- Generator: for the given date (default today), create one expense per
-- active template whose day_of_month matches and that hasn't already
-- generated in the current month. Returns the rows it created. Idempotent
-- within a month via the last_generated guard.
CREATE OR REPLACE FUNCTION public.generate_due_recurring_expenses(p_run_date date DEFAULT CURRENT_DATE)
RETURNS TABLE (template_id text, expense_id text, tenant_id uuid, amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  t        record;
  v_eid    text;
  v_dom    int := LEAST(EXTRACT(day FROM p_run_date)::int, 28);
BEGIN
  FOR t IN
    SELECT * FROM public.recurring_expense_templates
     WHERE active = true
       AND deleted_at IS NULL
       AND LEAST(day_of_month, 28) = v_dom
       AND (last_generated IS NULL
            OR date_trunc('month', last_generated) < date_trunc('month', p_run_date))
  LOOP
    v_eid := 'EXP-' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.expenses
      (id, tenant_id, category, amount, note, date, payment_method, recurring_template_id)
    VALUES
      (v_eid, t.tenant_id, t.category, t.amount,
       COALESCE(t.note, t.category) || ' (recurring)',
       p_run_date::text, t.payment_method, t.id);

    UPDATE public.recurring_expense_templates
       SET last_generated = p_run_date
     WHERE id = t.id;

    template_id := t.id; expense_id := v_eid;
    tenant_id := t.tenant_id; amount := t.amount;
    RETURN NEXT;
  END LOOP;
END;
$$;
