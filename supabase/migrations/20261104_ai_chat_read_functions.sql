-- AI chat v1: the read functions behind the 12 set questions (docs/ai-chat-v1.md §3-§4)
-- ============================================================================
--
-- The owner taps a question; ai-ask runs one of these with the owner's JWT.
-- Every function follows the same rules:
--
--   * No tenant argument. The shop comes from auth, via ai_owner_tenant().
--   * Owner only, refused here as well as in ai-ask. Staff can read many of
--     these tables through RLS, but not these summaries.
--   * RLS AND an explicit tenant_id filter. Every read policy also passes a
--     global admin, so without the filter an admin's call adds up every shop.
--   * SECURITY INVOKER and STABLE: RLS applies and Postgres refuses any write.
--   * Lists are capped by p_limit; totals always cover every row.
--
-- Money rules are not restated. Profit and GST stay in get_pl_ranged, which
-- ai-ask calls as it is. costPrice is read, never written.

-- ── helpers ────────────────────────────────────────────────────────────────

-- The caller's shop, or a refusal. Each function opens with this.
CREATE OR REPLACE FUNCTION public.ai_owner_tenant()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.current_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No shop for this user' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_tenant_admin() THEN
    RAISE EXCEPTION 'Only the shop owner can do this' USING ERRCODE = '42501';
  END IF;
  RETURN v_tenant;
END
$fn$;

-- Today in the shop's own timezone, never the database's UTC date.
CREATE OR REPLACE FUNCTION public.ai_shop_today()
RETURNS date
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  SELECT (now() AT TIME ZONE COALESCE(
    (SELECT NULLIF(bp.timezone, '') FROM public.business_profile bp
      WHERE bp.tenant_id = public.current_tenant_id() AND bp.deleted_at IS NULL
      LIMIT 1),
    'Asia/Kolkata'))::date
$fn$;

-- "Countable sale": the exclusion set in get_pl_ranged and isCountableSale.
-- deleted_at is filtered by the caller, as it is on every table.
CREATE OR REPLACE FUNCTION public.ai_countable(p_voided_at timestamptz, p_status text, p_payment_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  SELECT p_voided_at IS NULL
     AND upper(COALESCE(p_status, ''))         NOT IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED')
     AND upper(COALESCE(p_payment_status, '')) NOT IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED')
$fn$;

-- ── 1. sales_today ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_sales_summary(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant  uuid := public.ai_owner_tenant();
  v_gross   numeric;
  v_bills   bigint;
  v_returns numeric;
  v_methods jsonb;
BEGIN
  SELECT COALESCE(SUM(s."totalAmount"), 0), COUNT(*) INTO v_gross, v_bills
    FROM public.sales s
   WHERE s.tenant_id = v_tenant AND s.deleted_at IS NULL
     AND public.ai_countable(s.voided_at, s.status, s."paymentStatus")
     AND s.date::date BETWEEN p_from AND p_to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('method', m.method, 'amount', m.amount) ORDER BY m.amount DESC, m.method), '[]'::jsonb)
    INTO v_methods
    FROM (SELECT upper(COALESCE(NULLIF(s."paymentMethod", ''), 'UNKNOWN')) AS method,
                 ROUND(SUM(s."totalAmount"), 2) AS amount
            FROM public.sales s
           WHERE s.tenant_id = v_tenant AND s.deleted_at IS NULL
             AND public.ai_countable(s.voided_at, s.status, s."paymentStatus")
             AND s.date::date BETWEEN p_from AND p_to
           GROUP BY 1) m;

  SELECT COALESCE(SUM(r.total_amount), 0) INTO v_returns
    FROM public.sales_returns r
   WHERE r.tenant_id = v_tenant AND r.deleted_at IS NULL
     AND r.date BETWEEN p_from AND p_to;

  RETURN jsonb_build_object(
    'period_from', p_from, 'period_to', p_to, 'as_of', now(),
    'gross_sales', ROUND(v_gross, 2),
    'bill_count', v_bills,
    'average_bill', CASE WHEN v_bills > 0 THEN ROUND(v_gross / v_bills, 2) ELSE 0 END,
    'by_method', v_methods,
    'returns_amount', ROUND(v_returns, 2));
END
$fn$;

-- ── 3. top_items ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_top_items(p_from date, p_to date, p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
  v_items  jsonb;
  v_count  bigint;
  v_total  numeric;
BEGIN
  WITH lines AS (
    SELECT COALESCE(si.product_id, si.product_name) AS k, si.product_id, si.product_name,
           si.unit, si.quantity, si.line_total, si.sale_id
      FROM public.sale_items si
      JOIN public.sales s ON s.id = si.sale_id AND s.tenant_id = v_tenant
     WHERE si.tenant_id = v_tenant AND si.deleted_at IS NULL AND s.deleted_at IS NULL
       AND public.ai_countable(s.voided_at, s.status, s."paymentStatus")
       AND s.date::date BETWEEN p_from AND p_to
  ), per AS (
    SELECT k, MAX(product_id) AS product_id, MAX(product_name) AS product_name, MAX(unit) AS unit,
           ROUND(SUM(quantity), 3) AS qty_sold, ROUND(SUM(line_total), 2) AS sales_value,
           COUNT(DISTINCT sale_id) AS bill_count
      FROM lines GROUP BY k
  ), ranked AS (
    SELECT * FROM per ORDER BY sales_value DESC, product_name LIMIT v_limit
  )
  SELECT (SELECT COUNT(*) FROM per),
         (SELECT COALESCE(SUM(sales_value), 0) FROM per),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'product_id', r.product_id, 'product_name', r.product_name, 'unit', r.unit,
             'qty_sold', r.qty_sold, 'sales_value', r.sales_value, 'bill_count', r.bill_count)
             ORDER BY r.sales_value DESC, r.product_name), '[]'::jsonb) FROM ranked r)
    INTO v_count, v_total, v_items;

  RETURN jsonb_build_object(
    'period_from', p_from, 'period_to', p_to, 'as_of', now(),
    'distinct_items_sold', v_count, 'total_sales_value', v_total, 'items', v_items);
END
$fn$;

-- ── 4. low_stock (rule of LowStockReport.jsx) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_low_stock(p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_today  date := public.ai_shop_today();
  v_low    bigint;
  v_out    bigint;
  v_value  numeric;
  v_items  jsonb;
BEGIN
  WITH bal AS (
    SELECT b.product_id, SUM(b.quantity)::numeric AS qty
      FROM public.inventory_balances b
     WHERE b.tenant_id = v_tenant AND b.deleted_at IS NULL
     GROUP BY b.product_id
  ), stocked AS (
    SELECT p.id, p.name, p.unit, COALESCE(p."costPrice", 0) AS cost,
           COALESCE(bal.qty, p.stock, 0) AS stock,
           COALESCE(NULLIF(p."lowStockThreshold", 0), 10) AS threshold
      FROM public.products p
      LEFT JOIN bal ON bal.product_id = p.id
     WHERE p.tenant_id = v_tenant AND p.deleted_at IS NULL
       AND upper(COALESCE(p.product_type, 'STANDARD')) NOT IN ('RAW', 'SERVICE')
  ), low AS (
    SELECT *, GREATEST(threshold - stock, 0) AS shortfall FROM stocked WHERE stock <= threshold
  ), capped AS (
    SELECT * FROM low ORDER BY stock, name LIMIT v_limit
  )
  SELECT (SELECT COUNT(*) FROM low),
         (SELECT COUNT(*) FROM low WHERE stock = 0),
         (SELECT COALESCE(SUM(shortfall * cost), 0) FROM low),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'product_id', c.id, 'product_name', c.name, 'unit', c.unit, 'stock', c.stock,
             'threshold', c.threshold, 'shortfall', c.shortfall) ORDER BY c.stock, c.name), '[]'::jsonb)
            FROM capped c)
    INTO v_low, v_out, v_value, v_items;

  RETURN jsonb_build_object(
    'period_from', v_today, 'period_to', v_today, 'as_of', now(),
    'items_low', v_low, 'items_out', v_out, 'reorder_value', ROUND(v_value, 2), 'items', v_items);
END
$fn$;

-- ── 5. expiring_stock (rule of ExpiryReport.jsx) ───────────────────────────
CREATE OR REPLACE FUNCTION public.ai_expiring_stock(p_days int DEFAULT 30, p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_days   int  := GREATEST(COALESCE(p_days, 30), 0);
  v_today  date := public.ai_shop_today();
  v_expired_n bigint; v_expired_v numeric;
  v_soon_n    bigint; v_soon_v    numeric;
  v_items  jsonb;
BEGIN
  WITH b AS (
    SELECT pb.product_id, pb.expiry_date, pb.qty_remaining,
           pb.qty_remaining * COALESCE(pb.unit_cost, 0) AS value
      FROM public.product_batches pb
     WHERE pb.tenant_id = v_tenant AND pb.deleted_at IS NULL
       AND pb.expiry_date IS NOT NULL AND pb.qty_remaining > 0
       AND pb.expiry_date <= v_today + v_days
  ), capped AS (
    SELECT * FROM b ORDER BY expiry_date, product_id LIMIT v_limit
  )
  SELECT (SELECT COUNT(*) FROM b WHERE expiry_date <  v_today),
         (SELECT COALESCE(SUM(value), 0) FROM b WHERE expiry_date <  v_today),
         (SELECT COUNT(*) FROM b WHERE expiry_date >= v_today),
         (SELECT COALESCE(SUM(value), 0) FROM b WHERE expiry_date >= v_today),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'product_name', p.name, 'expiry_date', c.expiry_date,
             'days_left', c.expiry_date - v_today, 'qty_remaining', c.qty_remaining,
             'value', ROUND(c.value, 2)) ORDER BY c.expiry_date, c.product_id), '[]'::jsonb)
            FROM capped c
            LEFT JOIN public.products p ON p.id = c.product_id AND p.tenant_id = v_tenant)
    INTO v_expired_n, v_expired_v, v_soon_n, v_soon_v, v_items;

  RETURN jsonb_build_object(
    'period_from', v_today, 'period_to', v_today + v_days, 'as_of', now(),
    'expired_batches', v_expired_n, 'expired_value', ROUND(v_expired_v, 2),
    'expiring_batches', v_soon_n, 'expiring_value', ROUND(v_soon_v, 2), 'items', v_items);
END
$fn$;

-- ── 6. dead_stock (InventoryReport.jsx, without RAW and SERVICE) ───────────
CREATE OR REPLACE FUNCTION public.ai_dead_stock(p_days int DEFAULT 30, p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_days   int  := GREATEST(COALESCE(p_days, 30), 0);
  v_today  date := public.ai_shop_today();
  v_n      bigint;
  v_value  numeric;
  v_items  jsonb;
BEGIN
  WITH sold AS (
    SELECT DISTINCT si.product_id
      FROM public.sale_items si
      JOIN public.sales s ON s.id = si.sale_id AND s.tenant_id = v_tenant
     WHERE si.tenant_id = v_tenant AND si.deleted_at IS NULL AND s.deleted_at IS NULL
       AND public.ai_countable(s.voided_at, s.status, s."paymentStatus")
       AND s.date::date >= v_today - v_days
       AND si.product_id IS NOT NULL
  ), dead AS (
    SELECT p.id, p.name, p.unit, p.stock, p.stock * COALESCE(p."costPrice", 0) AS value
      FROM public.products p
     WHERE p.tenant_id = v_tenant AND p.deleted_at IS NULL
       AND COALESCE(p.stock, 0) > 0
       AND upper(COALESCE(p.product_type, 'STANDARD')) NOT IN ('RAW', 'SERVICE')
       AND NOT EXISTS (SELECT 1 FROM sold WHERE sold.product_id = p.id)
  ), capped AS (
    SELECT * FROM dead ORDER BY value DESC, name LIMIT v_limit
  )
  SELECT (SELECT COUNT(*) FROM dead),
         (SELECT COALESCE(SUM(value), 0) FROM dead),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'product_id', c.id, 'product_name', c.name, 'unit', c.unit, 'stock', c.stock,
             'value', ROUND(c.value, 2)) ORDER BY c.value DESC, c.name), '[]'::jsonb) FROM capped c)
    INTO v_n, v_value, v_items;

  RETURN jsonb_build_object(
    'period_from', v_today - v_days, 'period_to', v_today, 'as_of', now(),
    'items_dead', v_n, 'value_stuck', ROUND(v_value, 2), 'items', v_items);
END
$fn$;

-- ── 7. top_dues ────────────────────────────────────────────────────────────
-- Never selects phone, contact, gstin, gst_no, pan_number, aadhaar or an address.
CREATE OR REPLACE FUNCTION public.ai_top_dues(p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
  v_today  date := public.ai_shop_today();
  v_total  numeric;
  v_n      bigint;
  v_rows   jsonb;
BEGIN
  SELECT COALESCE(SUM(c.outstanding_balance), 0), COUNT(*) FILTER (WHERE c.outstanding_balance > 0)
    INTO v_total, v_n
    FROM public.clients c
   WHERE c.tenant_id = v_tenant AND c.deleted_at IS NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'client_id', t.id, 'name', t.name, 'outstanding', t.outstanding_balance,
           'last_payment_date', t.last_payment_date) ORDER BY t.outstanding_balance DESC, t.name), '[]'::jsonb)
    INTO v_rows
    FROM (SELECT c.id, c.name, c.outstanding_balance,
                 (SELECT MAX(cp.date) FROM public.client_payments cp
                   WHERE cp.tenant_id = v_tenant AND cp.deleted_at IS NULL AND cp.client_id = c.id) AS last_payment_date
            FROM public.clients c
           WHERE c.tenant_id = v_tenant AND c.deleted_at IS NULL AND c.outstanding_balance > 0
           ORDER BY c.outstanding_balance DESC, c.name
           LIMIT v_limit) t;

  RETURN jsonb_build_object(
    'period_from', v_today, 'period_to', v_today, 'as_of', now(),
    'total_outstanding', ROUND(v_total, 2), 'customers_with_dues', v_n, 'customers', v_rows);
END
$fn$;

-- ── 8. dues_age ────────────────────────────────────────────────────────────
-- Aged by sale date: no due dates exist. unmatched_amount is what the customer
-- balances hold beyond the unpaid sales, and the card has to show it.
CREATE OR REPLACE FUNCTION public.ai_dues_ageing()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant  uuid := public.ai_owner_tenant();
  v_today   date := public.ai_shop_today();
  v_total   numeric;
  v_bucket  numeric;
  v_oldest  int;
  v_buckets jsonb;
BEGIN
  SELECT COALESCE(SUM(c.outstanding_balance), 0) INTO v_total
    FROM public.clients c
   WHERE c.tenant_id = v_tenant AND c.deleted_at IS NULL;

  WITH unpaid AS (
    SELECT s."totalAmount" - COALESCE(s."paidAmount", 0) AS due, v_today - s.date::date AS age
      FROM public.sales s
     WHERE s.tenant_id = v_tenant AND s.deleted_at IS NULL
       AND public.ai_countable(s.voided_at, s.status, s."paymentStatus")
       AND s."totalAmount" - COALESCE(s."paidAmount", 0) > 0
  ), slots(ord, label, lo, hi) AS (
    VALUES (1, '0-30', NULL::int, 30), (2, '31-60', 31, 60), (3, '61-90', 61, 90), (4, '90+', 91, NULL::int)
  ), filled AS (
    SELECT sl.ord, sl.label, COALESCE(SUM(u.due), 0) AS amount, COUNT(u.due) AS bill_count
      FROM slots sl
      LEFT JOIN unpaid u ON (sl.lo IS NULL OR u.age >= sl.lo) AND (sl.hi IS NULL OR u.age <= sl.hi)
     GROUP BY sl.ord, sl.label
  )
  SELECT (SELECT COALESCE(SUM(due), 0) FROM unpaid),
         (SELECT MAX(age) FROM unpaid),
         (SELECT jsonb_agg(jsonb_build_object('label', f.label, 'amount', ROUND(f.amount, 2), 'bill_count', f.bill_count) ORDER BY f.ord) FROM filled f)
    INTO v_bucket, v_oldest, v_buckets;

  RETURN jsonb_build_object(
    'period_from', v_today, 'period_to', v_today, 'as_of', now(),
    'total_outstanding', ROUND(v_total, 2),
    'buckets', v_buckets,
    'oldest_days', COALESCE(v_oldest, 0),
    'unmatched_amount', ROUND(v_total - v_bucket, 2));
END
$fn$;

-- ── 9. collections_week ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_collections(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant  uuid := public.ai_owner_tenant();
  v_total   numeric;
  v_count   bigint;
  v_paid    bigint;
  v_methods jsonb;
BEGIN
  SELECT COALESCE(SUM(cp.amount), 0), COUNT(*), COUNT(DISTINCT cp.client_id)
    INTO v_total, v_count, v_paid
    FROM public.client_payments cp
   WHERE cp.tenant_id = v_tenant AND cp.deleted_at IS NULL
     AND cp.date::date BETWEEN p_from AND p_to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('method', m.method, 'amount', m.amount) ORDER BY m.amount DESC, m.method), '[]'::jsonb)
    INTO v_methods
    FROM (SELECT upper(COALESCE(NULLIF(cp.payment_method, ''), 'UNKNOWN')) AS method,
                 ROUND(SUM(cp.amount), 2) AS amount
            FROM public.client_payments cp
           WHERE cp.tenant_id = v_tenant AND cp.deleted_at IS NULL
             AND cp.date::date BETWEEN p_from AND p_to
           GROUP BY 1) m;

  RETURN jsonb_build_object(
    'period_from', p_from, 'period_to', p_to, 'as_of', now(),
    'collected', ROUND(v_total, 2), 'receipt_count', v_count,
    'customers_paid', v_paid, 'by_method', v_methods);
END
$fn$;

-- ── 10. cash_bank (the ledger the dashboard and Accounts screen use) ───────
-- Never selects account_no, ifsc or upi_id.
CREATE OR REPLACE FUNCTION public.ai_cash_bank()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_today  date := public.ai_shop_today();
  v_total  numeric; v_cash numeric; v_bank numeric;
  v_in     numeric; v_out  numeric;
  v_rows   jsonb;
BEGIN
  WITH acc AS (
    SELECT a.id, a.name, upper(COALESCE(a.type, '')) AS type, a.opening_balance, a.linked_bank_account_id
      FROM public.accounts a
     WHERE a.tenant_id = v_tenant AND a.deleted_at IS NULL AND upper(COALESCE(a.type, '')) <> 'LOAN'
  ), moved AS (
    SELECT t.account_id,
           SUM(CASE WHEN t.direction = 'IN' THEN t.amount ELSE -t.amount END) AS net
      FROM public.account_transactions t
     WHERE t.tenant_id = v_tenant
     GROUP BY t.account_id
  ), own AS (
    -- A UPI handle linked to a live bank account folds into it, as on both screens.
    SELECT CASE WHEN a.type = 'UPI' AND a.linked_bank_account_id IN (SELECT id FROM acc)
                THEN a.linked_bank_account_id ELSE a.id END AS home,
           COALESCE(a.opening_balance, 0) + COALESCE(m.net, 0) AS balance
      FROM acc a LEFT JOIN moved m ON m.account_id = a.id
  ), rolled AS (
    SELECT o.home, a.name, a.type, SUM(o.balance) AS balance
      FROM own o JOIN acc a ON a.id = o.home
     GROUP BY o.home, a.name, a.type
  )
  SELECT (SELECT COALESCE(SUM(balance), 0) FROM rolled),
         (SELECT COALESCE(SUM(balance), 0) FROM rolled WHERE type = 'CASH'),
         (SELECT COALESCE(SUM(balance), 0) FROM rolled WHERE type <> 'CASH'),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'account_id', r.home, 'label', r.name, 'type', r.type, 'balance', ROUND(r.balance, 2))
             ORDER BY r.balance DESC, r.name), '[]'::jsonb) FROM rolled r),
         (SELECT COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'IN'), 0)
            FROM public.account_transactions t JOIN acc a ON a.id = t.account_id
           WHERE t.tenant_id = v_tenant AND t.date = v_today AND COALESCE(t.ref_type, '') <> 'TRANSFER'),
         (SELECT COALESCE(SUM(t.amount) FILTER (WHERE t.direction <> 'IN'), 0)
            FROM public.account_transactions t JOIN acc a ON a.id = t.account_id
           WHERE t.tenant_id = v_tenant AND t.date = v_today AND COALESCE(t.ref_type, '') <> 'TRANSFER')
    INTO v_total, v_cash, v_bank, v_rows, v_in, v_out;

  RETURN jsonb_build_object(
    'period_from', v_today, 'period_to', v_today, 'as_of', now(),
    'total_balance', ROUND(v_total, 2), 'cash_total', ROUND(v_cash, 2), 'bank_total', ROUND(v_bank, 2),
    'accounts', v_rows, 'today_in', ROUND(v_in, 2), 'today_out', ROUND(v_out, 2));
END
$fn$;

-- ── 12. gst_gaps ───────────────────────────────────────────────────────────
-- Counts and values only: no GSTIN ever leaves this function. "No GSTIN" means
-- a missing value, not a format judgement.
CREATE OR REPLACE FUNCTION public.ai_gst_data_gaps(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_pur bigint; v_pur_nobill bigint; v_pur_value numeric;
  v_lines bigint; v_lines_nohsn bigint;
  v_prod bigint;  v_prod_nohsn bigint;
  v_sup bigint;   v_sup_nogstin bigint;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE NULLIF(btrim(p.bill_no), '') IS NULL),
         COALESCE(SUM(p.total_amount) FILTER (WHERE NULLIF(btrim(p.bill_no), '') IS NULL), 0)
    INTO v_pur, v_pur_nobill, v_pur_value
    FROM public.purchases p
   WHERE p.tenant_id = v_tenant AND p.deleted_at IS NULL
     AND p.date::date BETWEEN p_from AND p_to;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE NULLIF(btrim(si.hsn_code), '') IS NULL)
    INTO v_lines, v_lines_nohsn
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id AND s.tenant_id = v_tenant
   WHERE si.tenant_id = v_tenant AND si.deleted_at IS NULL AND s.deleted_at IS NULL
     AND public.ai_countable(s.voided_at, s.status, s."paymentStatus")
     AND s.date::date BETWEEN p_from AND p_to;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE NULLIF(btrim(p.hsn_code), '') IS NULL)
    INTO v_prod, v_prod_nohsn
    FROM public.products p
   WHERE p.tenant_id = v_tenant AND p.deleted_at IS NULL;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE NULLIF(btrim(s.gstin), '') IS NULL)
    INTO v_sup, v_sup_nogstin
    FROM public.suppliers s
   WHERE s.tenant_id = v_tenant AND s.deleted_at IS NULL
     AND s.id IN (SELECT p.supplier_id FROM public.purchases p
                   WHERE p.tenant_id = v_tenant AND p.deleted_at IS NULL
                     AND p.date::date BETWEEN p_from AND p_to);

  RETURN jsonb_build_object(
    'period_from', p_from, 'period_to', p_to, 'as_of', now(),
    'purchases_total', v_pur, 'purchases_no_bill_no', v_pur_nobill,
    'purchases_no_bill_no_value', ROUND(v_pur_value, 2),
    'sale_lines_total', v_lines, 'sale_lines_no_hsn', v_lines_nohsn,
    'products_total', v_prod, 'products_no_hsn', v_prod_nohsn,
    'suppliers_used', v_sup, 'suppliers_used_no_gstin', v_sup_nogstin);
END
$fn$;

-- ── grants: Postgres gives PUBLIC EXECUTE by default ───────────────────────
DO $g$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'ai_owner_tenant()', 'ai_shop_today()', 'ai_countable(timestamptz,text,text)',
    'ai_sales_summary(date,date)', 'ai_top_items(date,date,int)', 'ai_low_stock(int)',
    'ai_expiring_stock(int,int)', 'ai_dead_stock(int,int)', 'ai_top_dues(int)',
    'ai_dues_ageing()', 'ai_collections(date,date)', 'ai_cash_bank()', 'ai_gst_data_gaps(date,date)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $g$;
