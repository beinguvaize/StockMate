-- A credit note reverses the GST the customer was actually charged.
--
-- sales_return_gst_amount computed the GST to reverse from products."taxRate"
-- -- TODAY'S product master -- while sales_return_items.tax_rate, the rate
-- actually billed on that line, sat unused in the very same query.
--
-- gl_post_sales uses the line's own rate for sales. So a sale was billed at
-- the line rate and reversed at the master rate. Change a product's GST slab
-- -- a statutory revision, or simply a correction -- and every subsequent
-- return of an OLDER sale reverses an amount the invoice never charged. The
-- credit note stops matching the invoice it credits.
--
-- WHY THIS HID FOR SO LONG
--
-- Until PR #67 the rule was implemented TWICE, once in gl_post_sales_returns
-- and once in get_pl_ranged -- and both had this same bug, identically. The
-- ledger and the P&L agreed with each other perfectly while both were wrong,
-- so every equivalence check passed. De-duplicating them first is what made
-- this a one-line fix in one place instead of two edits that could be
-- half-applied into a divergence.
--
-- NOTHING IS RESTATED, AND THAT IS MEASURED, NOT ASSUMED
--
-- Every live return on production was evaluated under BOTH rules before
-- writing this. All 5 belong to FUTURE DISPO, which is in NONE tax mode, so
-- both rules return 0.00 and 0.00 is what is posted:
--
--   CRN-09DG1P  144.00   product-rate 0.00   billed-rate 0.00   posted 0
--   CRN-11GI19   34.00   product-rate 0.00   billed-rate 0.00   posted 0
--   CRN-I3MDXG 13560.00  product-rate 0.00   billed-rate 0.00   posted 0
--   CRN-K3EM1B  120.00   product-rate 0.00   billed-rate 0.00   posted 0
--   CRN-NLL31O  750.00   product-rate 0.00   billed-rate 0.00   posted 0
--
-- No historical credit note needs restating. This is purely forward-looking.
-- The defect was latent only because the one tenant with returns charges no
-- GST; it would have bitten the moment that changed.
--
-- p_tenant_id IS NOW UNUSED, AND IS KEPT ANYWAY
--
-- The products join is gone, so the tenant is no longer needed. The parameter
-- stays. Changing a function's parameter list creates a SECOND overload, and
-- PostgREST then fails every caller with PGRST203 -- the trap this project has
-- already been caught by. An unused argument is a far smaller cost than that,
-- and the signature is deliberately left alone.

CREATE OR REPLACE FUNCTION public.sales_return_gst_amount(
  p_return_id text,
  p_tenant_id uuid,   -- unused since the products join went; see header
  p_tax_mode  text,
  p_total     numeric
)
RETURNS numeric LANGUAGE sql STABLE
AS $function$
  WITH raw AS (
    SELECT ROUND(COALESCE(SUM(
      CASE WHEN upper(COALESCE(p_tax_mode,'EXCLUSIVE')) = 'NONE' THEN 0
           -- The rate BILLED on this line, recorded at the time of return.
           -- Not products."taxRate", which is whatever the slab happens to be
           -- today and may have changed since the invoice was raised.
           WHEN COALESCE(si.tax_rate,0) > 0 THEN
        CASE WHEN upper(COALESCE(p_tax_mode,'EXCLUSIVE')) = 'INCLUSIVE'
             THEN si.line_total - si.line_total / (1 + (si.tax_rate / 100.0))
             ELSE si.line_total * (si.tax_rate / 100.0)
        END
      ELSE 0 END), 0), 2) AS g
    FROM public.sales_return_items si
    WHERE si.return_id = p_return_id AND si.deleted_at IS NULL
  )
  SELECT CASE WHEN raw.g < 0 OR raw.g > COALESCE(p_total, 0) THEN 0 ELSE raw.g END
    FROM raw;
$function$;

COMMENT ON FUNCTION public.sales_return_gst_amount(text, uuid, text, numeric) IS
  'The single definition of how much output GST is reversed by a sales return. '
  'Called by gl_post_sales_returns and get_pl_ranged. Reads the rate BILLED on '
  'the return line, so a credit note always matches the invoice it credits '
  'even if the product''s tax slab has changed since. p_tenant_id is retained '
  'but unused: changing the signature would create a second overload.';

-- ---------------------------------------------------------------------------
-- While in the return path: the P&L counted deleted returns, the ledger did not.
--
-- gl_post_sales_returns drops a return's journal when the row is deleted, but
-- get_pl_ranged had no deleted_at filter on sales_returns at all -- so a
-- soft-deleted credit note would vanish from the ledger and stay in the P&L,
-- reducing reported revenue against a journal that no longer exists.
--
-- Zero soft-deleted returns exist on production (reverse_sales_return
-- hard-deletes the row), so this moves nothing today either. It closes the
-- same class of gap as the voided-sale defect: the two surfaces must exclude
-- the same rows, and the only reliable way to keep them the same is to make
-- them say the same thing.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_pl_ranged(
  p_tenant_id uuid, p_from date, p_to date
)
RETURNS TABLE(revenue_net numeric, output_gst numeric, cogs numeric,
              returns_total numeric, expenses numeric,
              gross_profit numeric, net_profit numeric)
LANGUAGE plpgsql SECURITY DEFINER
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
    -- The GST rule is NOT restated here any more; it is called. The join to
    -- sale_items and the GROUP BY went with it.
    SELECT sr.id, sr.gross, sr.ic,
           public.sale_gst_amount(sr.id, v_tax_mode, sr.gross) AS ig
    FROM (
      SELECT s.id, s."totalAmount" AS gross, COALESCE(s."totalCogs",0) AS ic
      FROM public.sales s
      WHERE s.tenant_id = p_tenant_id AND s.deleted_at IS NULL
        AND s.voided_at IS NULL
        -- Identical to gl_post_sales's exclusion set. Keep them the same.
        AND upper(COALESCE(s.status,''))          NOT IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED')
        AND upper(COALESCE(s."paymentStatus",'')) NOT IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED')
        AND s.date::date BETWEEN p_from AND p_to
    ) sr
  ),
  agg AS (
    SELECT COALESCE(SUM(gross),0) AS rev_gross,
           COALESCE(SUM(ig),0)    AS tgst,
           -- In full. Was ic * (gross - ig) / gross.
           COALESCE(SUM(ic),0)    AS tcogs
    FROM sale_gst
  ),
  ret AS (
    SELECT COALESCE(SUM(rg.gross),0) AS tret_gross,
           COALESCE(SUM(rg.rgst),0)  AS tret_gst,
           -- In full. Was rcogs * (gross - rgst) / gross.
           COALESCE(SUM(rg.rcogs),0) AS tret_cogs
    FROM (
      SELECT r.id, r.total_amount AS gross,
        public.sales_return_gst_amount(r.id, p_tenant_id, v_tax_mode, r.total_amount) AS rgst,
        (SELECT COALESCE(SUM(si.quantity * COALESCE(si.cost_price,0)), 0)
           FROM public.sales_return_items si
          WHERE si.return_id = r.id AND si.deleted_at IS NULL) AS rcogs
      FROM public.sales_returns r
      -- The ledger drops a deleted return's journal; the P&L must drop the
      -- return. Same rows excluded on both surfaces.
      WHERE r.tenant_id = p_tenant_id AND r.deleted_at IS NULL
        AND r.date::date BETWEEN p_from AND p_to
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
