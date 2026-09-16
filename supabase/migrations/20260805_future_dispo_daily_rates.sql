-- FUTURE DISPO's three staff are all pay_type = DAILY with daily_rate = 0, so
-- the attendance grid computed a 0 wage for every present day. Their real pay
-- was sitting in employees.salary, which DAILY employees never read -- Akbar
-- only showed a wage at all because a per-day rate had been typed into one
-- attendance cell by hand.
--
-- Divisor is 26 working days (standard Indian practice, excluding weekly offs),
-- chosen by the owner. It is not derivable from the data: 23,200/26 = 892.31 but
-- the 800 typed for Akbar is 23,200/29, and 13,500/27 = 500 exactly -- three
-- different divisors, so this had to be a decision, not an inference.
--
-- Parthipan is deliberately left at 0: salary is also 0, so there is nothing to
-- derive from and inventing a rate would put money against a real person's name.
--
-- salary is left untouched. It stays the record of the agreed monthly figure.

UPDATE public.employees
   SET daily_rate = ROUND(salary / 26.0, 2),
       updated_at = now()
 WHERE tenant_id = 'fd4927bf-c084-4bed-ba13-d30e650da6f3'
   AND deleted_at IS NULL
   AND pay_type = 'DAILY'
   AND COALESCE(daily_rate, 0) = 0
   AND COALESCE(salary, 0) > 0;

DO $chk$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.employees
  WHERE tenant_id = 'fd4927bf-c084-4bed-ba13-d30e650da6f3'
    AND deleted_at IS NULL
    AND pay_type = 'DAILY'
    AND COALESCE(salary, 0) > 0
    AND COALESCE(daily_rate, 0) = 0;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '% salaried DAILY employees still have no rate', v_bad;
  END IF;
END $chk$;
