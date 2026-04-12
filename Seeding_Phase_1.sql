-- 🚀 LEDGR ERP: SEEDER PHASE 1 - MASTER DATA (PRODUCTS, CLIENTS, EMPLOYEES)
-- --------------------------------------------------------------------------
-- Objective: Establish the core registry for testing multi-tenant operations.

DO $$ 
DECLARE 
    v_tenant_id UUID := 'a0000000-0000-0000-0000-000000000001';
BEGIN
    -- 1. SEED PRODUCT CATEGORIES
    INSERT INTO public.product_categories (id, name, tenant_id)
    VALUES 
    (gen_random_uuid(), 'Electronics', v_tenant_id),
    (gen_random_uuid(), 'FMCG', v_tenant_id),
    (gen_random_uuid(), 'Logistics', v_tenant_id),
    (gen_random_uuid(), 'Hardware', v_tenant_id)
    ON CONFLICT (id) DO NOTHING;

    -- 2. SEED MASTER PRODUCTS (20 SKUs)
    INSERT INTO public.products (id, sku, name, category, unit, "costPrice", "sellingPrice", stock, "lowStockThreshold", tenant_id, is_seed)
    VALUES 
    ('seeder_prod_1', 'ELE-001', 'Smart Ledger Pro', 'Electronics', 'pcs', 12000, 18000, 50, 5, v_tenant_id, TRUE),
    ('seeder_prod_2', 'ELE-002', 'Wireless Scanner', 'Electronics', 'pcs', 4500, 7500, 30, 5, v_tenant_id, TRUE),
    ('seeder_prod_3', 'FMCG-001', 'Bulk Logistics Tape', 'FMCG', 'box', 450, 800, 200, 20, v_tenant_id, TRUE),
    ('seeder_prod_4', 'HW-001', 'Heavy Duty Pallet', 'Hardware', 'pcs', 2500, 4500, 15, 2, v_tenant_id, TRUE),
    ('seeder_prod_5', 'ELE-003', 'Thermal Printer', 'Electronics', 'pcs', 6500, 9500, 20, 5, v_tenant_id, TRUE),
    ('seeder_prod_6', 'FMCG-002', 'Safety Gloves', 'FMCG', 'set', 150, 350, 500, 50, v_tenant_id, TRUE),
    ('seeder_prod_7', 'FMCG-003', 'Packing Bubble Wrap', 'FMCG', 'ltr', 300, 600, 100, 10, v_tenant_id, TRUE),
    ('seeder_prod_8', 'HW-002', 'Industrial Rack', 'Hardware', 'pcs', 8500, 12500, 10, 2, v_tenant_id, TRUE),
    ('seeder_prod_9', 'ELE-004', 'Battery Backup 5kVA', 'Electronics', 'pcs', 25000, 35000, 5, 2, v_tenant_id, TRUE),
    ('seeder_prod_10', 'HW-003', 'Steel Toolbox', 'Hardware', 'pcs', 1500, 2800, 40, 5, v_tenant_id, TRUE),
    ('seeder_prod_11', 'ELE-005', 'NFC Tag Roll', 'Electronics', 'pcs', 1200, 2500, 100, 10, v_tenant_id, TRUE),
    ('seeder_prod_12', 'FMCG-004', 'Cleaning Solution', 'FMCG', 'ltr', 120, 250, 300, 30, v_tenant_id, TRUE),
    ('seeder_prod_13', 'HW-004', 'Power Drill', 'Hardware', 'pcs', 3200, 5500, 15, 3, v_tenant_id, TRUE),
    ('seeder_prod_14', 'ELE-006', 'Network Router', 'Electronics', 'pcs', 4200, 7200, 12, 4, v_tenant_id, TRUE),
    ('seeder_prod_15', 'FMCG-005', 'Stretch Film', 'FMCG', 'pcs', 250, 450, 150, 15, v_tenant_id, TRUE),
    ('seeder_prod_16', 'HW-005', 'Bolt Set (1000pcs)', 'Hardware', 'box', 800, 1500, 60, 10, v_tenant_id, TRUE),
    ('seeder_prod_17', 'ELE-007', 'Monitor 24 inch', 'Electronics', 'pcs', 9000, 14500, 25, 5, v_tenant_id, TRUE),
    ('seeder_prod_18', 'FMCG-006', 'Hand Sanitizer', 'FMCG', 'ltr', 200, 400, 200, 20, v_tenant_id, TRUE),
    ('seeder_prod_19', 'HW-006', 'Angle Grinder', 'Hardware', 'pcs', 2400, 4200, 10, 2, v_tenant_id, TRUE),
    ('seeder_prod_20', 'ELE-008', 'USB-C Hub', 'Electronics', 'pcs', 800, 1800, 80, 10, v_tenant_id, TRUE)
    ON CONFLICT (id) DO NOTHING;

    -- 3. SEED CLIENT DIRECTORY
    INSERT INTO public.clients (id, name, contact, phone, email, outstanding_balance, tenant_id, is_seed)
    VALUES 
    ('seeder_cli_1', 'Future Tech Industries', 'John Doe', '9876543210', 'contact@futuretech.com', 0, v_tenant_id, TRUE),
    ('seeder_cli_2', 'Vertex Retail Corp', 'Alice Smith', '9876543211', 'billing@vertex.com', 0, v_tenant_id, TRUE),
    ('seeder_cli_3', 'Bespoke Logistics', 'Bob Wilson', '9876543212', 'ops@bespoke.com', 0, v_tenant_id, TRUE),
    ('seeder_cli_4', 'Global Essentials Ltd', 'Charlie Brown', '9876543213', 'supply@globalessential.com', 0, v_tenant_id, TRUE)
    ON CONFLICT (id) DO NOTHING;

    -- 4. SEED WORKFORCE (EMPLOYEES)
    INSERT INTO public.employees (id, name, role, daily_rate, department, status, tenant_id, is_seed)
    VALUES 
    ('seeder_emp_1', 'Rajesh Kumar', 'Operations Manager', 1200, 'Operations', 'ACTIVE', v_tenant_id, TRUE),
    ('seeder_emp_2', 'Sunita Rao', 'Sales Executive', 800, 'Sales', 'ACTIVE', v_tenant_id, TRUE)
    ON CONFLICT (id) DO NOTHING;

    -- 5. SEED FLEET (VEHICLES)
    INSERT INTO public.vehicles (id, name, plate, type, status, tenant_id)
    VALUES 
    ('seeder_veh_1', 'Main Delivery Van', 'KA-01-M-1234', 'Van', 'ACTIVE', v_tenant_id)
    ON CONFLICT (id) DO NOTHING;

    -- 6. SEED INVENTORY LOCATIONS
    INSERT INTO public.inventory_locations (id, name, type, tenant_id)
    VALUES 
    ('00000000-0000-0000-0000-000000000001', 'Main Warehouse', 'WAREHOUSE', v_tenant_id)
    ON CONFLICT (id) DO NOTHING;

    -- 7. INITIAL INVENTORY BALANCES (Mirror stock from products)
    INSERT INTO public.inventory_balances (product_id, location_id, quantity, tenant_id)
    SELECT p.id, '00000000-0000-0000-0000-000000000001', p.stock, p.tenant_id
    FROM public.products p
    WHERE p.is_seed = TRUE
    ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = EXCLUDED.quantity;

END $$;
