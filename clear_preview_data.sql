-- ULTIMATE DATA CLEARANCE SCRIPT (FULL RESET)
-- WARNING: This will delete ALL data including users, profiles, and settings.

TRUNCATE TABLE 
    public.profiles,
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
    public.business_profile, 
    public.settings, 
    public.day_book, 
    public.mechanic_payments, 
    public.purchases,
    public.client_payments CASCADE;

-- Run this in both Dev and Prod projects to ensure a completely clean start.
