-- Applied to prod 23 Aug 2026.
--
-- Audit question: when a part-paid sale is edited and more payment is added,
-- does the extra reach Cash & Bank? It does — trg_sales_post_ledger fires on
-- UPDATE, deletes the stale entry and reposts the full new paidAmount, so the
-- net movement equals the extra. Verified against 268 August sales.
--
-- Three things around it were wrong.
--
-- 1. A TENANT WITH NO ACCOUNTS RECORDED NOTHING, SILENTLY.
--    post_sale_to_ledger ended on `IF v_acc IS NULL THEN RETURN NEW` — no row,
--    no error, no log. MaazMobiles has 0 accounts, so 48 sales worth 49,890
--    never reached a ledger and nothing said so. Raising would block the sale,
--    which is the wrong trade at a till, so it now provisions the account the
--    shop always needed and posts to it. Only if that also fails does it raise.
--
-- 2. ONE SALE WAS DOUBLE-POSTED.
--    SAL-SYTTEV (FUTURE DISPO, 3 Jul) had two identical 1,925 rows 74s apart,
--    both from the insert path — the window when the client and this trigger
--    were both posting. Company Cash was overstated by 1,925. The duplicate is
--    removed and a partial unique index now makes one entry per sale a rule
--    rather than a hope. The UPDATE branch deletes before reposting, so a
--    legitimate repost still fits.
--
-- 3. A NULL p_paid_amount WIPED A RECORDED PART PAYMENT.
--    edit_sale set paidAmount := 0 whenever p_paid_amount was NULL and the
--    status was not PAID, and the trigger then deleted the ledger entry to
--    match. The web form always sends a number so it was never reachable
--    there, but mobile and offline replay call the same RPC. NULL now means
--    "leave the payment alone", which is what omitting the argument means.
--    The signature is deliberately unchanged — altering it would create a
--    second overload and every caller would fail on "function is not unique".
--
-- Verified by transaction-rolled-back tests on prod:
--   partial 400 -> posted 400, 1 row
--   edit to 700 -> posted 700, 1 row, note "POS sale (edited)"
--   NULL edit   -> paid stays 700, status PARTIAL, posted 700
--   no accounts -> account auto-created (Cash/CASH/default), 500 posted IN
--
-- NOT backfilled: FUTURE DISPO has 195 sales (189,295) before 2 Jul, when the
-- trigger went live, with no ledger entry — the same situation as the 27
-- unbackfilled purchase bills. MaazMobiles' 48 missing entries are also left
-- alone. Both are the user's call.
-- Definitions below are dumped from prod after the migration was applied.
-- The full CREATE OR REPLACE bodies for post_sale_to_ledger and edit_sale are
-- long and are recorded verbatim in Supabase's own migration history under
-- `sale_ledger_no_silent_skip_and_preserve_paid`. This file is the record of
-- WHY, plus the two decisive hunks and the constraint. It is not a standalone
-- replay — pull the current definitions with pg_get_functiondef if you need
-- to re-apply from scratch.

-- ── the duplicate, and the rule that stops the next one ──────────────────
DELETE FROM account_transactions a
WHERE a.ref_type = 'SALE'
  AND EXISTS (
    SELECT 1 FROM account_transactions b
     WHERE b.ref_type = 'SALE'
       AND b.ref_id    = a.ref_id
       AND b.tenant_id = a.tenant_id
       AND b.created_at < a.created_at
  );

CREATE UNIQUE INDEX IF NOT EXISTS uniq_account_txn_per_sale
  ON account_transactions (tenant_id, ref_id)
  WHERE ref_type = 'SALE';

-- ── hunk 1, in post_sale_to_ledger: no silent skip ───────────────────────
-- was:  IF v_acc IS NULL THEN RETURN NEW; END IF;
-- now:
--   IF v_acc IS NULL THEN
--     SELECT NOT EXISTS (SELECT 1 FROM accounts
--                         WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL)
--       INTO v_first;
--     v_new_id := 'ACC-' || UPPER(substr(md5(NEW.tenant_id::text || v_want), 1, 10));
--     INSERT INTO accounts (id, tenant_id, name, type, opening_balance, is_default, created_at)
--     VALUES (v_new_id, NEW.tenant_id,
--             CASE v_want WHEN 'CASH' THEN 'Cash' WHEN 'UPI' THEN 'UPI' ELSE 'Bank' END,
--             v_want, 0, COALESCE(v_first, false), NOW())
--     ON CONFLICT (id) DO NOTHING;
--     SELECT * INTO v_acc FROM accounts WHERE id = v_new_id AND tenant_id = NEW.tenant_id;
--     IF v_acc IS NULL THEN
--       RAISE EXCEPTION 'post_sale_to_ledger: no account for tenant % and could not create one (%)',
--         NEW.tenant_id, v_want;
--     END IF;
--   END IF;

-- ── hunk 2, in edit_sale: NULL preserves the payment ─────────────────────
-- was:  v_paid := CASE WHEN v_status = 'PAID' THEN v_total_rounded ELSE 0 END;
-- now:
--   IF v_status = 'PAID' THEN
--     v_paid := v_total_rounded;
--   ELSE
--     v_paid := LEAST(GREATEST(0, COALESCE(v_sale."paidAmount", 0)), v_total_rounded);
--     IF v_paid >= v_total_rounded AND v_total_rounded > 0 THEN v_status := 'PAID';
--     ELSIF v_paid > 0 THEN v_status := 'PARTIAL';
--     END IF;
--   END IF;
