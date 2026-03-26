-- ==========================================
-- SECURE PRODUCTION DATABASE (RLS POLICIES)
-- ==========================================

-- 1. Enable RLS on all tables
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_book ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movement_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mechanic_payments ENABLE ROW LEVEL SECURITY;

-- 2. Create a security helper function
-- Checks if the authenticated user has 'OWNER' or 'ADMIN' role in public.users
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()::text 
    AND ('OWNER' = ANY(roles) OR 'ADMIN' = ANY(roles) OR 'GLOBAL_ADMIN' = ANY(roles))
    AND status = 'ACTIVE'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Apply "Admin Full Access" policy to all tables
-- This ensures ONLY users you explicitly grant roles to can see/edit data.

CREATE POLICY "Admin Full Access" ON public.products FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin Full Access" ON public.clients FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin Full Access" ON public.sales FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin Full Access" ON public.expenses FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin Full Access" ON public.employees FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin Full Access" ON public.payroll FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin Full Access" ON public.business_profile FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin Full Access" ON public.day_book FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin Full Access" ON public.settings FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin Full Access" ON public.client_payments FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin Full Access" ON public.users FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin Full Access" ON public.vehicles FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin Full Access" ON public.movement_log FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin Full Access" ON public.routes FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin Full Access" ON public.purchases FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin Full Access" ON public.mechanic_payments FOR ALL TO authenticated USING (public.is_admin());

-- 4. Special policy for the 'users' table 
-- Allow users to see their own profile even if they aren't admin yet (for the login handshake)
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT TO authenticated USING (id = auth.uid()::text);
