-- Add postal/PIN code field to clients
-- state_code remains for GST (2-digit state code)
-- pin_code stores the 6-digit India postal PIN
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS pin_code text DEFAULT NULL;
