-- offset_supplier_credit_note records an offset as a supplier_payments row so
-- the bill's paid_amount rises, but the CHECK on payment_method only allowed
-- CASH / BANK / UPI / CHEQUE / OTHER.
--
-- Widening it rather than reusing OTHER, because the one thing that matters
-- about an offset is that no money moved. A row marked OTHER tells a future
-- reader nothing; CREDIT_NOTE says exactly what happened, and lets any report
-- separate real cash paid to a supplier from value returned to them.
--
-- Widening a CHECK cannot invalidate existing rows: every row already satisfies
-- the narrower set.

ALTER TABLE public.supplier_payments
  DROP CONSTRAINT IF EXISTS supplier_payments_payment_method_check;

ALTER TABLE public.supplier_payments
  ADD CONSTRAINT supplier_payments_payment_method_check
  CHECK (payment_method = ANY (ARRAY[
    'CASH'::text, 'BANK'::text, 'UPI'::text, 'CHEQUE'::text,
    'OTHER'::text, 'CREDIT_NOTE'::text
  ]));
