-- What each customer still owes, sale by sale
-- ============================================================================
--
-- The Customer Aging report read `invoices`. Most sales here never get an
-- invoice row, and it added up each invoice's full amount rather than what was
-- left to pay, so it showed Rs 1,761 where customers owed Rs 73,819, and Rs 0
-- where they owed Rs 35,462. The phone's aging screens are wrong too, each in
-- its own way.
--
-- Sales are the source: what is owed on a sale is totalAmount - paidAmount,
-- with the same exclusions as get_pl_ranged and gl_post_sales. That ties to
-- clients.outstanding_balance exactly on the demo shop, and within Rs 92 on
-- FUTURE DISPO (Rs 50 customer credit, Rs 32 one client, Rs 10 no client).
--
-- It has to be a function: PostgREST returns at most 1,000 rows, so a report
-- reading sales in the browser would silently cut a busy shop's total. This
-- returns only the unpaid sales. One definition for web, mobile and AI chat.
--
-- SECURITY INVOKER, so RLS still applies. Same tenant check as get_pl_ranged.

CREATE OR REPLACE FUNCTION public.get_unpaid_sales(p_tenant_id uuid)
RETURNS TABLE(
  sale_id     text,
  client_id   text,
  client_name text,
  phone       text,
  sale_date   date,
  total       numeric,
  paid        numeric,
  unpaid      numeric,
  invoice_id  text
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $fn$
BEGIN
  IF p_tenant_id <> public.current_tenant_id() AND NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT s.id::text,
         s."shopId"::text,
         COALESCE(c.name, s."customerInfo"->>'name', 'No customer on the bill'),
         COALESCE(c.phone, s."customerInfo"->>'phone'),
         public.gl_txn_date(s.date, s.created_at::date),
         s."totalAmount",
         COALESCE(s."paidAmount", 0),
         s."totalAmount" - COALESCE(s."paidAmount", 0),
         s.invoice_id::text
    FROM public.sales s
    LEFT JOIN public.clients c ON c.id = s."shopId" AND c.tenant_id = s.tenant_id
   WHERE s.tenant_id = p_tenant_id
     AND s.deleted_at IS NULL
     AND s.voided_at IS NULL
     -- Identical to get_pl_ranged and gl_post_sales. Keep the three the same.
     AND upper(COALESCE(s.status, ''))          NOT IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED')
     AND upper(COALESCE(s."paymentStatus", '')) NOT IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED')
     AND s."totalAmount" - COALESCE(s."paidAmount", 0) > 0.005;
END
$fn$;

REVOKE ALL ON FUNCTION public.get_unpaid_sales(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_unpaid_sales(uuid) TO authenticated, service_role;
