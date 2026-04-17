-- GL-01 Migration: Virtual General Ledger Schema
-- Follows established RLS pattern from 20260416_harden_rls_plans.sql

-- 1. Enum Types (IF NOT EXISTS for idempotency)
DO $$ BEGIN
    CREATE TYPE account_type AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE normal_balance AS ENUM ('DEBIT', 'CREDIT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. GL Accounts (Chart of Accounts)
CREATE TABLE IF NOT EXISTS gl_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    type account_type NOT NULL,
    category TEXT NOT NULL,
    normal_balance normal_balance NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

-- 3. GL Journals (Transaction Header)
CREATE TABLE IF NOT EXISTS gl_journals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reference_type TEXT NOT NULL, -- e.g., 'SALE', 'EXPENSE', 'PURCHASE', 'PAYMENT', 'PAYROLL'
    reference_id TEXT,             -- ID of the source record
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. GL Lines (Transaction Lines — Double Entry)
CREATE TABLE IF NOT EXISTS gl_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    journal_id UUID REFERENCES gl_journals(id) ON DELETE CASCADE NOT NULL,
    account_id UUID REFERENCES gl_accounts(id) ON DELETE RESTRICT NOT NULL,
    debit NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
    credit NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Exactly one side must be positive (enforced at trigger/app layer for flexibility).
    -- We allow 0/0 rows only if they're part of a balanced journal.
    CHECK (debit >= 0 AND credit >= 0)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_gl_accounts_tenant ON gl_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gl_journals_tenant_date ON gl_journals(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_gl_journals_reference ON gl_journals(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_gl_lines_tenant_account ON gl_lines(tenant_id, account_id);
CREATE INDEX IF NOT EXISTS idx_gl_lines_journal ON gl_lines(journal_id);

-- 5. Row Level Security — Matches existing hardened RLS pattern
ALTER TABLE gl_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_lines ENABLE ROW LEVEL SECURITY;

-- Uses the established pattern: is_tenant_admin() AND (own_tenant OR global_admin bypass)
CREATE POLICY "Tenant Scoped Access" ON gl_accounts
    FOR ALL TO authenticated
    USING (public.is_tenant_admin() AND (tenant_id = public.current_tenant_id() OR public.is_global_admin()))
    WITH CHECK (public.is_tenant_admin() AND (tenant_id = public.current_tenant_id() OR public.is_global_admin()));

CREATE POLICY "Tenant Scoped Access" ON gl_journals
    FOR ALL TO authenticated
    USING (public.is_tenant_admin() AND (tenant_id = public.current_tenant_id() OR public.is_global_admin()))
    WITH CHECK (public.is_tenant_admin() AND (tenant_id = public.current_tenant_id() OR public.is_global_admin()));

CREATE POLICY "Tenant Scoped Access" ON gl_lines
    FOR ALL TO authenticated
    USING (public.is_tenant_admin() AND (tenant_id = public.current_tenant_id() OR public.is_global_admin()))
    WITH CHECK (public.is_tenant_admin() AND (tenant_id = public.current_tenant_id() OR public.is_global_admin()));

-- 6. Trigger to Seed Default Chart of Accounts on Tenant Creation
-- SECURITY DEFINER is required because this trigger fires under the creating user's session,
-- whose get_my_tenant_id() may not match the NEW tenant being created (e.g., Global Admin).
CREATE OR REPLACE FUNCTION seed_tenant_chart_of_accounts()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO gl_accounts (tenant_id, code, name, type, category, normal_balance) VALUES
        (NEW.id, '1000', 'Cash & Bank', 'ASSET', 'Current Assets', 'DEBIT'),
        (NEW.id, '1100', 'Accounts Receivable', 'ASSET', 'Current Assets', 'DEBIT'),
        (NEW.id, '1200', 'Inventory', 'ASSET', 'Current Assets', 'DEBIT'),
        (NEW.id, '1500', 'Fixed Assets (Vehicles)', 'ASSET', 'Non-Current Assets', 'DEBIT'),
        
        (NEW.id, '2000', 'Accounts Payable', 'LIABILITY', 'Current Liabilities', 'CREDIT'),
        (NEW.id, '2100', 'Accrued Payroll', 'LIABILITY', 'Current Liabilities', 'CREDIT'),
        (NEW.id, '2200', 'Tax Payable (GST)', 'LIABILITY', 'Current Liabilities', 'CREDIT'),
        
        (NEW.id, '3000', 'Owner Equity', 'EQUITY', 'Equity', 'CREDIT'),
        (NEW.id, '3100', 'Retained Earnings', 'EQUITY', 'Equity', 'CREDIT'),
        
        (NEW.id, '4000', 'Sales Revenue', 'REVENUE', 'Operating Revenue', 'CREDIT'),
        
        (NEW.id, '5000', 'Cost of Goods Sold', 'EXPENSE', 'Operating Expenses', 'DEBIT'),
        (NEW.id, '5100', 'Payroll Expense', 'EXPENSE', 'Operating Expenses', 'DEBIT'),
        (NEW.id, '5200', 'Operating Expenses', 'EXPENSE', 'Operating Expenses', 'DEBIT'),
        (NEW.id, '5300', 'Fleet & Logistics', 'EXPENSE', 'Operating Expenses', 'DEBIT');
        
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop if it already exists to avoid duplicate trigger errors
DROP TRIGGER IF EXISTS trg_seed_chart_of_accounts ON tenants;
CREATE TRIGGER trg_seed_chart_of_accounts
AFTER INSERT ON tenants
FOR EACH ROW EXECUTE FUNCTION seed_tenant_chart_of_accounts();

-- 7. Backfill Existing Tenants (idempotent — skips if already seeded)
DO $$ 
DECLARE
    t RECORD;
BEGIN
    FOR t IN SELECT id FROM tenants LOOP
        IF NOT EXISTS (SELECT 1 FROM gl_accounts WHERE tenant_id = t.id) THEN
            INSERT INTO gl_accounts (tenant_id, code, name, type, category, normal_balance) VALUES
            (t.id, '1000', 'Cash & Bank', 'ASSET', 'Current Assets', 'DEBIT'),
            (t.id, '1100', 'Accounts Receivable', 'ASSET', 'Current Assets', 'DEBIT'),
            (t.id, '1200', 'Inventory', 'ASSET', 'Current Assets', 'DEBIT'),
            (t.id, '1500', 'Fixed Assets (Vehicles)', 'ASSET', 'Non-Current Assets', 'DEBIT'),
            
            (t.id, '2000', 'Accounts Payable', 'LIABILITY', 'Current Liabilities', 'CREDIT'),
            (t.id, '2100', 'Accrued Payroll', 'LIABILITY', 'Current Liabilities', 'CREDIT'),
            (t.id, '2200', 'Tax Payable (GST)', 'LIABILITY', 'Current Liabilities', 'CREDIT'),
            
            (t.id, '3000', 'Owner Equity', 'EQUITY', 'Equity', 'CREDIT'),
            (t.id, '3100', 'Retained Earnings', 'EQUITY', 'Equity', 'CREDIT'),
            
            (t.id, '4000', 'Sales Revenue', 'REVENUE', 'Operating Revenue', 'CREDIT'),
            
            (t.id, '5000', 'Cost of Goods Sold', 'EXPENSE', 'Operating Expenses', 'DEBIT'),
            (t.id, '5100', 'Payroll Expense', 'EXPENSE', 'Operating Expenses', 'DEBIT'),
            (t.id, '5200', 'Operating Expenses', 'EXPENSE', 'Operating Expenses', 'DEBIT'),
            (t.id, '5300', 'Fleet & Logistics', 'EXPENSE', 'Operating Expenses', 'DEBIT');
        END IF;
    END LOOP;
END $$;
