-- DATA REPAIR. Applied once. Snapshot: snap.purchase_paid_backfill_20260801
-- (90-day retention, holds every id with its original paid_amount).
--
-- process_purchase never set paid_amount, so a bill settled at the counter was
-- recorded as unpaid for ever. 20260731_cash_purchase_marks_bill_paid stops new
-- ones; this corrects the 123 already on the books.
--
--   FUTURE DISPO INDUSTRIES  113 bills  Rs 6,23,410.76
--   MaazMobiles fansy         10 bills  Rs     4,585.00
--
-- Scope is deliberately narrow:
--   * non-CREDIT payment types only — a credit bill genuinely is unpaid until
--     settled, and its balance is tracked on the supplier
--   * paid_amount = 0 only — a partially paid bill would be a real part-payment
--     and must not be overwritten. There were none, checked before running.
--
-- Result, FUTURE DISPO: everything still owed now sits on a CREDIT bill, which
-- is the only place a genuine payable can be.
--
--   Payable  Rs 6,68,470.76 -> Rs 45,060.00   (18 CREDIT bills)
--
-- Not corrected here, and still open: purchases before 3 Jul posted no
-- account_transactions row at all, so the cash account is understated by
-- roughly Rs 3,81,000. Whether to back-post depends on whether the opening
-- balance was already struck net of them — only the shop knows, and guessing
-- would double-count.

UPDATE public.purchases
   SET paid_amount = total_amount
 WHERE deleted_at IS NULL
   AND UPPER(COALESCE(payment_type,'')) NOT IN ('CREDIT','UDHAAR','POST-CAPITAL')
   AND COALESCE(paid_amount,0) = 0;
