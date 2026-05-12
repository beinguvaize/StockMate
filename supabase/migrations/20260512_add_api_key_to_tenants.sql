-- Add API key column to tenants table for Enterprise plan API access
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS api_key text;
