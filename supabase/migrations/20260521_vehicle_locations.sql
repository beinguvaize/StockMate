-- vehicle_locations: real-time GPS positions broadcast by driver mobile app
-- Read by VehicleLiveMap.jsx via Supabase Realtime

CREATE TABLE IF NOT EXISTS vehicle_locations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vehicle_id    uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  lat           numeric(10, 7) NOT NULL,
  lng           numeric(10, 7) NOT NULL,
  speed         numeric(6, 2),           -- km/h, nullable
  heading       numeric(5, 2),           -- degrees 0-360, nullable
  accuracy      numeric(6, 2),           -- metres, nullable
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- One row per vehicle per tenant; upsert replaces on conflict
  CONSTRAINT vehicle_locations_vehicle_unique UNIQUE (tenant_id, vehicle_id)
);

-- Index for live-map queries
CREATE INDEX IF NOT EXISTS idx_vehicle_locations_tenant
  ON vehicle_locations (tenant_id, updated_at DESC);

-- RLS
ALTER TABLE vehicle_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON vehicle_locations
  USING (tenant_id = (
    SELECT tenant_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "tenant_insert" ON vehicle_locations
  FOR INSERT WITH CHECK (tenant_id = (
    SELECT tenant_id FROM users WHERE id = auth.uid()
  ));

-- Realtime publication (so VehicleLiveMap.jsx subscription works)
ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_locations;
