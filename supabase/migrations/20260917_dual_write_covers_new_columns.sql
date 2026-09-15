-- The dual-write trigger, extended to the columns added alongside it.
--
-- Adding columns without teaching the writer about them would leave them
-- permanently empty and make the table quietly WORSE than the blob it is meant
-- to replace -- the failure this phase exists to prevent.
--
-- Same rules as before: CASE guards so a malformed value can never raise
-- inside the sale's transaction, and the whole body wrapped so that nothing
-- here can stop a cashier taking money.

CREATE OR REPLACE FUNCTION public.sync_sale_items_from_blob()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF jsonb_typeof(NEW.items) IS DISTINCT FROM 'array' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.items IS NOT DISTINCT FROM OLD.items THEN RETURN NEW; END IF;

  BEGIN
  -- Serials cascade from sale_items, so this clears them too.
  DELETE FROM public.sale_items WHERE sale_id = NEW.id;

  INSERT INTO public.sale_items
    (tenant_id, sale_id, line_no, product_id, product_name, hsn_code,
     quantity, rate, tax_rate, cess_rate,
     discount, unit, sell_unit_name, sell_qty, sell_unit_price)
  SELECT
    NEW.tenant_id, NEW.id, s.ord::int,
    (SELECT p.id FROM public.products p
      WHERE p.id = (s.it->>'id') AND p.tenant_id = NEW.tenant_id),
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
    FROM jsonb_array_elements(NEW.items) WITH ORDINALITY AS e(it, ord)
  ) s
  WHERE (s.it->>'name') IS NOT NULL
    AND s.quantity IS NOT NULL
    AND s.rate     IS NOT NULL
    AND s.quantity > 0;

  -- Serials, joined back to the line by its ordinal. Blank entries are
  -- dropped rather than stored: an empty serial is not a serial.
  INSERT INTO public.sale_item_serials (tenant_id, sale_item_id, serial)
  SELECT NEW.tenant_id, si.id, trim(ser.value)
    FROM jsonb_array_elements(NEW.items) WITH ORDINALITY AS e(it, ord)
    JOIN public.sale_items si
      ON si.sale_id = NEW.id AND si.line_no = e.ord::int
   CROSS JOIN LATERAL jsonb_array_elements_text(
         CASE WHEN jsonb_typeof(e.it->'imeis') = 'array'
              THEN e.it->'imeis' ELSE '[]'::jsonb END) AS ser(value)
   WHERE length(trim(ser.value)) > 0
  ON CONFLICT (sale_item_id, serial) DO NOTHING;

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_sale_items_from_blob failed for sale % (tenant %): %',
      NEW.id, NEW.tenant_id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
