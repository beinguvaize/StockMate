-- 🚀 LEDGR ERP: SEEDER PHASE 3 - HISTORICAL ERP FIDELITY (RE-FINAL-2)
-- --------------------------------------------------
-- This script populates historical trends and efficiency metrics.

DO $$ 
DECLARE 
    d DATE;
    i INTEGER;
    sale_id TEXT;
    cli_id TEXT;
    prod_id TEXT;
BEGIN
    -- 1. REVENUE TREND: Last 14 Days of Daily Sales
    FOR i IN 0..13 LOOP
        d := CURRENT_DATE - i;
        cli_id := 'seeder_cli_' || (floor(random() * 4) + 1)::text;
        
        -- Cash Sale for the day
        sale_id := 'seed_trend_cash_' || i;
        INSERT INTO public.sales (id, "shopId", "paymentMethod", "paymentStatus", "totalAmount", date, status, payment_type, is_seed)
        VALUES (
            sale_id, cli_id, 'CASH', 'PAID', 
            floor(random() * 3000 + 2000), 
            d::text, 'COMPLETED', 'cash', TRUE
        ) ON CONFLICT (id) DO NOTHING;

        -- Credit Sale for the day
        sale_id := 'seed_trend_credit_' || i;
        INSERT INTO public.sales (id, "shopId", "paymentMethod", "paymentStatus", "totalAmount", date, status, payment_type, is_seed)
        VALUES (
            sale_id, cli_id, 'CREDIT', 'PENDING', 
            floor(random() * 2000 + 1000), 
            d::text, 'COMPLETED', 'credit', TRUE
        ) ON CONFLICT (id) DO NOTHING;

        -- Daily Expense to show in Trend Chart
        INSERT INTO public.expenses (id, category, amount, note, date, is_seed)
        VALUES (
            'seed_trend_exp_' || i,
            'Fuel', 
            floor(random() * 500 + 300), 
            'Daily operational fuel', 
            d::text, TRUE
        ) ON CONFLICT (id) DO NOTHING;
    END LOOP;

    -- 2. ROUTE COVERAGE: 5 Completed Routes
    FOR i IN 1..5 LOOP
        INSERT INTO public.routes (id, "vehicleId", "driverId", status, date, location)
        VALUES (
            'seeder_route_comp_' || i, 
            'seeder_veh_1', 'seeder_emp_1', 
            'COMPLETED', 
            (CURRENT_DATE - i)::text, 
            'Route Hub ' || i
        ) ON CONFLICT (id) DO NOTHING;
    END LOOP;

    -- 3. STOCK TURNOVER: 20 Outbound Logs
    FOR i IN 1..20 LOOP
        prod_id := 'seeder_prod_' || (floor(random() * 19) + 1)::text;
        INSERT INTO public.movement_log (id, date, product_id, product_name, type, quantity, reason, is_seed)
        VALUES (
            'seed_mov_out_' || i,
            (CURRENT_DATE - (i % 7))::text,
            prod_id,
            'Seeded Product ' || i,
            'OUT',
            floor(random() * 10 + 5),
            'Sale Dispatch',
            TRUE
        ) ON CONFLICT (id) DO NOTHING;
    END LOOP;

    -- 4. MONTHLY PURCHASES: Bulk Intake
    FOR i IN 1..5 LOOP
        INSERT INTO public.purchases (id, product_id, quantity, total_amount, date, supplier_name)
        VALUES (
            'seed_pur_month_' || i, 
            'seeder_prod_' || i, 
            100, 4500, 
            (CURRENT_DATE - (i * 3))::text, 
            'Industrial Supplies'
        ) ON CONFLICT (id) DO NOTHING;
    END LOOP;

END $$;
