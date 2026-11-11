-- AI chat: the read functions behind three more GST questions
-- ============================================================================
--
-- gst_itc_month, gst_net_month and gst_by_rate. New functions only; nothing
-- existing changes, so no overload is created. Same rules as
-- 20261104_ai_chat_read_functions.sql: no tenant argument, ai_owner_tenant()
-- first, RLS plus an explicit tenant_id filter, SECURITY INVOKER and STABLE,
-- soft-deleted rows left out, REVOKE from PUBLIC and anon.
--
-- No money logic is restated or changed. GSTR-3B, get_pl_ranged and
-- sale_gst_amount are untouched; sale_gst_amount is called as it is.
--
--   ai_gst_input     GST on purchases. The books store NO GST on a purchase:
--                    purchases has no tax column and no lines. The Purchase
--                    Register (PurchaseRegisterReport.jsx) therefore backs GST
--                    out of each bill total at 18% (p.tax_rate ?? 18, and that
--                    column does not exist). This copies the register row by
--                    row so the card equals its "Tax (ITC candidate)" figure,
--                    and the card says plainly that the 18% is assumed.
--                    It also returns what the GSTR-3B screen counts as input
--                    credit (suppliers with a valid GSTIN only), for a footnote.
--   ai_gst_by_rate   Sales by stored GST rate, from sale_items, with the GST
--                    sale_gst_amount puts on each line. A line whose rate was
--                    never set (sale_items.tax_rate NULL, or stored as 0 while
--                    the bill's own line in sales.items carries no taxRate) is
--                    its own row and is never read as 18%.
--   ai_gst_home_state  The first two characters of the shop's GSTIN, which is
--                    all the register uses to tell IGST from CGST and SGST.
--                    Kept apart so no read function names the GSTIN column.

-- ── helper ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_gst_home_state()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  -- String(businessProfile.gst_no || '').slice(0, 2), as the register reads it.
  SELECT COALESCE((SELECT left(COALESCE(bp.gst_no, ''), 2)
                     FROM public.business_profile bp
                    WHERE bp.tenant_id = public.ai_owner_tenant() AND bp.deleted_at IS NULL
                    LIMIT 1), '')
$fn$;

-- ── gst_itc_month (and the purchase side of gst_net_month) ─────────────────
CREATE OR REPLACE FUNCTION public.ai_gst_input(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_home   text := public.ai_gst_home_state();
  v        jsonb;
BEGIN
  WITH sup AS (
    SELECT s.id, s.gstin FROM public.suppliers s
     WHERE s.tenant_id = v_tenant AND s.deleted_at IS NULL
  ), p AS (
    -- The register's rows: live purchases, from <= date <= to compared as text
    -- exactly as its query does. No status filter, because it has none.
    SELECT COALESCE(p.total_amount, 0)::float8 AS gross,
           NULLIF(btrim(p.bill_no), '') IS NULL AS no_bill,
           sup.gstin
      FROM public.purchases p
      LEFT JOIN sup ON sup.id = p.supplier_id
     WHERE p.tenant_id = v_tenant AND p.deleted_at IS NULL
       AND p.date >= p_from::text AND p.date <= p_to::text
  ), r AS (
    -- In double precision, as the screen works it in JavaScript.
    SELECT gross, no_bill,
           gross / (1 + 18::float8 / 100) AS taxable,
           gross - gross / (1 + 18::float8 / 100) AS tax,
           -- sup.gstin ? its first 2 characters differ from the shop's : isInterstate(state, '') = false
           COALESCE(gstin, '') <> '' AND left(gstin, 2) <> v_home AS inter,
           -- hasValidGSTIN, which GSTR-3B uses to decide what is creditable.
           COALESCE(upper(regexp_replace(btrim(gstin), '\s', '', 'g'))
                    ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$', false) AS valid_gstin
      FROM p
  ), x AS (
    -- round2(x) = Math.round(x * 100) / 100, per row and per column.
    SELECT r.*,
           floor(gross * 100 + 0.5) / 100   AS gross2,
           floor(taxable * 100 + 0.5) / 100 AS taxable2,
           CASE WHEN inter THEN 0 ELSE floor(tax / 2 * 100 + 0.5) / 100 END AS cgst,
           CASE WHEN inter THEN 0 ELSE floor(tax / 2 * 100 + 0.5) / 100 END AS sgst,
           CASE WHEN inter THEN floor(tax * 100 + 0.5) / 100 ELSE 0 END     AS igst
      FROM r
  ), y AS (
    SELECT x.*, cgst + sgst + igst AS gst, (no_bill OR NOT valid_gstin) AS doubt FROM x
  )
  SELECT jsonb_build_object(
    'period_from', p_from, 'period_to', p_to, 'as_of', now(),
    'assumed_rate', 18,
    'bill_count', COUNT(*),
    'invoice_value', ROUND(COALESCE(SUM(gross2), 0)::numeric, 2),
    'taxable_value', ROUND(COALESCE(SUM(taxable2), 0)::numeric, 2),
    'cgst', ROUND(COALESCE(SUM(cgst), 0)::numeric, 2),
    'sgst', ROUND(COALESCE(SUM(sgst), 0)::numeric, 2),
    'igst', ROUND(COALESCE(SUM(igst), 0)::numeric, 2),
    'input_gst', ROUND((COALESCE(SUM(cgst), 0) + COALESCE(SUM(sgst), 0) + COALESCE(SUM(igst), 0))::numeric, 2),
    'no_gstin_bills', COUNT(*) FILTER (WHERE NOT valid_gstin),
    'no_gstin_gst', ROUND(COALESCE(SUM(gst) FILTER (WHERE NOT valid_gstin), 0)::numeric, 2),
    'no_bill_no_bills', COUNT(*) FILTER (WHERE no_bill),
    'no_bill_no_gst', ROUND(COALESCE(SUM(gst) FILTER (WHERE no_bill), 0)::numeric, 2),
    'in_doubt_bills', COUNT(*) FILTER (WHERE doubt),
    'in_doubt_gst', ROUND(COALESCE(SUM(gst) FILTER (WHERE doubt), 0)::numeric, 2),
    -- GSTR-3B 4(A): CGST and SGST are each tax/2 summed over valid-GSTIN bills,
    -- rounded once for the period (it never splits out IGST: purchases carry no
    -- supplier state). Its total is round2(central + state).
    'gstr3b_itc', ROUND((2 * floor(COALESCE(SUM(tax / 2) FILTER (WHERE valid_gstin), 0) * 100 + 0.5) / 100)::numeric, 2))
    INTO v
    FROM y;
  RETURN v;
END
$fn$;

-- ── gst_by_rate ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_gst_by_rate(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_mode   text;
  v        jsonb;
BEGIN
  SELECT upper(COALESCE(bp.tax_mode, 'EXCLUSIVE')) INTO v_mode
    FROM public.business_profile bp WHERE bp.tenant_id = v_tenant AND bp.deleted_at IS NULL LIMIT 1;
  v_mode := COALESCE(v_mode, 'EXCLUSIVE');

  WITH s AS (
    -- The sales get_pl_ranged counts, on the same dates.
    SELECT s.id, s."totalAmount" AS total, s.items,
           public.sale_gst_amount(s.id, v_mode, s."totalAmount") AS books_gst
      FROM public.sales s
     WHERE s.tenant_id = v_tenant AND s.deleted_at IS NULL
       AND public.ai_countable(s.voided_at, s.status, s."paymentStatus")
       AND s.date::date BETWEEN p_from AND p_to
  ), l AS (
    SELECT si.sale_id, si.line_total,
           si.tax_rate IS NULL
             OR (si.tax_rate = 0 AND jsonb_typeof(s.items) = 'array'
                 AND s.items -> (si.line_no - 1) IS NOT NULL
                 AND COALESCE(s.items -> (si.line_no - 1) ->> 'taxRate',
                              s.items -> (si.line_no - 1) ->> 'tax_rate') IS NULL) AS not_set,
           trim_scale(si.tax_rate) AS rate,
           -- sale_gst_amount's own line expression, before it rounds per bill.
           CASE WHEN v_mode = 'NONE' THEN 0
                WHEN COALESCE(si.tax_rate, 0) > 0 THEN
                  CASE WHEN v_mode = 'INCLUSIVE' THEN si.line_total - si.line_total / (1 + (si.tax_rate / 100.0))
                       ELSE si.line_total * (si.tax_rate / 100.0) END
                ELSE 0 END AS gst
      FROM s
      JOIN public.sale_items si ON si.sale_id = s.id AND si.tenant_id = v_tenant AND si.deleted_at IS NULL
  ), raw AS (
    SELECT sale_id, ROUND(COALESCE(SUM(gst), 0), 2) AS g FROM l GROUP BY sale_id
  ), lk AS (
    -- A bill sale_gst_amount sets to 0 (GST below 0 or above the bill) adds no
    -- GST on any of its lines either, so the rows still add up to the books.
    SELECT l.*, CASE WHEN s.books_gst = 0 AND raw.g <> 0 THEN 0 ELSE l.gst END AS gst_eff
      FROM l JOIN raw ON raw.sale_id = l.sale_id JOIN s ON s.id = l.sale_id
  ), g AS (
    SELECT CASE WHEN not_set THEN NULL ELSE rate END AS rate, not_set,
           COUNT(*) AS lines, COUNT(DISTINCT sale_id) AS bills,
           SUM(CASE WHEN v_mode = 'INCLUSIVE' THEN line_total - gst_eff ELSE line_total END) AS taxable,
           SUM(gst_eff) AS gst
      FROM lk GROUP BY 1, 2
  ), shown AS (
    SELECT * FROM g ORDER BY not_set, rate LIMIT 20
  )
  SELECT jsonb_build_object(
    'period_from', p_from, 'period_to', p_to, 'as_of', now(), 'tax_mode', v_mode,
    'bill_count', (SELECT COUNT(*) FROM s),
    'line_count', (SELECT COUNT(*) FROM l),
    'sales_gst', (SELECT ROUND(COALESCE(SUM(books_gst), 0), 2) FROM s),
    'rates', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                 'rate', r.rate, 'rate_not_set', r.not_set, 'lines', r.lines, 'bills', r.bills,
                 'taxable', ROUND(r.taxable, 2), 'gst', ROUND(r.gst, 2)) ORDER BY r.not_set, r.rate)
               FROM shown r), '[]'::jsonb),
    'rows_gst', (SELECT ROUND(COALESCE(SUM(ROUND(gst, 2)), 0), 2) FROM g),
    'not_set_lines', (SELECT COALESCE(SUM(lines), 0) FROM g WHERE not_set),
    'not_set_bills', (SELECT COUNT(DISTINCT sale_id) FROM lk WHERE not_set),
    'not_set_taxable', (SELECT ROUND(COALESCE(SUM(taxable), 0), 2) FROM g WHERE not_set),
    -- Bills with no stored lines: the books put no GST on them at all.
    'no_lines_bills', (SELECT COUNT(*) FROM s WHERE NOT EXISTS (SELECT 1 FROM l WHERE l.sale_id = s.id)),
    'no_lines_value', (SELECT ROUND(COALESCE(SUM(total), 0), 2) FROM s WHERE NOT EXISTS (SELECT 1 FROM l WHERE l.sale_id = s.id)))
    INTO v;
  RETURN v;
END
$fn$;

DO $g$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['ai_gst_home_state()', 'ai_gst_input(date,date)', 'ai_gst_by_rate(date,date)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $g$;
