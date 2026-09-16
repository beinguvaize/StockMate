-- Phase 5a prerequisite: the lines must exist before anything reads them.
--
-- Postgres fires AFTER triggers in NAME order. trg_sync_sale_items sorted LAST
-- of the triggers on sales and trg_gl_sales sorted FIRST -- so a consumer
-- migrated to read sale_items would have read the PREVIOUS version of the
-- lines, or none at all on an insert, and posted the wrong GST to the general
-- ledger without erroring.
--
-- The 'a_' prefix is load-bearing and must not be tidied away: it is what
-- guarantees the derived rows are in place before any other trigger on this
-- table runs.
DROP TRIGGER IF EXISTS trg_sync_sale_items ON public.sales;
DROP TRIGGER IF EXISTS trg_a_sync_sale_items ON public.sales;
CREATE TRIGGER trg_a_sync_sale_items
  AFTER INSERT OR UPDATE OF items ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.sync_sale_items_from_blob();
