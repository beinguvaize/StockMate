-- GL-01 Migration: Financial Statements RPC
-- Called by BalanceSheetReport.jsx and TrialBalanceReport.jsx

CREATE OR REPLACE FUNCTION get_gl_balances(p_tenant_id UUID)
RETURNS TABLE (
    account_id UUID,
    code TEXT,
    name TEXT,
    type account_type,
    category TEXT,
    normal_balance normal_balance,
    total_debit NUMERIC,
    total_credit NUMERIC,
    balance NUMERIC
) AS $$
BEGIN
    -- Security: Allow own tenant OR Global Admin (for Nexus Console impersonation)
    IF p_tenant_id != public.current_tenant_id() AND NOT public.is_global_admin() THEN
        RAISE EXCEPTION 'Access denied: cannot query another tenant''s ledger';
    END IF;

    RETURN QUERY
    SELECT
      a.id AS account_id, 
      a.code, 
      a.name, 
      a.type, 
      a.category, 
      a.normal_balance,
      COALESCE(SUM(l.debit), 0)::NUMERIC AS total_debit,
      COALESCE(SUM(l.credit), 0)::NUMERIC AS total_credit,
      CASE
         WHEN a.normal_balance = 'DEBIT' THEN COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0)
         ELSE COALESCE(SUM(l.credit), 0) - COALESCE(SUM(l.debit), 0)
      END::NUMERIC AS balance
    FROM gl_accounts a
    LEFT JOIN gl_lines l ON a.id = l.account_id
    WHERE a.tenant_id = p_tenant_id
    GROUP BY a.id, a.code, a.name, a.type, a.category, a.normal_balance
    ORDER BY a.code ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
