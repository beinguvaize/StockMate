-- SQL STABILIZATION SCRIPT
-- RUN THIS IN YOUR SUPABASE SQL EDITOR TO FIX SCHEMA MISMATCHES

-- 1. Add lowStockThreshold to products
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS "lowStockThreshold" numeric DEFAULT 10;

-- 2. Add department to employees
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS "department" text;

-- 3. Add phone and email to clients (if not exists)
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS "phone" text,
ADD COLUMN IF NOT EXISTS "email" text;

-- 4. Ensure RLS is updated (Optional but recommended)
-- ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all for authenticated" ON public.products FOR ALL USING (auth.role() = 'authenticated');
