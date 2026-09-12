-- Applied to prod 18 Aug 2026 (project lmviftlynuhopzmvaxeu).
--
-- A payslip needs an employee number. `employees` held only a uuid, which means
-- nothing to the person holding the paper and is the wrong thing to print on a
-- document that leaves the office.
--
-- Codes are per tenant and sequential: EMP-001, EMP-002. Backfilled in NAME
-- order rather than creation order because created_at is NULL on every existing
-- employee row -- there is no creation order to honour, and name order is what
-- the employee list already sorts by, so the numbers match what people see.
--
-- Assigned by trigger so every writer gets one -- web, mobile, offline replay --
-- rather than each client inventing its own scheme. The next number is read out
-- of the highest existing CODE rather than counted from the rows, so deleting an
-- employee cannot make the next hire reuse a code that already appears on
-- someone's payslip. Verified on Demo: new hire gets the next code, an explicit
-- code is respected, and a code is not reused after a delete.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_code text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_code_per_tenant
  ON employees (tenant_id, employee_code)
  WHERE employee_code IS NOT NULL AND deleted_at IS NULL;

WITH numbered AS (
  SELECT id, 'EMP-' || lpad(
           row_number() OVER (PARTITION BY tenant_id ORDER BY name, id)::text, 3, '0') AS code
  FROM employees
  WHERE deleted_at IS NULL AND employee_code IS NULL
)
UPDATE employees e SET employee_code = n.code
FROM numbered n WHERE e.id = n.id;

CREATE OR REPLACE FUNCTION assign_employee_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next int;
BEGIN
  IF NEW.employee_code IS NOT NULL AND NEW.employee_code <> '' THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(max(nullif(regexp_replace(employee_code, '\D', '', 'g'), '')::int), 0) + 1
    INTO v_next
    FROM employees
   WHERE tenant_id = NEW.tenant_id AND employee_code IS NOT NULL;

  NEW.employee_code := 'EMP-' || lpad(v_next::text, 3, '0');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_employees_assign_code ON employees;
CREATE TRIGGER trg_employees_assign_code
BEFORE INSERT ON employees
FOR EACH ROW EXECUTE FUNCTION assign_employee_code();
