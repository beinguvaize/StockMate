-- A tenant id in the arguments is not a permission
-- ============================================================================
--
-- Fifty-three SECURITY DEFINER functions take p_tenant_id. Thirty-seven of them
-- never check that the caller belongs to the tenant they were handed, and most
-- of those are executable by `anon`. SECURITY DEFINER means they run as the
-- owner, so RLS does not save them either: the argument IS the authorisation,
-- and the argument comes from whoever is calling.
--
-- Concretely, before this migration, a request holding nothing but the public
-- anon key could call
--
--     delete_client_payment(<some tenant's uuid>, <a receipt id>)
--
-- and reverse a receipt in a shop it has never heard of -- re-pooling that
-- customer's payments, rewriting paid amounts on their sales and invoices, and
-- moving the ledger. Payment ids are short text (`SUPP-1A2B3C4D`), and tenant
-- ids appear in any page URL the tenant's own staff share.
--
-- The house pattern already exists -- sixteen functions carry it, including
-- settle_client_payment:
--
--     IF p_tenant_id <> public.current_tenant_id()
--        AND NOT public.is_global_admin() THEN
--       RAISE EXCEPTION 'Access denied';
--     END IF;
--
-- This migration does two things and deliberately stops there:
--
--   1. Adds that exact guard to the four money functions that edit or reverse a
--      payment. These are the ones that move somebody else's money with two
--      guessable arguments, and they are small enough to change without
--      restating a page of arithmetic.
--
--   2. Takes EXECUTE away from `anon` on every SECURITY DEFINER function that
--      takes a p_tenant_id, and from `authenticated` as well on the eighteen
--      that no client ever calls. No bodies are touched. This is what closes
--      the unauthenticated path, and it closes it for all of them, including
--      the fourteen still missing a guard.
--
-- Revoking `anon` is safe: every REST call from the web app sends a real user
-- token (restHeaders throws SESSION_EXPIRED rather than fall back to the anon
-- key), the mobile and desktop clients call through a signed-in session, and
-- the edge functions use the service role, which keeps EXECUTE throughout.
--
-- Internal helpers stay callable from inside the functions that use them: a
-- SECURITY DEFINER function executes as its owner, which is not `authenticated`
-- and is unaffected by these revokes.
--
-- STILL UNGUARDED after this, and wanting their own migration -- every one is
-- called by a client, so a guard is a body change to live money code and is not
-- something to bundle into a security fix at midnight:
--
--   process_sale, edit_sale, process_purchase, edit_purchase_bill,
--   process_purchase_return, process_sales_return, reverse_sales_return,
--   settle_supplier_payment, settle_purchase_payment, adjust_inventory_atomic,
--   offset_supplier_credit_note, reconcile_vehicle_route, set_invoice_delivery,
--   record_platform_error
--
-- They are no longer reachable without a session, which is the difference
-- between "anyone on the internet" and "a signed-in customer who goes looking".
-- That is a real reduction and not a complete one.

BEGIN;

-- ── 1. The guard, on the four that move money with two arguments ────────────
--
-- Bodies below are the deployed ones, unchanged except for the guard at the
-- top. Signatures are byte-identical to what is live: changing one would create
-- a second overload and every caller would break with PGRST203.

CREATE OR REPLACE FUNCTION public.edit_client_payment(
  p_tenant_id uuid,
  p_payment_id text,
  p_amount numeric,
  p_method text DEFAULT NULL::text,
  p_date date DEFAULT NULL::date,
  p_notes text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client text;
  v_pool   numeric;
  v_take   numeric;
  r        record;
BEGIN
  IF p_tenant_id <> public.current_tenant_id() AND NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  SELECT client_id INTO v_client
  FROM public.client_payments
  WHERE tenant_id = p_tenant_id AND id = p_payment_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_client IS NULL THEN
    RAISE EXCEPTION 'Receipt % not found, or already deleted', p_payment_id;
  END IF;

  UPDATE public.client_payments
     SET amount         = p_amount,
         payment_method = COALESCE(p_method, payment_method),
         date           = COALESCE(p_date::text, date),
         notes          = COALESCE(p_notes, notes),
         updated_at     = now()
   WHERE id = p_payment_id AND tenant_id = p_tenant_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_pool
  FROM public.client_payments
  WHERE tenant_id = p_tenant_id AND client_id = v_client AND deleted_at IS NULL;

  FOR r IN
    SELECT id, COALESCE("totalAmount", 0) AS total
    FROM public.sales
    WHERE tenant_id = p_tenant_id
      AND "shopId"::text = v_client::text
      AND UPPER(COALESCE("paymentMethod", '')) = 'CREDIT'
      AND deleted_at IS NULL
    ORDER BY date ASC, created_at ASC
  LOOP
    v_take := LEAST(GREATEST(v_pool, 0), r.total);

    UPDATE public.sales
       SET "paidAmount"    = v_take,
           "paymentStatus" = CASE WHEN v_take >= r.total AND r.total > 0 THEN 'PAID'
                                  WHEN v_take > 0 THEN 'PARTIAL'
                                  ELSE 'UNPAID' END,
           updated_at      = now()
     WHERE id = r.id AND tenant_id = p_tenant_id;

    UPDATE public.invoices
       SET paid_amount    = v_take,
           payment_status = CASE WHEN v_take >= r.total AND r.total > 0 THEN 'PAID'
                                 WHEN v_take > 0 THEN 'PARTIAL'
                                 ELSE 'UNPAID' END
     WHERE sale_id = r.id AND tenant_id = p_tenant_id;

    v_pool := v_pool - v_take;
  END LOOP;

  PERFORM public._recalc_outstanding_for_client(p_tenant_id, v_client);

  RETURN p_amount;
END $function$;

CREATE OR REPLACE FUNCTION public.delete_client_payment(
  p_tenant_id uuid,
  p_payment_id text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_amount numeric;
  v_client text;
  v_pool   numeric;
  v_take   numeric;
  r        record;
BEGIN
  IF p_tenant_id <> public.current_tenant_id() AND NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT amount, client_id INTO v_amount, v_client
  FROM public.client_payments
  WHERE id = p_payment_id AND tenant_id = p_tenant_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'Receipt % not found, or already deleted', p_payment_id;
  END IF;

  UPDATE public.client_payments
     SET deleted_at = now()
   WHERE id = p_payment_id AND tenant_id = p_tenant_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_pool
  FROM public.client_payments
  WHERE tenant_id = p_tenant_id AND client_id = v_client AND deleted_at IS NULL;

  FOR r IN
    SELECT id, COALESCE("totalAmount", 0) AS total
    FROM public.sales
    WHERE tenant_id = p_tenant_id
      AND "shopId"::text = v_client::text
      AND UPPER(COALESCE("paymentMethod", '')) = 'CREDIT'
      AND deleted_at IS NULL
    ORDER BY date ASC, created_at ASC
  LOOP
    v_take := LEAST(GREATEST(v_pool, 0), r.total);

    UPDATE public.sales
       SET "paidAmount"    = v_take,
           "paymentStatus" = CASE WHEN v_take >= r.total AND r.total > 0 THEN 'PAID'
                                  WHEN v_take > 0 THEN 'PARTIAL'
                                  ELSE 'UNPAID' END,
           updated_at      = now()
     WHERE id = r.id AND tenant_id = p_tenant_id;

    UPDATE public.invoices
       SET paid_amount    = v_take,
           payment_status = CASE WHEN v_take >= r.total AND r.total > 0 THEN 'PAID'
                                 WHEN v_take > 0 THEN 'PARTIAL'
                                 ELSE 'UNPAID' END
     WHERE sale_id = r.id AND tenant_id = p_tenant_id;

    v_pool := v_pool - v_take;
  END LOOP;

  PERFORM public._recalc_outstanding_for_client(p_tenant_id, v_client);

  RETURN v_amount;
END $function$;

CREATE OR REPLACE FUNCTION public.delete_supplier_payment(
  p_tenant_id uuid,
  p_payment_id text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_root  text;
  v_total numeric := 0;
  r       record;
BEGIN
  IF p_tenant_id <> public.current_tenant_id() AND NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Root of whatever slice was handed in: strip -APPn, then a trailing -N.
  v_root := regexp_replace(regexp_replace(p_payment_id, '-APP[0-9]+$', ''), '-[0-9]+$', '');

  FOR r IN
    SELECT id, amount, supplier_id, purchase_id
    FROM public.supplier_payments
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL
      AND (id = v_root OR id LIKE v_root || '-%')
    FOR UPDATE
  LOOP
    UPDATE public.supplier_payments SET deleted_at = now()
     WHERE id = r.id AND tenant_id = p_tenant_id;

    IF r.purchase_id IS NOT NULL THEN
      UPDATE public.purchases
         SET paid_amount = GREATEST(0, COALESCE(paid_amount, 0) - r.amount),
             updated_at  = now()
       WHERE id = r.purchase_id AND tenant_id = p_tenant_id;
    END IF;

    UPDATE public.suppliers
       SET balance = COALESCE(balance, 0) + r.amount, updated_at = now()
     WHERE id = r.supplier_id AND tenant_id = p_tenant_id;

    v_total := v_total + r.amount;
  END LOOP;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Payment % not found, or already deleted', p_payment_id;
  END IF;

  RETURN v_total;
END $function$;

CREATE OR REPLACE FUNCTION public.edit_supplier_payment(
  p_tenant_id uuid,
  p_payment_id text,
  p_amount numeric,
  p_method text DEFAULT NULL::text,
  p_date date DEFAULT NULL::date,
  p_reference_no text DEFAULT NULL::text,
  p_note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_supplier text;
  v_method   text;
  v_date     date;
  v_new_id   text;
BEGIN
  IF p_tenant_id <> public.current_tenant_id() AND NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- Read the original before it goes, so unchanged fields carry over.
  SELECT supplier_id, payment_method, date
    INTO v_supplier, v_method, v_date
  FROM public.supplier_payments
  WHERE tenant_id = p_tenant_id AND id = p_payment_id AND deleted_at IS NULL;

  IF v_supplier IS NULL THEN
    RAISE EXCEPTION 'Payment % not found, or already deleted', p_payment_id;
  END IF;

  PERFORM public.delete_supplier_payment(p_tenant_id, p_payment_id);

  -- New id: the edit is a different handover from the one just reversed, and
  -- reusing the old id would collide with the soft-deleted rows.
  v_new_id := 'SUPP-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  PERFORM public.settle_supplier_payment(
    v_new_id, p_tenant_id, v_supplier, p_amount,
    COALESCE(p_method, v_method), COALESCE(p_date, v_date),
    p_reference_no, p_note);

  RETURN v_new_id;
END $function$;

-- ── 2. Nothing with a p_tenant_id is reachable without a session ────────────
--
-- Generated rather than listed, so a function added later with the same shape
-- is covered the next time this is run, and so the list cannot drift out of
-- date in a comment.

DO $do$
DECLARE
  r record;
  -- The eighteen no client ever calls. They are reached only from inside other
  -- SECURITY DEFINER functions and from triggers, both of which run as the
  -- owner, so taking EXECUTE from `authenticated` costs them nothing.
  internal text[] := ARRAY[
    '_fifo_replay_client_payments', '_recalc_outstanding_for_client',
    'apply_client_balance_delta', 'apply_product_stock_delta',
    'apply_supplier_advances', 'audit_sale_items', 'audit_sale_ledger',
    'consume_fifo', 'create_staff_account', 'next_invoice_number',
    'recompute_client_outstanding', 'recompute_product_cost',
    'recost_purchase_batches', 'record_van_damage', 'resolve_adjustment_cost',
    'restore_fifo', 'write_sale_lines', 'write_sales_return_lines'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND pg_get_function_identity_arguments(p.oid) ILIKE '%p_tenant_id%'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    IF r.proname = ANY (internal) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.sig);
    ELSE
      -- Explicit rather than inherited from PUBLIC, so the grant survives the
      -- revoke above and says out loud who is meant to call this.
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END
$do$;

COMMIT;
