-- Payroll, Batch 10 of the phone redesign (owner-approved 23-26 Nov 2026).
--
-- Three things, all additive:
--
-- 1. SICK as its own attendance mark. It was either Leave or nothing. Paid for
--    salaried staff, unpaid for day-rate staff, and counted apart from Leave
--    (src/lib/payRun.js holds the rule).
--
-- 2. employees.paid_leave_per_month: how many paid leave days a salaried
--    employee is allowed in a month. It only drives a count and a warning; it
--    never changes pay. 0 means no allowance is set.
--
--    "On leave" as an employee status needs no change here: employees.status
--    has no check constraint.
--
-- 3. process_payroll_run: saves a run and its salary expenses in ONE
--    transaction.
--
--    The web saved the run, then inserted the expenses as a second request. If
--    the second failed, a payroll record stood with nothing in DayBook, the
--    P&L or the cash account, and the page could only apologise. The phone
--    would have had to repeat that dance. Now both call this.
--
--    It is safe to send twice: a run id that already exists returns that run
--    and inserts nothing, and each expense id is derived from the run and the
--    employee. So a retry after a dropped connection, or a queued call
--    replayed by the phone, cannot pay anyone twice.
--
--    SECURITY INVOKER on purpose: it writes as the caller, so the same RLS
--    and plan gates that guard a direct insert guard this. The expenses post
--    to the ledger through the existing trg_expenses_post_ledger; no ledger
--    logic lives here and no trigger is added, so the shop-restore guard is
--    untouched.

ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check
  CHECK (status = ANY (ARRAY['PRESENT'::text, 'ABSENT'::text, 'HALF_DAY'::text, 'LEAVE'::text, 'SICK'::text]));

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS paid_leave_per_month integer NOT NULL DEFAULT 0;
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_paid_leave_per_month_check;
ALTER TABLE public.employees ADD CONSTRAINT employees_paid_leave_per_month_check
  CHECK (paid_leave_per_month >= 0 AND paid_leave_per_month <= 31);

CREATE OR REPLACE FUNCTION public.process_payroll_run(
  p_tenant_id      uuid,
  p_run_id         text,
  p_period         text,
  p_payment_method text,
  p_items          jsonb,
  p_processed_at   text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_existing  public.payroll%ROWTYPE;
  v_method    text := upper(coalesce(nullif(trim(p_payment_method), ''), 'CASH'));
  v_pay_date  text;
  v_item      jsonb;
  v_net       numeric;
  v_expenses  integer := 0;
BEGIN
  IF p_tenant_id IS NULL OR coalesce(trim(p_run_id), '') = '' THEN
    RAISE EXCEPTION 'A pay run needs a shop and a run id.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A pay run needs at least one person in it.' USING ERRCODE = '22023';
  END IF;
  IF v_method NOT IN ('CASH', 'UPI', 'BANK', 'CARD') THEN
    RAISE EXCEPTION 'Unknown way of paying: %', p_payment_method USING ERRCODE = '22023';
  END IF;

  -- The pay date is the last day the run covers. The period is 'YYYY-MM' for
  -- a month or 'YYYY-MM-DD/YYYY-MM-DD' for any other window.
  IF p_period ~ '^\d{4}-\d{2}-\d{2}/\d{4}-\d{2}-\d{2}$' THEN
    v_pay_date := greatest(split_part(p_period, '/', 1), split_part(p_period, '/', 2));
    PERFORM v_pay_date::date, split_part(p_period, '/', 1)::date;
  ELSIF p_period ~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    v_pay_date := to_char((to_date(p_period || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date, 'YYYY-MM-DD');
  ELSE
    RAISE EXCEPTION 'Cannot read the pay period "%".', p_period USING ERRCODE = '22023';
  END IF;

  -- Sent before? Hand back what is already saved and write nothing.
  SELECT * INTO v_existing FROM public.payroll WHERE id = p_run_id;
  IF FOUND THEN
    IF v_existing.tenant_id IS DISTINCT FROM p_tenant_id THEN
      RAISE EXCEPTION 'That run id belongs to another shop.' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('run', to_jsonb(v_existing), 'expenses', 0, 'replayed', true);
  END IF;

  INSERT INTO public.payroll (
    id, tenant_id, period, items,
    total_base, total_net, total_overtime, total_commission, total_bonus, total_deductions,
    processed_at
  )
  SELECT
    p_run_id, p_tenant_id, p_period, p_items,
    coalesce(sum((i->>'basePay')::numeric), 0),
    coalesce(sum((i->>'netPay')::numeric), 0),
    coalesce(sum((i->>'overtime')::numeric), 0),
    coalesce(sum((i->>'commission')::numeric), 0),
    coalesce(sum((i->>'bonus')::numeric), 0),
    coalesce(sum((i->>'deductions')::numeric), 0),
    coalesce(p_processed_at, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  FROM jsonb_array_elements(p_items) AS i
  RETURNING * INTO v_existing;

  -- One salary expense per person paid. This is what puts the payout in
  -- DayBook and the P&L, and on the Cash / UPI / Bank account.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_net := coalesce((v_item->>'netPay')::numeric, 0);
    IF v_net < 0 THEN
      RAISE EXCEPTION 'Net pay cannot be negative (%).', v_item->>'employeeName' USING ERRCODE = '22023';
    END IF;
    CONTINUE WHEN v_net = 0;
    IF coalesce(v_item->>'employeeId', '') = '' THEN
      RAISE EXCEPTION 'A pay line has no employee.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.expenses (id, tenant_id, category, amount, note, date, payment_method, payroll_id)
    VALUES (
      'PAY-' || p_run_id || '-' || (v_item->>'employeeId'),
      p_tenant_id, 'Salary', v_net,
      'Payroll ' || p_period || ' — ' || coalesce(v_item->>'employeeName', ''),
      v_pay_date, v_method, p_run_id
    );
    v_expenses := v_expenses + 1;
  END LOOP;

  RETURN jsonb_build_object('run', to_jsonb(v_existing), 'expenses', v_expenses, 'replayed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.process_payroll_run(uuid, text, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_payroll_run(uuid, text, text, text, jsonb, text) TO authenticated;
