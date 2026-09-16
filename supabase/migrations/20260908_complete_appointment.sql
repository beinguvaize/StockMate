-- Completing an appointment records the money.
--
-- appointments.sale_id has existed since the table was created and is
-- referenced nowhere in the application. Marking a booking COMPLETED wrote a
-- status and nothing else, so the service, the client and the price had to be
-- re-keyed into the POS by hand — with nothing stopping a booking being billed
-- twice, or never.
--
-- process_sale is NOT touched. Its parameter list stays exactly as it is:
-- changing it would create a second overload and break every caller with
-- PGRST203. This is a new function with a new name that calls it by NAMED
-- arguments, so a future parameter added to process_sale cannot silently
-- shift what this passes.

-- The reverse link. Forward is appointments.sale_id, which already exists.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS appointment_id uuid;
CREATE INDEX IF NOT EXISTS idx_sales_appointment_id
  ON public.sales (appointment_id) WHERE appointment_id IS NOT NULL;

-- One booking, one bill. The RPC already refuses to bill twice; this makes a
-- duplicate a constraint error rather than a silent second sale, whatever
-- writes it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_sale_id
  ON public.appointments (sale_id) WHERE sale_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.complete_appointment(
  p_appointment_id uuid,
  p_user_id        uuid,
  p_payment_method text    DEFAULT 'CASH',
  p_paid_amount    numeric DEFAULT NULL,
  p_location_id    uuid    DEFAULT NULL,
  p_date           text    DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  a         RECORD;
  v_product RECORD;
  v_base    text;
  v_sale_id text;
  v_items   jsonb;
  v_try     int := 1;
BEGIN
  -- FOR UPDATE: two taps on Complete race otherwise, and the second would read
  -- sale_id as still null before the first had written it.
  SELECT * INTO a FROM public.appointments
   WHERE id = p_appointment_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment % not found', p_appointment_id;
  END IF;

  IF NOT (public.is_global_admin() OR a.tenant_id = public.current_tenant_id()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Already billed. THIS is the real double-billing guard: the whole function
  -- is one transaction, so either it committed and sale_id is set, or nothing
  -- happened at all. Returning the existing id makes a retry harmless rather
  -- than an error the user has to interpret.
  IF a.sale_id IS NOT NULL THEN
    RETURN a.sale_id;
  END IF;

  IF a.service_id IS NULL THEN
    RAISE EXCEPTION 'This appointment has no service to bill.';
  END IF;

  SELECT * INTO v_product FROM public.products
   WHERE id = a.service_id AND tenant_id = a.tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The service on this appointment no longer exists. Edit the appointment before completing it.';
  END IF;

  -- Derived from the appointment, never supplied by the client.
  --
  -- A voided bill keeps its row for audit, so re-billing the same booking needs
  -- a FRESH id. Testing this on dev caught the bug: process_sale returns early
  -- when the id already exists, so reusing the base id after a void linked the
  -- booking to the VOIDED sale — billed on paper, no revenue. Reaching this
  -- line means sale_id IS NULL, so anything already holding the base id can
  -- only be a previous, voided attempt.
  v_base := 'APT-' || replace(p_appointment_id::text, '-', '');
  v_sale_id := v_base;
  WHILE EXISTS (SELECT 1 FROM public.sales WHERE id = v_sale_id) LOOP
    v_try := v_try + 1;
    IF v_try > 50 THEN
      RAISE EXCEPTION 'Could not allocate a sale id for appointment %', p_appointment_id;
    END IF;
    v_sale_id := v_base || '-' || v_try;
  END LOOP;

  -- Built here, from the product, so the tax on the bill is what the catalogue
  -- says rather than whatever the client believed when the slot was booked.
  v_items := jsonb_build_array(jsonb_build_object(
    'id',       a.service_id,
    'quantity', 1,
    'name',     COALESCE(a.service_name, v_product.name),
    'rate',     COALESCE(a.price, 0),
    'taxRate',  COALESCE(v_product."taxRate", 0),
    'cess',     COALESCE(v_product.cess_rate, 0),
    'hsn',      COALESCE(v_product.hsn_code, '')
  ));

  PERFORM public.process_sale(
    p_id             := v_sale_id,
    p_shop_id        := a.client_id,
    p_items          := v_items,
    p_total_amount   := COALESCE(a.price, 0),
    p_payment_method := COALESCE(p_payment_method, 'CASH'),
    p_payment_status := 'PAID',
    -- The sale is dated when the service happened, not when someone got round
    -- to pressing Complete. IST because that is the app's operating timezone
    -- and what todayISOInAppTZ() and the pinned tests both use.
    p_date           := COALESCE(p_date, to_char(a.start_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')),
    p_user_id        := p_user_id,
    p_location_id    := p_location_id,
    p_tenant_id      := a.tenant_id,
    p_source_app     := 'APPOINTMENT',
    p_paid_amount    := p_paid_amount
  );

  UPDATE public.sales
     SET appointment_id = p_appointment_id
   WHERE id = v_sale_id AND tenant_id = a.tenant_id;

  UPDATE public.appointments
     SET status = 'COMPLETED', sale_id = v_sale_id
   WHERE id = p_appointment_id AND sale_id IS NULL;

  RETURN v_sale_id;
END;
$function$;

-- void_sale must release the booking, or the unique index above would make a
-- voided sale permanently unbillable: the appointment would still point at a
-- dead sale id and could never be completed again.
--
-- Also pins search_path, which this function was missing while delete_sale and
-- process_sale both have it — a SECURITY DEFINER function without one resolves
-- unqualified names against the caller's path.
CREATE OR REPLACE FUNCTION public.void_sale(p_id text, p_reason text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_sale RECORD; v_consumption RECORD; item RECORD; v_location UUID;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale % not found', p_id; END IF;
  IF v_sale.voided_at IS NOT NULL THEN RETURN; END IF;

  SELECT id INTO v_location FROM public.inventory_locations
   WHERE tenant_id = v_sale.tenant_id AND type = 'WAREHOUSE'
   ORDER BY created_at ASC NULLS LAST LIMIT 1;

  FOR v_consumption IN SELECT * FROM public.sale_batch_consumption WHERE sale_id = p_id LOOP
    UPDATE public.product_batches
       SET qty_remaining = qty_remaining + v_consumption.qty_taken, updated_at = NOW()
     WHERE id = v_consumption.batch_id;
  END LOOP;
  DELETE FROM public.sale_batch_consumption WHERE sale_id = p_id;

  FOR item IN SELECT (x->>'id') AS pid, COALESCE((x->>'quantity')::numeric, 0) AS qty, (x->>'name') AS name
              FROM jsonb_array_elements(v_sale.items) AS x LOOP
    IF v_location IS NOT NULL THEN
      UPDATE public.inventory_balances SET quantity = quantity + item.qty, updated_at = NOW()
       WHERE location_id = v_location AND product_id = item.pid AND tenant_id = v_sale.tenant_id;
    END IF;
    -- products.stock is derived from inventory_balances by trg_sync_product_stock; writing it here deducted the same units a second time.
    INSERT INTO public.movement_log (id, date, product_id, product_name, type, quantity, reason, user_id, tenant_id)
    VALUES (gen_random_uuid()::text, to_char(NOW(), 'YYYY-MM-DD'), item.pid, item.name, 'IN', item.qty,
            'Void sale: ' || p_id || COALESCE(' (' || p_reason || ')', ''),
            COALESCE(p_user_id::text, v_sale."bookedBy"), v_sale.tenant_id);
  END LOOP;

  IF UPPER(COALESCE(v_sale."paymentMethod",'')) = 'CREDIT' AND v_sale."shopId" IS NOT NULL THEN
    UPDATE public.clients
       SET outstanding_balance = GREATEST(0, COALESCE(outstanding_balance,0) - COALESCE(v_sale."totalAmount",0))
     WHERE id = v_sale."shopId" AND tenant_id = v_sale.tenant_id;
  END IF;

  -- Release the booking so it can be billed again.
  UPDATE public.appointments
     SET sale_id = NULL, status = 'BOOKED'
   WHERE sale_id = p_id AND tenant_id = v_sale.tenant_id;

  UPDATE public.sales
     SET voided_at = NOW(),
         void_reason = p_reason,
         "paymentStatus" = 'VOIDED',
         status = 'VOIDED'
   WHERE id = p_id;
END;
$function$;
