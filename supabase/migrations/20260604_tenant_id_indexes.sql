-- Scaling baseline: add missing tenant_id indexes.
--
-- Audit (2026-06) found ~55 hot tables already indexed on tenant_id, and these
-- transactional tables with a tenant_id column but no supporting index. Every
-- per-tenant query (and RLS policy) filters on tenant_id, so these need it
-- before volume grows. Tables are currently tiny, so a plain CREATE INDEX is
-- lock-free in practice and migration-safe (runs inside the migration tx).
-- IF NOT EXISTS keeps this idempotent across environments.

CREATE INDEX IF NOT EXISTS idx_linked_payments_tenant_id     ON public.linked_payments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_loan_transactions_tenant_id   ON public.loan_transactions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_tenant_id ON public.loyalty_transactions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_tenant_id     ON public.stock_transfers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_tenant_id     ON public.warehouse_stock (tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_tenant_id        ON public.client_notes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_attachments_tenant_id         ON public.attachments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_reminders_tenant_id   ON public.service_reminders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_van_damage_records_tenant_id  ON public.van_damage_records (tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_locations_tenant_id   ON public.vehicle_locations (tenant_id);
