-- 🚀 LEDGR ERP: SEEDER PHASE 2 - DASHBOARD KPI POPULATION
-- --------------------------------------------------
-- This script ensures no dashboard metrics show zero by populating "Today’s" data.

DO $$ 
DECLARE 
    curr_date_str TEXT := CURRENT_DATE::text;
    v_tenant_id UUID := 'a0000000-0000-0000-0000-000000000001';
BEGIN
    -- 1. DAY BOOK: Today's Summary
    INSERT INTO public.day_book (id, date, opening_balance, total_sales, total_expenses, closing_balance, is_closed, tenant_id)
    VALUES (
        'seed_db_today', 
        curr_date_str, 
        25000, 
        5420, 
        1200, 
        29220, 
        FALSE,
        v_tenant_id
    ) ON CONFLICT (date, tenant_id) DO UPDATE SET 
        opening_balance = EXCLUDED.opening_balance,
        total_sales = EXCLUDED.total_sales,
        total_expenses = EXCLUDED.total_expenses,
        closing_balance = EXCLUDED.closing_balance;

    -- 2. PURCHASES: Today's Intake (3 Entries)
    INSERT INTO public.purchases (id, product_id, quantity, total_amount, date, supplier_name, tenant_id)
    VALUES 
    ('seed_pur_today_1', 'seeder_prod_1', 100, 4500, curr_date_str, 'Global Suppliers Ltd', v_tenant_id),
    ('seed_pur_today_2', 'seeder_prod_9', 50, 1250, curr_date_str, 'Local Essentials', v_tenant_id),
    ('seed_pur_today_3', 'seeder_prod_7', 20, 3600, curr_date_str, 'Packing Pros', v_tenant_id)
    ON CONFLICT (id) DO NOTHING;

    -- 3. LOGISTICS: Vehicle and Route
    -- Register a vehicle if it doesn't exist
    INSERT INTO public.vehicles (id, name, plate, status, type, tenant_id)
    VALUES ('seeder_veh_1', 'Express Delivery Van', 'WB-01-1234', 'ACTIVE', 'Van', v_tenant_id)
    ON CONFLICT (id) DO NOTHING;

    -- Register a route for today
    INSERT INTO public.routes (id, "vehicleId", "driverId", status, date, location, tenant_id)
    VALUES ('seeder_route_today', 'seeder_veh_1', 'seeder_emp_1', 'ACTIVE', curr_date_str, 'Salt Lake Sector V', v_tenant_id)
    ON CONFLICT (id) DO NOTHING;

    -- 4. STAFFING: Earned vs Paid (For "Salary Pending" KPI)
    UPDATE public.employees 
    SET daily_rate = 800, days_worked = 25, amount_paid = 16000 -- Earned 20k, Pending 4k
    WHERE id = 'seeder_emp_1' AND tenant_id = v_tenant_id;
    
    UPDATE public.employees 
    SET daily_rate = 600, days_worked = 22, amount_paid = 11000 -- Earned 13.2k, Pending 2.2k
    WHERE id = 'seeder_emp_2' AND tenant_id = v_tenant_id;

    -- 5. DEBTORS: Outstanding Balances
    UPDATE public.clients 
    SET outstanding_balance = 12500 
    WHERE id = 'seeder_cli_1' AND tenant_id = v_tenant_id;
    
    UPDATE public.clients 
    SET outstanding_balance = 8400 
    WHERE id = 'seeder_cli_2' AND tenant_id = v_tenant_id;

    -- 6. INVENTORY: Low Stock Alert
    UPDATE public.products 
    SET stock = 4, "lowStockThreshold" = 10 
    WHERE id = 'seeder_prod_4' AND tenant_id = v_tenant_id;
    
    UPDATE public.products 
    SET stock = 2, "lowStockThreshold" = 5 
    WHERE id = 'seeder_prod_8' AND tenant_id = v_tenant_id;

END $$;
