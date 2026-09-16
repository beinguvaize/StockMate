-- DATA REPAIR. Applied once. Snapshot: snap.company_cash_opening_20260801.
--
-- The ask was to back-post the ~Rs 3,81,000 of purchases made before the cash
-- ledger existed. That would have been wrong, and this records why.
--
-- account_transactions begins 30 June. Before that NOTHING was posted — not the
-- 77 purchases (Rs 4,98,834) and not the 296 sales (Rs 3,83,438). Posting only
-- the outgoings would have driven Company Cash to about minus Rs 2,94,300: a
-- deficit invented entirely by recording five lakh leaving while four lakh
-- arriving stayed unrecorded. "Incomplete" would have become "confidently
-- wrong", which is worse because it looks authoritative.
--
-- The real defect was the opening balance: 0, for an account that inherited a
-- drawer with money already in it.
--
-- The figure is derived from the shop's own physical count rather than guessed:
--
--   counted in the drawer, 7 Jul      88,390.45
--   ledger movement to that date      35,321.45
--   implied opening                   53,069.00
--
-- Corroborated independently by the DayBook, which the calculation never
-- touched: the last physical count before the ledger starts was 65,747.45 on
-- 25 Jun, and the computed close on 26 Jun was 48,477.45. The derived opening
-- sits between them, which two unrelated sources would not do by chance.
--
-- Verified after: the account balance on 7 Jul is exactly 88,390.45, matching
-- the count to the paisa.
--
-- History before 30 June remains unposted, deliberately. Reconstructing it means
-- posting BOTH sides for May and June and needs the shop's May opening cash;
-- until someone wants a ledger that far back, the account is correct from 30
-- June onward, which is what the balance is actually used for.

UPDATE public.accounts
   SET opening_balance = 53069.00
 WHERE tenant_id = 'fd4927bf-c084-4bed-ba13-d30e650da6f3'
   AND name = 'Company Cash';
