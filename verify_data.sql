-- Verify Data Population
SELECT 'Sales' as table_name, count(*) FROM public.sales WHERE is_seed = TRUE
UNION ALL
SELECT 'Invoices', count(*) FROM public.invoices WHERE is_seed = TRUE
UNION ALL
SELECT 'Products', count(*) FROM public.products WHERE is_seed = TRUE
UNION ALL
SELECT 'Movement Log', count(*) FROM public.movement_log WHERE is_seed = TRUE;
