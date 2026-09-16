-- Cross-tenant read leak.
--
-- get_dashboard_kpis is SECURITY DEFINER, so it runs past RLS, and it filters
-- every subquery by the p_tenant_id it is HANDED — with no check that the
-- caller owns that tenant. Any authenticated user could pass another tenant's
-- uuid and read their day's sales, expenses, purchases, cash balance and total
-- outstanding. Verified live: a Demo Kirana user read FUTURE DISPO's figures.
--
-- Same guard get_pl_ranged and get_gl_balances already carry. Signature is
-- reproduced exactly — a changed argument list would create a second overload.

CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(p_tenant_id uuid, p_date text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_today date := COALESCE(NULLIF(p_date,'')::date, CURRENT_DATE);
BEGIN
  IF p_tenant_id <> public.current_tenant_id() AND NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN jsonb_build_object(
    'today_sales',     COALESCE((SELECT sum("totalAmount") FROM public.sales
                                 WHERE tenant_id=p_tenant_id AND date::date = v_today
                                   AND voided_at IS NULL), 0),
    'today_expenses',  COALESCE((SELECT sum(amount) FROM public.expenses
                                 WHERE tenant_id=p_tenant_id AND date::date = v_today), 0),
    'today_purchases', COALESCE((SELECT sum(total_amount) FROM public.purchases
                                 WHERE tenant_id=p_tenant_id AND date::date = v_today), 0),
    'outstanding_collections',
                       COALESCE((SELECT sum(outstanding_balance) FROM public.clients
                                 WHERE tenant_id=p_tenant_id AND deleted_at IS NULL), 0),
    'total_products',  COALESCE((SELECT count(*) FROM public.products
                                 WHERE tenant_id=p_tenant_id), 0),
    'low_stock_items', COALESCE((SELECT count(*) FROM public.products
                                 WHERE tenant_id=p_tenant_id AND COALESCE(stock,0) < 50), 0),
    'active_trips',    0,
    'current_cash_balance',
                       COALESCE((SELECT sum("totalAmount") FROM public.sales
                                 WHERE tenant_id=p_tenant_id AND "paymentStatus"='PAID'
                                   AND date::date = v_today
                                   AND voided_at IS NULL
                                   AND COALESCE("paymentMethod",'CASH')='CASH'), 0)
                       - COALESCE((SELECT sum(amount) FROM public.expenses
                                   WHERE tenant_id=p_tenant_id AND date::date = v_today), 0)
  );
END;
$function$;
