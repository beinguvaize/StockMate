-- AI chat: the Staff category (payroll and attendance)
-- ============================================================================
--
--   payroll_month     ai_staff_pay(p_from, p_to, p_limit)
--   salary_due        ai_staff_pay(p_from, p_to, p_limit)
--   attendance_today  ai_staff_attendance_day(p_day, p_limit)
--   attendance_month  ai_staff_attendance_month(p_from, p_to, p_limit)
--
-- The rules of 20261104_ai_chat_read_functions.sql: no tenant argument,
-- ai_owner_tenant() first, SECURITY INVOKER and STABLE, an explicit tenant_id
-- filter as well as RLS, deleted_at IS NULL, lists capped while totals cover
-- every row. New functions only, so no overload. Nothing here writes, and no
-- payroll or money logic is changed: these only re-read what Payroll shows.
--
-- Every figure is the Payroll screen's own, by the rules of src/pages/Payroll.jsx
-- and src/lib/payrollPeriods.js:
--
--   * The staff on the Attendance tab are employees with deleted_at IS NULL and
--     status exactly 'ACTIVE'. Daily-wage staff are pay_type DAILY or HOURLY
--     (any case; HOURLY is paid as DAILY); everyone else is monthly salary.
--   * A day's weight: PRESENT 1, OT 1, HALF_DAY 0.5, anything else 0. The
--     "Days" column is the sum of weights for the month.
--   * A day's wage is weight x the day's custom_rate, or the employee's
--     daily_rate when the day has none (0 when neither is set). The wage on
--     screen is that sum rounded to the rupee, per employee.
--   * "Paid this month" is every live pay run whose period ENDS in the month
--     (paidByEmployeeInMonth), item netPay > 0, keyed by the item's employeeId,
--     rounded to the rupee per employee. A period is 'YYYY-MM' (the whole
--     month) or 'YYYY-MM-DD/YYYY-MM-DD' (either order); anything else is
--     skipped, as parsePeriod returns null for it.
--   * A row's "Still due" is max(0, wage - paid). The footer's "Still to pay
--     this month" is max(0, sum of wages - sum of paid), which is less than
--     the sum of the rows when someone was paid more than they earned. Both
--     come back, and the overpaid amount, so the card can say the gap.
--
-- Personal data: only an employee's id, name, pay type, status, daily_rate and
-- salary are read. Phone, email, address, bank account, PAN, Aadhaar, PF/UAN,
-- ESI number, date of birth and every other HR field are never selected. Only
-- the name leaves for display; ai-ask swaps it for [P1].. before the model.
--
-- attendance.custom_rate, payroll.period/items and expenses.payroll_id are read
-- through to_jsonb, so these also run on a database that predates them (dev).

-- A period's last day, or NULL when it is neither stored shape.
CREATE OR REPLACE FUNCTION public.ai_payroll_period_end(p_period text)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN btrim(p_period) ~ '^\d{4}-\d{2}-\d{2}/\d{4}-\d{2}-\d{2}$'
      THEN GREATEST(split_part(btrim(p_period), '/', 1)::date, split_part(btrim(p_period), '/', 2)::date)
    WHEN btrim(p_period) ~ '^\d{4}-(0[1-9]|1[0-2])$'
      THEN ((btrim(p_period) || '-01')::date + interval '1 month' - interval '1 day')::date
  END
$fn$;

-- A number from a jsonb text value, 0 when it is not one (Number() of junk is
-- NaN there, and NaN > 0 is false, so such an item never counts as paid).
CREATE OR REPLACE FUNCTION public.ai_jsonb_num(p text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT CASE WHEN btrim(p) ~ '^-?\d+(\.\d+)?$' THEN btrim(p)::numeric ELSE 0 END
$fn$;

-- ── payroll_month, salary_due ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_staff_pay(p_from date, p_to date, p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_out    jsonb;
BEGIN
  WITH staff AS (
    SELECT e.id, e.name,
           upper(COALESCE(e.pay_type, '')) IN ('DAILY', 'HOURLY') AS daily,
           COALESCE(e.daily_rate, 0) AS daily_rate,
           COALESCE(e.salary, 0) AS salary
      FROM public.employees e
     WHERE e.tenant_id = v_tenant AND e.deleted_at IS NULL AND e.status = 'ACTIVE'
  ), runs AS (
    SELECT p.id, to_jsonb(p) AS j
      FROM public.payroll p
     WHERE p.tenant_id = v_tenant AND p.deleted_at IS NULL
       AND public.ai_payroll_period_end(to_jsonb(p) ->> 'period') BETWEEN p_from AND p_to
  ), items AS (
    SELECT r.id AS run_id, i ->> 'employeeId' AS employee_id, public.ai_jsonb_num(i ->> 'netPay') AS net
      FROM runs r
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(r.j -> 'items') = 'array' THEN r.j -> 'items' ELSE '[]'::jsonb END) i
  ), paid AS (
    SELECT employee_id, SUM(net) AS amount, COUNT(DISTINCT run_id) AS runs
      FROM items WHERE net > 0 AND COALESCE(employee_id, '') <> '' GROUP BY 1
  ), wage AS (
    SELECT a.employee_id,
           SUM(CASE a.status WHEN 'PRESENT' THEN 1 WHEN 'OT' THEN 1 WHEN 'HALF_DAY' THEN 0.5 ELSE 0 END) AS days,
           SUM(CASE a.status WHEN 'PRESENT' THEN 1 WHEN 'OT' THEN 1 WHEN 'HALF_DAY' THEN 0.5 ELSE 0 END
               * COALESCE((to_jsonb(a) ->> 'custom_rate')::numeric, s.daily_rate)) AS amount
      FROM public.attendance a
      JOIN staff s ON s.id = a.employee_id AND s.daily
     WHERE a.tenant_id = v_tenant AND a.deleted_at IS NULL AND a.day BETWEEN p_from AND p_to
     GROUP BY 1
  ), per AS (
    SELECT s.id, s.name, s.daily, s.salary,
           COALESCE(w.days, 0) AS days,
           CASE WHEN s.daily THEN ROUND(COALESCE(w.amount, 0)) END AS earned,
           ROUND(COALESCE(pd.amount, 0)) AS paid,
           COALESCE(pd.runs, 0) AS runs
      FROM staff s
      LEFT JOIN wage w ON w.employee_id = s.id
      LEFT JOIN paid pd ON pd.employee_id = s.id
  ), rowed AS (
    SELECT per.*,
           CASE WHEN daily THEN GREATEST(earned - paid, 0) END AS due,
           CASE WHEN daily THEN GREATEST(paid - earned, 0) END AS over
      FROM per
  ), d AS (
    SELECT COUNT(*) AS n, COALESCE(SUM(earned), 0) AS earned, COALESCE(SUM(paid), 0) AS paid,
           COALESCE(SUM(due), 0) AS due_rows, COALESCE(SUM(over), 0) AS over,
           COUNT(*) FILTER (WHERE due > 0) AS n_due, COUNT(*) FILTER (WHERE over > 0) AS n_over
      FROM rowed WHERE daily
  ), m AS (
    SELECT COUNT(*) AS n, COALESCE(SUM(salary), 0) AS salary, COALESCE(SUM(paid), 0) AS paid,
           COUNT(*) FILTER (WHERE paid = 0) AS n_unpaid
      FROM rowed WHERE NOT daily
  ), t AS (
    SELECT COALESCE(SUM(net), 0) AS paid, COUNT(DISTINCT run_id) AS runs,
           COUNT(DISTINCT employee_id) AS people
      FROM items WHERE net > 0 AND COALESCE(employee_id, '') <> ''
  ), other AS (
    -- Paid in the month to someone the Attendance tab does not list: no longer
    -- active, deleted, or an item with no employee id.
    SELECT COALESCE(SUM(i.net), 0) AS paid, COUNT(DISTINCT i.employee_id) AS people
      FROM items i
     WHERE i.net > 0 AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = i.employee_id)
  ), xp AS (
    -- The salary expenses the runs posted: what the Expenses report and the
    -- P&L show for this pay. Dated at the period's end, as processPayroll does.
    SELECT COALESCE(SUM(ex.amount), 0) AS amount, COUNT(*) AS n
      FROM public.expenses ex
     WHERE ex.tenant_id = v_tenant AND ex.deleted_at IS NULL
       AND (to_jsonb(ex) ->> 'payroll_id') IS NOT NULL
       AND ex.date::date BETWEEN p_from AND p_to
  )
  SELECT jsonb_build_object(
    'period_from', p_from, 'period_to', p_to, 'as_of', now(),
    'daily_staff', d.n, 'daily_earned', d.earned, 'daily_paid', d.paid,
    'daily_due', GREATEST(d.earned - d.paid, 0),
    'due_total', d.due_rows, 'staff_due', d.n_due,
    'overpaid', d.over, 'staff_overpaid', d.n_over,
    'monthly_staff', m.n, 'monthly_salaries', m.salary, 'monthly_paid', m.paid, 'monthly_unpaid_staff', m.n_unpaid,
    'paid_total', ROUND(t.paid, 2), 'run_count', t.runs, 'paid_people', t.people,
    'other_paid', ROUND(other.paid, 2), 'other_people', other.people,
    'salary_expenses', ROUND(xp.amount, 2), 'salary_expense_count', xp.n,
    'staff_count', d.n + m.n,
    'staff', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'employee_id', x.id, 'name', x.name, 'pay_type', CASE WHEN x.daily THEN 'DAILY' ELSE 'MONTHLY' END,
               'days', x.days, 'earned', x.earned, 'salary', CASE WHEN x.daily THEN NULL ELSE x.salary END,
               'paid', x.paid, 'due', x.due)
             ORDER BY COALESCE(x.due, 0) DESC, COALESCE(x.earned, x.salary) DESC, x.name, x.id)
        FROM (SELECT * FROM rowed
               ORDER BY COALESCE(due, 0) DESC, COALESCE(earned, salary) DESC, name, id LIMIT v_limit) x), '[]'::jsonb),
    'due_staff', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('employee_id', x.id, 'name', x.name, 'days', x.days,
               'earned', x.earned, 'paid', x.paid, 'due', x.due)
             ORDER BY x.due DESC, x.name, x.id)
        FROM (SELECT * FROM rowed WHERE daily AND due > 0 ORDER BY due DESC, name, id LIMIT v_limit) x), '[]'::jsonb))
    INTO v_out
    FROM d, m, t, other, xp;
  RETURN v_out;
END
$fn$;

-- ── attendance_today ───────────────────────────────────────────────────────
-- Today's column of the Attendance grid: the daily-wage staff, each with the
-- day's mark or none. Marks on anyone the grid does not list are counted apart.
CREATE OR REPLACE FUNCTION public.ai_staff_attendance_day(p_day date, p_limit int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  v_out    jsonb;
BEGIN
  WITH staff AS (
    SELECT e.id, e.name
      FROM public.employees e
     WHERE e.tenant_id = v_tenant AND e.deleted_at IS NULL AND e.status = 'ACTIVE'
       AND upper(COALESCE(e.pay_type, '')) IN ('DAILY', 'HOURLY')
  ), marks AS (
    SELECT a.employee_id, a.status
      FROM public.attendance a
     WHERE a.tenant_id = v_tenant AND a.deleted_at IS NULL AND a.day = p_day
  ), per AS (
    SELECT s.id, s.name,
           CASE WHEN mk.status IN ('PRESENT', 'OT', 'HALF_DAY', 'ABSENT') THEN mk.status
                WHEN mk.status IS NULL THEN 'NOT_MARKED' ELSE 'OTHER' END AS status
      FROM staff s LEFT JOIN marks mk ON mk.employee_id = s.id
  ), away AS (
    SELECT * FROM per WHERE status IN ('ABSENT', 'HALF_DAY', 'NOT_MARKED', 'OTHER')
  )
  SELECT jsonb_build_object(
    'period_from', p_day, 'period_to', p_day, 'as_of', now(),
    'staff_count', (SELECT COUNT(*) FROM per),
    'present', (SELECT COUNT(*) FROM per WHERE status = 'PRESENT'),
    'overtime', (SELECT COUNT(*) FROM per WHERE status = 'OT'),
    'half_day', (SELECT COUNT(*) FROM per WHERE status = 'HALF_DAY'),
    'absent', (SELECT COUNT(*) FROM per WHERE status = 'ABSENT'),
    'not_marked', (SELECT COUNT(*) FROM per WHERE status = 'NOT_MARKED'),
    'other_mark', (SELECT COUNT(*) FROM per WHERE status = 'OTHER'),
    'marks_off_grid', (SELECT COUNT(*) FROM marks mk WHERE NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = mk.employee_id)),
    'away_count', (SELECT COUNT(*) FROM away),
    'staff', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('employee_id', x.id, 'name', x.name, 'status', x.status)
             ORDER BY x.o, x.name, x.id)
        FROM (SELECT away.*, CASE status WHEN 'ABSENT' THEN 1 WHEN 'HALF_DAY' THEN 2 WHEN 'OTHER' THEN 3 ELSE 4 END AS o
                FROM away ORDER BY o, name, id LIMIT v_limit) x), '[]'::jsonb))
    INTO v_out;
  RETURN v_out;
END
$fn$;

-- ── attendance_month ───────────────────────────────────────────────────────
-- The Attendance grid's month, per daily-wage employee: absent and half days,
-- and the Days column. missed_days = absent + half of each half day.
CREATE OR REPLACE FUNCTION public.ai_staff_attendance_month(p_from date, p_to date, p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_out    jsonb;
BEGIN
  WITH staff AS (
    SELECT e.id, e.name
      FROM public.employees e
     WHERE e.tenant_id = v_tenant AND e.deleted_at IS NULL AND e.status = 'ACTIVE'
       AND upper(COALESCE(e.pay_type, '')) IN ('DAILY', 'HOURLY')
  ), marks AS (
    SELECT a.employee_id, a.status
      FROM public.attendance a
     WHERE a.tenant_id = v_tenant AND a.deleted_at IS NULL AND a.day BETWEEN p_from AND p_to
  ), per AS (
    SELECT s.id, s.name,
           COUNT(mk.status) AS marked,
           COUNT(*) FILTER (WHERE mk.status = 'ABSENT') AS absent,
           COUNT(*) FILTER (WHERE mk.status = 'HALF_DAY') AS half_days,
           COALESCE(SUM(CASE mk.status WHEN 'PRESENT' THEN 1 WHEN 'OT' THEN 1 WHEN 'HALF_DAY' THEN 0.5 ELSE 0 END), 0) AS days
      FROM staff s LEFT JOIN marks mk ON mk.employee_id = s.id
     GROUP BY s.id, s.name
  ), ranked AS (
    SELECT per.*, absent + half_days * 0.5 AS missed FROM per
  )
  SELECT jsonb_build_object(
    'period_from', p_from, 'period_to', p_to, 'as_of', now(),
    'staff_count', (SELECT COUNT(*) FROM ranked),
    'marked_days', (SELECT COALESCE(SUM(marked), 0) FROM ranked),
    'absent_days', (SELECT COALESCE(SUM(absent), 0) FROM ranked),
    'half_days', (SELECT COALESCE(SUM(half_days), 0) FROM ranked),
    'missed_days', (SELECT COALESCE(SUM(missed), 0) FROM ranked),
    'staff_missed', (SELECT COUNT(*) FROM ranked WHERE missed > 0),
    'marks_off_grid', (SELECT COUNT(*) FROM marks mk WHERE NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = mk.employee_id)),
    'staff', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('employee_id', x.id, 'name', x.name, 'absent', x.absent,
               'half_days', x.half_days, 'missed_days', x.missed, 'days', x.days, 'marked', x.marked)
             ORDER BY x.missed DESC, x.days, x.name, x.id)
        FROM (SELECT * FROM ranked ORDER BY missed DESC, days, name, id LIMIT v_limit) x), '[]'::jsonb))
    INTO v_out;
  RETURN v_out;
END
$fn$;

REVOKE ALL ON FUNCTION public.ai_payroll_period_end(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_payroll_period_end(text) TO authenticated;
REVOKE ALL ON FUNCTION public.ai_jsonb_num(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_jsonb_num(text) TO authenticated;
REVOKE ALL ON FUNCTION public.ai_staff_pay(date, date, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_staff_pay(date, date, int) TO authenticated;
REVOKE ALL ON FUNCTION public.ai_staff_attendance_day(date, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_staff_attendance_day(date, int) TO authenticated;
REVOKE ALL ON FUNCTION public.ai_staff_attendance_month(date, date, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_staff_attendance_month(date, date, int) TO authenticated;
