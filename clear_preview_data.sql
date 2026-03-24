-- DATA CLEARANCE SCRIPT (PREVIEW RESET)
-- RUN THIS IN YOUR SUPABASE SQL EDITOR TO WIPE ALL TRANSACTIONAL DATA

-- TRUNCATE all transactional tables with CASCADE to handle foreign keys
TRUNCATE TABLE 
    public.products, 
    public.clients, 
    public.sales, 
    public.expenses, 
    public.movement_log, 
    public.vehicles, 
    public.routes, 
    public.users, 
    public.employees, 
    public.payroll, 
    public.day_book, 
    public.mechanic_payments, 
    public.purchases CASCADE;

-- Optional: If you want to clear the custom expense categories as well:
-- DELETE FROM public.settings WHERE key = 'expense_categories';

-- NOTE: This does NOT delete your Auth profiles or Business Profile settings.
