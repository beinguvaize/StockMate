-- Auto-create an inventory_location of type VEHICLE whenever a vehicle row is inserted.
-- This means LoadVan can always find the location without needing to create it on the fly.

CREATE OR REPLACE FUNCTION public.auto_create_vehicle_inventory_location()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only create if one doesn't already exist for this vehicle
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_locations
    WHERE tenant_id = NEW.tenant_id
      AND type = 'VEHICLE'
      AND reference_id = NEW.id::text
  ) THEN
    INSERT INTO public.inventory_locations (tenant_id, name, type, reference_id)
    VALUES (
      NEW.tenant_id,
      'Van — ' || COALESCE(NEW.name, NEW."plateNumber", 'Unknown'),
      'VEHICLE',
      NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicle_create_inventory_location ON public.vehicles;

CREATE TRIGGER trg_vehicle_create_inventory_location
  AFTER INSERT ON public.vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_vehicle_inventory_location();

-- Backfill: create locations for existing vehicles that don't have one yet
INSERT INTO public.inventory_locations (tenant_id, name, type, reference_id)
SELECT
  v.tenant_id,
  'Van — ' || COALESCE(v.name, v."plateNumber", 'Unknown'),
  'VEHICLE',
  v.id::text
FROM public.vehicles v
WHERE NOT EXISTS (
  SELECT 1 FROM public.inventory_locations il
  WHERE il.tenant_id = v.tenant_id
    AND il.type = 'VEHICLE'
    AND il.reference_id = v.id::text
);
