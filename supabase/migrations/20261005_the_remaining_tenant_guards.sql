-- The remaining tenant guards
-- ============================================================================
--
-- 20261002 gave four payment functions the guard sixteen others already had,
-- and took EXECUTE from `anon` everywhere, which closed the unauthenticated
-- path. Fourteen client-called functions were left: each one is reachable by a
-- signed-in user of ANY tenant, passing someone else's tenant id.
--
--   process_sale          edit_sale              process_purchase
--   edit_purchase_bill    process_purchase_return process_sales_return
--   reverse_sales_return  settle_supplier_payment settle_purchase_payment
--   adjust_inventory_atomic  offset_supplier_credit_note
--   reconcile_vehicle_route  set_invoice_delivery  record_platform_error
--
-- They were left because adding a guard means rewriting a function body, and
-- these are 47KB of live money code.
--
-- WHY THIS INJECTS RATHER THAN RESTATING THE BODIES
--
-- Production and dev have drifted: dev has neither process_purchase nor
-- edit_purchase_bill, and prod has functions dev never got. A migration
-- carrying one database's bodies would overwrite the other's with a version it
-- has never run. So this reads each function's OWN definition on whatever
-- database it is applied to, inserts the guard, and puts it back. Nothing else
-- about the body changes, and the two databases stay as different as they
-- already are.
--
-- It is deliberately loud. A function that is missing is skipped and reported;
-- a function whose shape it cannot recognise raises and takes the whole
-- migration down, rather than quietly leaving a hole that a later audit would
-- report as closed.

BEGIN;

DO $do$
DECLARE
  r          record;
  v_def      text;
  v_pos      int;
  v_guard    text := E'\n  IF p_tenant_id <> public.current_tenant_id() AND NOT public.is_global_admin() THEN\n    RAISE EXCEPTION ''Access denied'';\n  END IF;\n';
  v_done     int := 0;
  v_skipped  int := 0;
  v_missing  text[] := '{}';
  targets    text[] := ARRAY[
    'process_sale', 'edit_sale', 'process_purchase', 'edit_purchase_bill',
    'process_purchase_return', 'process_sales_return', 'reverse_sales_return',
    'settle_supplier_payment', 'settle_purchase_payment', 'adjust_inventory_atomic',
    'offset_supplier_credit_note', 'reconcile_vehicle_route', 'set_invoice_delivery',
    'record_platform_error'
  ];
  t          text;
BEGIN
  FOREACH t IN ARRAY targets LOOP
    FOR r IN
      SELECT p.oid, p.proname, p.prosrc
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = t AND p.prosecdef
        AND pg_get_function_identity_arguments(p.oid) ILIKE '%p_tenant_id%'
    LOOP
      -- Already carries it (or a hand-written equivalent): leave it alone.
      IF r.prosrc ILIKE '%current_tenant_id%' THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      v_def := pg_get_functiondef(r.oid);

      -- The body opens at the first line that is nothing but BEGIN. Anchoring
      -- on the whole line keeps a BEGIN inside a comment, a string or an
      -- identifier from being mistaken for it, and the match is
      -- case-insensitive because these functions were not written by one hand:
      -- settle_supplier_payment opens with a lowercase `begin`, which a
      -- case-sensitive marker missed. It raised rather than guessing, which is
      -- how this was found.
      v_pos := regexp_instr(v_def, '^[ \t]*begin[ \t]*$', 1, 1, 1, 'im');

      IF v_pos = 0 THEN
        RAISE EXCEPTION
          'Could not find the body opening of %. Refusing to guess -- guard it by hand.', r.proname;
      END IF;

      v_def := substr(v_def, 1, v_pos - 1) || v_guard || substr(v_def, v_pos);

      EXECUTE v_def;
      v_done := v_done + 1;
      RAISE NOTICE 'guarded %', r.proname;
    END LOOP;

    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = t
    ) THEN
      v_missing := v_missing || t;
    END IF;
  END LOOP;

  RAISE NOTICE 'guarded %, already guarded %, absent here: %',
    v_done, v_skipped, COALESCE(array_to_string(v_missing, ', '), 'none');
END
$do$;

-- Prove it. If any target that EXISTS on this database is still unguarded, the
-- migration fails rather than reporting success over a hole.
DO $check$
DECLARE
  v_open text[];
BEGIN
  SELECT ARRAY_AGG(p.proname ORDER BY p.proname) INTO v_open
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND pg_get_function_identity_arguments(p.oid) ILIKE '%p_tenant_id%'
    AND p.prosrc NOT ILIKE '%current_tenant_id%'
    AND p.proname = ANY (ARRAY[
      'process_sale', 'edit_sale', 'process_purchase', 'edit_purchase_bill',
      'process_purchase_return', 'process_sales_return', 'reverse_sales_return',
      'settle_supplier_payment', 'settle_purchase_payment', 'adjust_inventory_atomic',
      'offset_supplier_credit_note', 'reconcile_vehicle_route', 'set_invoice_delivery',
      'record_platform_error']);

  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'Still unguarded after the migration: %', array_to_string(v_open, ', ');
  END IF;
END
$check$;

COMMIT;
