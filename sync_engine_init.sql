-- SUPREME DATA SYNCHRONIZATION ENGINE: CLIENT OUTSTANDING BALANCE
-- Automatically maintains `clients.outstanding_balance` by syncing it with the `invoices` and `sales` tables.

-- 1. Create the recalculation function
CREATE OR REPLACE FUNCTION public.sync_client_outstanding_balance(p_client_id uuid)
RETURNS void AS $$
DECLARE
    v_invoice_due numeric;
    v_sale_due numeric;
BEGIN
    -- Sum unpaid GST invoices
    SELECT COALESCE(SUM(grand_total - COALESCE(paid_amount, 0)), 0)
    INTO v_invoice_due
    FROM public.invoices
    WHERE client_id = p_client_id AND payment_status != 'PAID';

    -- Sum unpaid legacy sales (assuming shopId matches client id text)
    SELECT COALESCE(SUM("totalAmount"), 0)
    INTO v_sale_due
    FROM public.sales
    WHERE "shopId" = p_client_id::text AND "paymentStatus" != 'PAID';

    -- Update the client table
    UPDATE public.clients
    SET outstanding_balance = v_invoice_due + v_sale_due
    WHERE id = p_client_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create the trigger function
CREATE OR REPLACE FUNCTION public.on_invoice_payment_sync()
RETURNS trigger AS $$
BEGIN
    -- Sync for the affected client
    IF (TG_OP = 'DELETE') THEN
        PERFORM public.sync_client_outstanding_balance(OLD.client_id);
        RETURN OLD;
    ELSIF (TG_OP = 'INSERT') THEN
         PERFORM public.sync_client_outstanding_balance(NEW.client_id);
         RETURN NEW;
    ELSE
        -- For UPDATE, sync both OLD and NEW client (in case client changed, though unlikely)
        PERFORM public.sync_client_outstanding_balance(OLD.client_id);
        IF (OLD.client_id <> NEW.client_id) THEN
            PERFORM public.sync_client_outstanding_balance(NEW.client_id);
        END IF;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create the trigger for Invoices
DROP TRIGGER IF EXISTS trigger_sync_invoice_payment ON public.invoices;
CREATE TRIGGER trigger_sync_invoice_payment
AFTER INSERT OR UPDATE OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.on_invoice_payment_sync();

-- 4. Initial Sync: Fix all current outstanding balances
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.clients LOOP
        PERFORM public.sync_client_outstanding_balance(r.id);
    END LOOP;
END;
$$;
