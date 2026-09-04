-- products.stock had two writers and they fought.
--
-- It is a derived mirror of inventory_balances, maintained by
-- trg_sync_product_stock. But nine other functions ALSO did their own
-- arithmetic on it, and in most of them that write lands AFTER the balance
-- update — so the manual value overwrote the trigger's correct one and the
-- same units were counted twice.
--
-- Reproduced on Demo: selling 3 units moved balances 171 -> 168 correctly while
-- products.stock went 170 -> 165. Three units of drift per sale, and
-- GREATEST(0, ...) meant a value clamped at zero could never recover. That is
-- why 47 products had drifted by 339 units, every one UNDER-reporting.
--
-- Ordering evidence (character offset of the products write vs the balances
-- write in each body — later means it wins):
--   process_sale          3700 after 3283
--   edit_sale             2399 after 1522
--   void_sale             1184 after  996
--   dispatch_sale         1150 after  737
--   unvoid_sale           1298 after  840
--   reverse_sales_return   532 after  345
--   process_purchase_return 824 BEFORE 1006  (trigger corrected it; removed anyway)
--
-- The manual statements are removed rather than reordered: reordering would
-- leave two writers and the same bug one refactor away.
--
-- Applied by rewriting each function from pg_get_functiondef with the offending
-- statement replaced, so signatures, volatility and security settings are
-- preserved exactly and no overload can be created by accident.
--
-- Verified after: a sale of 3 and a return of 2 both leave products.stock and
-- inventory_balances in agreement, drift 0.

DO $mig$
DECLARE r record; v_new text; v_left int;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('process_sale','void_sale','edit_sale','dispatch_sale',
                        'reverse_sales_return','unvoid_sale','process_purchase_return')
      AND p.prosrc ~* 'UPDATE\s+public\.products\s+SET\s+stock'
  LOOP
    v_new := regexp_replace(pg_get_functiondef(r.oid),
      'UPDATE\s+public\.products\s+SET\s+stock\s*=[^;]{0,220};',
      '-- products.stock is derived from inventory_balances by trg_sync_product_stock;'
      || ' a second writer here double-counted the movement.',
      'gi');
    EXECUTE v_new;
  END LOOP;

  SELECT count(*) INTO v_left FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('process_sale','void_sale','edit_sale','dispatch_sale',
                       'reverse_sales_return','unvoid_sale','process_purchase_return')
     AND p.prosrc ~* 'UPDATE\s+public\.products\s+SET\s+stock';
  IF v_left > 0 THEN
    RAISE EXCEPTION 'Expected no remaining products.stock writers, found %', v_left;
  END IF;
END $mig$;

-- process_sales_return was worse than a double-write: it touched products.stock
-- and NOTHING else. Returned goods never reached inventory_balances, so the
-- stock reappeared on screen and was silently erased the next time anything
-- changed a balance for that product. It now moves real stock through
-- adjust_inventory_atomic, which updates the balance, writes movement_log, and
-- (p_consume_batches => true on a positive amount) gives the returned units a
-- cost batch priced from the last real purchase instead of leaving them
-- uncosted.
CREATE OR REPLACE FUNCTION public.process_sales_return(
  p_id text, p_tenant_id uuid, p_sale_id text, p_invoice_id text,
  p_client_id text, p_client_name text, p_items jsonb,
  p_total_amount numeric, p_reason text, p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_item JSONB;
BEGIN
  INSERT INTO public.sales_returns (
    id, tenant_id, sale_id, invoice_id, client_id, client_name,
    items, total_amount, reason, date
  ) VALUES (
    p_id, p_tenant_id, p_sale_id, p_invoice_id, p_client_id, p_client_name,
    p_items, p_total_amount, p_reason, p_date
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    PERFORM public.adjust_inventory_atomic(
      (v_item->>'id')::TEXT,
      NULL,
      (v_item->>'quantity')::NUMERIC,
      'Sales return: ' || COALESCE(p_sale_id, p_id),
      'system',
      p_tenant_id,
      NULL,
      p_id,
      'SALES_RETURN',
      true,   -- real inventory correction: keep the batch books in step
      NULL    -- no price given, so cost resolves from the last purchase
    );
  END LOOP;

  IF p_client_id IS NOT NULL AND p_client_id <> '' THEN
    UPDATE public.clients
    SET outstanding_balance = GREATEST(0, COALESCE(outstanding_balance, 0) - p_total_amount)
    WHERE id = p_client_id
      AND tenant_id = p_tenant_id;
  END IF;
END;
$function$;

-- apply_product_stock_delta existed only to add a delta to products.stock and
-- touched nothing else. Nothing calls it — no database function, and no
-- reference in the web, mobile or desktop code. Made a no-op rather than
-- dropped, so a caller appearing later fails safe instead of erroring, and the
-- reason sits where someone would look for it.
CREATE OR REPLACE FUNCTION public.apply_product_stock_delta(
  p_product_id text, p_delta numeric, p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Deliberately does nothing. Stock is moved by changing an inventory_balances
  -- row, never by nudging the derived mirror. Anything that needs to move stock
  -- should call adjust_inventory_atomic.
  RETURN;
END;
$function$;
