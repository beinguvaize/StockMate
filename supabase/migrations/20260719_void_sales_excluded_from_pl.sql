-- APPLIED 2026-07-19 (Supabase migration `void_sales_excluded_from_pl`).
-- Verified after apply: FUTURE DISPO FY-to-date net −₹22,069.36 → −₹22,087.38,
-- June −₹15,699.29 → −₹15,717.31, Demo Kirana unchanged, report revenue and
-- revenue_net both ₹5,51,446.04 (tie-out gap ₹0.00) — matching the pre-apply
-- simulation exactly. Revert = re-apply the previous function bodies; no data
-- was mutated by this migration.
--
-- Voided sales were still counted in the P&L.
--
-- void_sale marks a void in three places — voided_at, void_reason and
-- paymentStatus='VOIDED' — but never sets the `status` column. get_pl_ranged
-- filtered voids on `status` alone:
--
--     AND upper(COALESCE(s.status,'')) NOT IN ('VOIDED','CANCELLED')
--
-- so the predicate never matched and every voided sale kept its revenue and
-- COGS in the books. void_sale restores the stock and reverses the client's
-- balance, so inventory and the P&L disagreed by design. Every report already
-- excluded these rows (isCountableSale in reportUtils.js checks all three
-- markers), which is why the Business Report's P&L tie-out shows a permanent
-- discrepancy against the RPC.
--
-- Two changes, both narrow:
--   1. get_pl_ranged — void predicate widened to match isCountableSale.
--   2. void_sale     — also stamps status, so both columns agree from now on.
--
-- Measured effect at time of writing (whole database, all tenants):
--   1 sale — FUTURE DISPO SAL-788BA30A, 2026-06-01
--   revenue −₹180.00, COGS −₹161.98, net profit −₹18.02
--   FY-to-date net profit: −₹22,069.36 → −₹22,087.38
--   Business Report revenue then equals revenue_net exactly (₹5,51,446.04),
--   so the tie-out reconciles.
--
-- Signature is unchanged, so CREATE OR REPLACE rebinds every caller. Do NOT
-- alter the argument list: that would create a second overload and callers
-- would start failing with "function is not unique".

BEGIN;

CREATE OR REPLACE FUNCTION public.get_pl_ranged(p_tenant_id uuid, p_from date, p_to date)
 RETURNS TABLE(revenue_net numeric, output_gst numeric, cogs numeric, returns_total numeric, expenses numeric, gross_profit numeric, net_profit numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_tax_mode text;
BEGIN
  IF p_tenant_id <> public.current_tenant_id() AND NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  SELECT COALESCE(tax_mode,'EXCLUSIVE') INTO v_tax_mode
    FROM public.business_profile WHERE tenant_id = p_tenant_id;

  RETURN QUERY
  WITH sale_gst AS (
    SELECT sr.id, sr.gross, sr.ic,
      COALESCE(SUM(
        -- tax_mode 'NONE' = non-remitting / unregistered: count gross both
        -- sides, so force the GST component to 0 (revenue + COGS fall through
        -- to full amounts via the de-GST formulas below).
        CASE WHEN upper(COALESCE(v_tax_mode,'EXCLUSIVE')) = 'NONE' THEN 0
             WHEN COALESCE((li->>'taxRate')::numeric,0) > 0 THEN
          CASE WHEN upper(COALESCE(v_tax_mode,'EXCLUSIVE')) = 'INCLUSIVE'
            THEN (li->>'rate')::numeric*(li->>'quantity')::numeric
                 - ((li->>'rate')::numeric*(li->>'quantity')::numeric)/(1+(li->>'taxRate')::numeric/100)
            ELSE (li->>'rate')::numeric*(li->>'quantity')::numeric*(li->>'taxRate')::numeric/100
          END
        ELSE 0 END), 0) AS ig
    FROM (
      SELECT s.id, s."totalAmount" AS gross, COALESCE(s."totalCogs",0) AS ic, s.items
      FROM public.sales s
      WHERE s.tenant_id = p_tenant_id AND s.deleted_at IS NULL
        -- A void is recorded across three columns depending on the code path
        -- that wrote it; honour all of them. Mirrors isCountableSale() in
        -- src/components/reports/reportUtils.js.
        AND s.voided_at IS NULL
        AND upper(COALESCE(s.status,''))          NOT IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED')
        AND upper(COALESCE(s."paymentStatus",'')) NOT IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED')
        AND s.date::date BETWEEN p_from AND p_to
    ) sr
    LEFT JOIN LATERAL jsonb_array_elements(COALESCE(sr.items,'[]'::jsonb)) li ON true
    GROUP BY sr.id, sr.gross, sr.ic
  ),
  agg AS (
    SELECT COALESCE(SUM(gross),0) AS rev_gross,
           COALESCE(SUM(ig),0)    AS tgst,
           COALESCE(SUM(CASE WHEN gross > 0 THEN ic * (gross - ig) / gross ELSE ic END),0) AS tcogs
    FROM sale_gst
  ),
  ret AS (
    SELECT COALESCE(SUM(rg.gross),0) AS tret_gross,
           COALESCE(SUM(rg.rgst),0)  AS tret_gst,
           COALESCE(SUM(CASE WHEN rg.gross > 0 THEN rg.rcogs * (rg.gross - rg.rgst) / rg.gross ELSE rg.rcogs END),0) AS tret_cogs
    FROM (
      SELECT r.id, r.total_amount AS gross,
        COALESCE(SUM(
          CASE WHEN upper(COALESCE(v_tax_mode,'EXCLUSIVE')) = 'NONE' THEN 0
               WHEN COALESCE(p."taxRate",0) > 0 THEN
            CASE WHEN upper(COALESCE(v_tax_mode,'EXCLUSIVE')) = 'INCLUSIVE'
              THEN (li->>'rate')::numeric*(li->>'quantity')::numeric
                   - ((li->>'rate')::numeric*(li->>'quantity')::numeric)/(1+p."taxRate"/100)
              ELSE (li->>'rate')::numeric*(li->>'quantity')::numeric*p."taxRate"/100
            END
          ELSE 0 END), 0) AS rgst,
        COALESCE(SUM((li->>'quantity')::numeric * COALESCE(p."costPrice",0)), 0) AS rcogs
      FROM public.sales_returns r
      LEFT JOIN LATERAL jsonb_array_elements(COALESCE(r.items,'[]'::jsonb)) li ON true
      LEFT JOIN public.products p ON p.id = (li->>'id') AND p.tenant_id = p_tenant_id
      WHERE r.tenant_id = p_tenant_id AND r.date::date BETWEEN p_from AND p_to
      GROUP BY r.id, r.total_amount
    ) rg
  ),
  exp AS (
    SELECT COALESCE(SUM(amount),0) AS texp
    FROM public.expenses
    WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
      AND COALESCE(exclude_from_pl, false) = false
      AND date::date BETWEEN p_from AND p_to
  )
  SELECT
    ROUND(a.rev_gross - a.tgst - (r.tret_gross - r.tret_gst), 2),
    ROUND(a.tgst - r.tret_gst, 2),
    ROUND(a.tcogs - r.tret_cogs, 2),
    ROUND(r.tret_gross, 2),
    ROUND(e.texp, 2),
    ROUND((a.rev_gross - a.tgst - (r.tret_gross - r.tret_gst)) - (a.tcogs - r.tret_cogs), 2),
    ROUND((a.rev_gross - a.tgst - (r.tret_gross - r.tret_gst)) - (a.tcogs - r.tret_cogs) - e.texp, 2)
  FROM agg a, ret r, exp e;
END;
$function$;

-- Keep the two status columns in agreement going forward. Existing rows are
-- left alone: the widened predicate above already excludes them, so a
-- backfill would change nothing and is not worth writing to live data.
CREATE OR REPLACE FUNCTION public.void_sale(p_id text, p_reason text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_sale RECORD; v_consumption RECORD; item RECORD; v_location UUID;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale % not found', p_id; END IF;
  IF v_sale.voided_at IS NOT NULL THEN RETURN; END IF;

  SELECT id INTO v_location FROM public.inventory_locations
   WHERE tenant_id = v_sale.tenant_id AND type = 'WAREHOUSE'
   ORDER BY created_at ASC NULLS LAST LIMIT 1;

  FOR v_consumption IN SELECT * FROM public.sale_batch_consumption WHERE sale_id = p_id LOOP
    UPDATE public.product_batches
       SET qty_remaining = qty_remaining + v_consumption.qty_taken, updated_at = NOW()
     WHERE id = v_consumption.batch_id;
  END LOOP;
  DELETE FROM public.sale_batch_consumption WHERE sale_id = p_id;

  FOR item IN SELECT (x->>'id') AS pid, COALESCE((x->>'quantity')::numeric, 0) AS qty, (x->>'name') AS name
              FROM jsonb_array_elements(v_sale.items) AS x LOOP
    IF v_location IS NOT NULL THEN
      UPDATE public.inventory_balances SET quantity = quantity + item.qty, updated_at = NOW()
       WHERE location_id = v_location AND product_id = item.pid AND tenant_id = v_sale.tenant_id;
    END IF;
    UPDATE public.products SET stock = COALESCE(stock, 0) + item.qty
     WHERE id = item.pid AND tenant_id = v_sale.tenant_id;
    INSERT INTO public.movement_log (id, date, product_id, product_name, type, quantity, reason, user_id, tenant_id)
    VALUES (gen_random_uuid()::text, to_char(NOW(), 'YYYY-MM-DD'), item.pid, item.name, 'IN', item.qty,
            'Void sale: ' || p_id || COALESCE(' (' || p_reason || ')', ''),
            COALESCE(p_user_id::text, v_sale."bookedBy"), v_sale.tenant_id);
  END LOOP;

  IF UPPER(COALESCE(v_sale."paymentMethod",'')) = 'CREDIT' AND v_sale."shopId" IS NOT NULL THEN
    UPDATE public.clients
       SET outstanding_balance = GREATEST(0, COALESCE(outstanding_balance,0) - COALESCE(v_sale."totalAmount",0))
     WHERE id = v_sale."shopId" AND tenant_id = v_sale.tenant_id;
  END IF;

  UPDATE public.sales
     SET voided_at = NOW(),
         void_reason = p_reason,
         "paymentStatus" = 'VOIDED',
         status = 'VOIDED'   -- was omitted; get_pl_ranged used to filter on this alone
   WHERE id = p_id;
END;
$function$;

COMMIT;
