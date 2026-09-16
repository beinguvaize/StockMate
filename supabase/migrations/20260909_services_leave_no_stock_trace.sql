-- A service has no stock, so it has no stock movements.
--
-- process_sale, edit_sale, void_sale and process_sales_return all loop over
-- sale lines without knowing what a product IS. Each wrote a movement_log row
-- and an inventory_balances row for a tuition hour. The quantity was clamped by
-- GREATEST(0, ...) so nothing ever went negative, but the stock ledger recorded
-- goods movements for something with no goods.
--
-- WHY A TRIGGER RATHER THAN FOUR FUNCTION REWRITES
--
-- Those four functions are ~22,000 characters of money-path SQL between them.
-- Editing each means reproducing it in full, and a transcription slip there is
-- a silent accounting error. Two of them (edit_sale, process_sales_return) do
-- not even have a pinned search_path, so replacing them safely would mean
-- fixing that too, widening the change further.
--
-- "A service has no stock movements" is an invariant of the DATA, not of one
-- code path. Enforced at the table it is ~20 lines instead of 22k, it leaves
-- every money function byte-identical, and it covers callers that do not exist
-- yet -- van sales, returns, mobile, and whatever writes these tables next.
--
-- Safe to ship: prod holds ZERO product_type='SERVICE' rows, so this is purely
-- forward-looking. Nothing to backfill, no existing bill whose figures move.
--
-- COGS is untouched. process_sale still runs its FIFO loop and its costPrice
-- fallback exactly as before; a service simply has no batches, so it
-- contributes the same number it always did.

CREATE OR REPLACE FUNCTION public.skip_stock_rows_for_services()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.products
     WHERE id = NEW.product_id
       AND upper(coalesce(product_type, 'STANDARD')) = 'SERVICE'
  ) THEN
    -- BEFORE INSERT: drop this row and let the caller carry on. The sale, its
    -- line, its revenue and its COGS are all unaffected -- only the stock
    -- side-effect disappears.
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_skip_service_movement ON public.movement_log;
CREATE TRIGGER trg_skip_service_movement
  BEFORE INSERT ON public.movement_log
  FOR EACH ROW EXECUTE FUNCTION public.skip_stock_rows_for_services();

-- process_sale inserts a zero-quantity balance row then UPDATEs it. Blocking
-- the insert means the update matches nothing, so no balance row is created
-- and none is later "restored" by a void.
DROP TRIGGER IF EXISTS trg_skip_service_balance ON public.inventory_balances;
CREATE TRIGGER trg_skip_service_balance
  BEFORE INSERT ON public.inventory_balances
  FOR EACH ROW EXECUTE FUNCTION public.skip_stock_rows_for_services();
