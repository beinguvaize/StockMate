-- AI chat: ai_gst_screen_check returns bill_count
-- ============================================================================
--
-- The card states the measured gaps only when they are plausible for the number
-- of bills: rounding is at most a couple of paise per bill. Bigger gaps mean the
-- screen and the books disagree for another reason (on dev, sales.items lines
-- with no taxRate, which the screen reads as 18%), and the card then says so
-- plainly instead of naming a cause it cannot vouch for.
-- Same signature, so no overload.

CREATE OR REPLACE FUNCTION public.ai_gst_screen_check(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_mode   text;
  v_line_tax float8; v_line_taxable float8;
  v_bills  numeric;  v_books_gst numeric;  v_count int;
BEGIN
  SELECT COALESCE(bp.tax_mode, 'EXCLUSIVE') INTO v_mode
    FROM public.business_profile bp WHERE bp.tenant_id = v_tenant AND bp.deleted_at IS NULL LIMIT 1;

  WITH s AS (
    SELECT s.id, s."totalAmount" AS total, s.items
      FROM public.sales s
     WHERE s.tenant_id = v_tenant AND s.deleted_at IS NULL
       AND public.ai_countable(s.voided_at, s.status, s."paymentStatus")
       AND s.date::date BETWEEN p_from AND p_to
  ), l AS (
    -- The screen's reading of sales.items (gstReporting.buildTaxLinesFromSale),
    -- in double precision because the screen does its sums in JavaScript.
    SELECT s.id,
           COALESCE(NULLIF(COALESCE(it->>'qty', it->>'quantity'), '')::float8, 1)                    AS q,
           COALESCE(NULLIF(COALESCE(it->>'rate', it->>'sellingPrice', it->>'price'), '')::float8, 0) AS r,
           COALESCE(NULLIF(it->>'discount', '')::float8, 0)                                          AS d,
           COALESCE(NULLIF(COALESCE(it->>'taxRate', it->>'tax_rate'), '')::float8, 18)               AS t
      FROM s CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.items) = 'array' THEN s.items ELSE '[]'::jsonb END) it
  ), per AS (
    -- CGST and SGST each rounded per tax rate on each bill, as round2 does.
    SELECT floor(SUM((q * r - d) * t / 100 / 2) * 100 + 0.5) / 100 AS half, SUM(q * r - d) AS taxable
      FROM l GROUP BY id, t
  )
  SELECT (SELECT COALESCE(SUM(half), 0) * 2 FROM per),
         (SELECT COALESCE(SUM(taxable), 0) FROM per),
         (SELECT COALESCE(SUM(total), 0) FROM s),
         (SELECT COALESCE(SUM(public.sale_gst_amount(s.id, COALESCE(v_mode, 'EXCLUSIVE'), s.total)), 0) FROM s),
         (SELECT COUNT(*) FROM s)
    INTO v_line_tax, v_line_taxable, v_bills, v_books_gst, v_count;

  RETURN jsonb_build_object(
    'period_from', p_from, 'period_to', p_to, 'as_of', now(),
    'screen_gst', ROUND(v_line_tax::numeric, 2),
    'books_gst', ROUND(v_books_gst, 2),
    'line_taxable', ROUND(v_line_taxable::numeric, 2),
    'bill_rounding', ROUND(v_bills - v_line_taxable::numeric - v_books_gst, 2),
    'bill_count', v_count);
END
$fn$;

REVOKE ALL ON FUNCTION public.ai_gst_screen_check(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_gst_screen_check(date, date) TO authenticated;
