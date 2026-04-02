-- 🚀 LEDGR ERP: SEEDING PHASE 4 - HIGH-FIDELITY TRANSACTIONS & ANALYTICS
-- -----------------------------------------------------------
-- Objective: Populate Invoices, Payments, and COGS to achieve 100% Dashboard & Reporting fidelity.

-- 1. Create Invoices for all existing Sales
-- This links every Sale to an Invoice for the billing dashboard.
INSERT INTO public.invoices (
  id, 
  invoice_number, 
  date, 
  invoice_date, 
  client_id, 
  client_name, 
  sale_id, 
  amount, 
  taxable_amount, 
  tax_total, 
  grand_total, 
  payment_status, 
  status, 
  due_date, 
  cgst_amount, 
  sgst_amount, 
  is_seed
)
SELECT 
  'inv_' || id,
  'INV-2026-' || LPAD((ROW_NUMBER() OVER (ORDER BY date))::text, 4, '0'),
  CAST(date AS TIMESTAMPTZ),
  date,
  "shopId",
  'Seed Customer ' || LPAD((ROW_NUMBER() OVER (ORDER BY date))::text, 2, '0'),
  id,
  "totalAmount",
  ROUND("totalAmount" / 1.18, 2),
  ROUND("totalAmount" - ("totalAmount" / 1.18), 2),
  "totalAmount",
  CASE WHEN "paymentStatus" = 'PAID' THEN 'PAID' ELSE 'UNPAID' END,
  'FINALIZED',
  CAST(date AS TIMESTAMPTZ) + INTERVAL '15 days',
  ROUND(("totalAmount" - ("totalAmount" / 1.18)) / 2, 2),
  ROUND(("totalAmount" - ("totalAmount" / 1.18)) / 2, 2),
  TRUE
FROM public.sales
WHERE is_seed = TRUE
ON CONFLICT (id) DO NOTHING;

-- 2. Seed Client Payments (Partial & Full)
-- Demonstrates liquidity and collection tracking.
INSERT INTO public.client_payments (id, client_id, amount, date, notes)
SELECT 
  'pay_' || sub.id,
  sub.client_id,
  CASE WHEN sub.row_num % 3 = 0 THEN sub.amount * 0.5 ELSE sub.amount END,
  sub.invoice_date,
  'Repayment for Invoice ' || sub.invoice_number
FROM (
  SELECT id, client_id, amount, invoice_date, invoice_number,
         ROW_NUMBER() OVER () as row_num
  FROM public.invoices
  WHERE is_seed = TRUE
) sub
WHERE sub.row_num % 2 = 0
ON CONFLICT (id) DO NOTHING;

-- 3. Update Sales COGS (Cost of Goods Sold)
-- Calculated as 70% of total amount to simulate 30% margin.
UPDATE public.sales 
SET "totalCogs" = ROUND("totalAmount" * 0.7, 2)
WHERE is_seed = TRUE;

-- 4. Standardize Expense Categories for Operational Quadrant Chart
-- Mapping to categories used in Reports.jsx (e.g. Marketing, Rent, Logistics)
WITH numbered_expenses AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY id)) % 4 as mod_val
  FROM public.expenses
  WHERE is_seed = TRUE
)
UPDATE public.expenses
SET category = CASE 
  WHEN n.mod_val = 0 THEN 'Logistics'
  WHEN n.mod_val = 1 THEN 'Marketing'
  WHEN n.mod_val = 2 THEN 'Rent'
  ELSE 'Inventory'
END
FROM numbered_expenses n
WHERE public.expenses.id = n.id;

-- 5. Standardize Employee Departments for Workforce Distribution
WITH numbered_employees AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY id)) % 3 as mod_val
  FROM public.employees
  WHERE is_seed = TRUE
)
UPDATE public.employees
SET department = CASE 
  WHEN n.mod_val = 0 THEN 'Operations'
  WHEN n.mod_val = 1 THEN 'Sales'
  ELSE 'Administration'
END
FROM numbered_employees n
WHERE public.employees.id = n.id;

-- 6. Seed Supplemental Purchases for Inventory Turnover
INSERT INTO public.purchases (id, product_id, quantity, total_amount, date, supplier_name, payment_type, notes)
VALUES 
('seeder_pur_hist_1', 'seeder_prod_1', 100, 45000, '2026-03-01T10:00:00Z', 'Main Supplier Corp', 'credit', 'Historical Bulk Restock'),
('seeder_pur_hist_2', 'seeder_prod_2', 50, 30000, '2026-03-05T14:30:00Z', 'Tech Distribution Ltd', 'cash', 'Urgent Restock'),
('seeder_pur_hist_3', 'seeder_prod_3', 200, 15000, '2026-03-10T09:15:00Z', 'Basic Supplies Co', 'credit', 'Monthly Subscription')
ON CONFLICT (id) DO NOTHING;
