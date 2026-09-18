-- Phase 5b, step 1: ONE implementation of "write the lines for this sale".
--
-- Today the only writer of sale_items is the trigger that derives them from
-- sales.items. Phase 5b makes process_sale and edit_sale write the lines
-- themselves so the blob can stop being written at all.
--
-- The tempting shape is to paste the trigger's INSERT into each of those
-- functions. That is exactly how the general ledger and the P&L came to
-- disagree: they implement the same rules separately, and one of them drifted.
-- So the body moves into a function first, and the trigger becomes a caller.
--
-- THIS MIGRATION CHANGES NO BEHAVIOUR. It is a pure extraction -- same SQL,
-- same guards, same exception wrapper, same order -- so that the step which
-- DOES change behaviour is a small readable diff against a shared function
-- rather than a fresh copy of 60 lines of parsing.
--
-- The guards stay as they are and are not "tidied":
--   * CASE, never WHERE, for the numeric tests -- Postgres is free to evaluate
--     a WHERE-filtered cast before the filter, so a malformed value can raise
--     inside the sale's own transaction and roll back a cashier's sale.
--   * the whole body wrapped in EXCEPTION WHEN OTHERS ... RAISE WARNING, so
--     nothing in here can stop money being taken. audit_sale_items is the
--     net that catches what a warning-only failure leaves behind.

CREATE OR REPLACE FUNCTION public.write_sale_lines(
  p_sale_id   text,
  p_tenant_id uuid,
  p_items     jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RETURN; END IF;

  BEGIN
  -- Serials cascade from sale_items, so this clears them too.
  DELETE FROM public.sale_items WHERE sale_id = p_sale_id;

  INSERT INTO public.sale_items
    (tenant_id, sale_id, line_no, product_id, product_name, hsn_code,
     quantity, rate, tax_rate, cess_rate,
     discount, unit, sell_unit_name, sell_qty, sell_unit_price)
  SELECT
    p_tenant_id, p_sale_id, s.ord::int,
    (SELECT p.id FROM public.products p
      WHERE p.id = (s.it->>'id') AND p.tenant_id = p_tenant_id),
    s.it->>'name',
    nullif(trim(coalesce(s.it->>'hsn', '')), ''),
    s.quantity, s.rate, s.tax_rate, s.cess_rate,
    s.discount,
    -- 'uqc' is what the GST code reads first, 'unit' is what the POS writes.
    nullif(trim(coalesce(s.it->>'uqc', s.it->>'unit', '')), ''),
    nullif(trim(coalesce(s.it->>'sellUnitName', '')), ''),
    s.sell_qty, s.sell_unit_price
  FROM (
    SELECT e.ord, e.it,
      CASE WHEN (e.it->>'quantity') ~ '^[0-9]+(\.[0-9]+)?$'
           THEN (e.it->>'quantity')::numeric END AS quantity,
      CASE WHEN (e.it->>'rate') ~ '^[0-9]+(\.[0-9]+)?$'
           THEN (e.it->>'rate')::numeric END AS rate,
      CASE WHEN coalesce(e.it->>'taxRate', '0') ~ '^[0-9]+(\.[0-9]+)?$'
           THEN coalesce(e.it->>'taxRate', '0')::numeric ELSE 0 END AS tax_rate,
      CASE WHEN coalesce(e.it->>'cess', '0') ~ '^[0-9]+(\.[0-9]+)?$'
           THEN coalesce(e.it->>'cess', '0')::numeric ELSE 0 END AS cess_rate,
      CASE WHEN coalesce(e.it->>'discount', '0') ~ '^[0-9]+(\.[0-9]+)?$'
           THEN coalesce(e.it->>'discount', '0')::numeric ELSE 0 END AS discount,
      CASE WHEN (e.it->>'sellQty') ~ '^[0-9]*\.?[0-9]+$'
            AND (e.it->>'sellQty')::numeric > 0
           THEN (e.it->>'sellQty')::numeric END AS sell_qty,
      CASE WHEN (e.it->>'sellUnitPrice') ~ '^[0-9]*\.?[0-9]+$'
           THEN (e.it->>'sellUnitPrice')::numeric END AS sell_unit_price
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS e(it, ord)
  ) s
  WHERE (s.it->>'name') IS NOT NULL
    AND s.quantity IS NOT NULL
    AND s.rate     IS NOT NULL
    AND s.quantity > 0;

  -- Serials, joined back to the line by its ordinal. Blank entries are
  -- dropped rather than stored: an empty serial is not a serial.
  INSERT INTO public.sale_item_serials (tenant_id, sale_item_id, serial)
  SELECT p_tenant_id, si.id, trim(ser.value)
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS e(it, ord)
    JOIN public.sale_items si
      ON si.sale_id = p_sale_id AND si.line_no = e.ord::int
   CROSS JOIN LATERAL jsonb_array_elements_text(
         CASE WHEN jsonb_typeof(e.it->'imeis') = 'array'
              THEN e.it->'imeis' ELSE '[]'::jsonb END) AS ser(value)
   WHERE length(trim(ser.value)) > 0
  ON CONFLICT (sale_item_id, serial) DO NOTHING;

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'write_sale_lines failed for sale % (tenant %): %',
      p_sale_id, p_tenant_id, SQLERRM;
  END;
END;
$function$;

-- The trigger keeps its own concern -- "did the blob actually change?" -- and
-- delegates the writing. The name stays trg_a_sync_sale_items: AFTER triggers
-- fire in NAME order, and consumers such as trg_gl_sales depend on this one
-- having already run.
CREATE OR REPLACE FUNCTION public.sync_sale_items_from_blob()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF jsonb_typeof(NEW.items) IS DISTINCT FROM 'array' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.items IS NOT DISTINCT FROM OLD.items THEN RETURN NEW; END IF;

  PERFORM public.write_sale_lines(NEW.id, NEW.tenant_id, NEW.items);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.write_sale_lines(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
