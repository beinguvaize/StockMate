-- Expense improvement #1: track how each expense was paid (cash drawer
-- vs bank vs UPI vs card). Lets the dashboard attribute expenses to the
-- right balance and supports later cash-flow reporting. Defaults to CASH
-- so existing rows + offline inserts that omit it stay valid.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'CASH';
