--
-- PostgreSQL database dump
--

\restrict XSxCjTGNKg6KF5sF3EWgA6aPeIFaM5xhR79y4KGLZCb7WNBA5omxQEIMBjiNCg2

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- CREATE SCHEMA public; (already exists)


--
-- Name: account_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.account_type AS ENUM (
    'ASSET',
    'LIABILITY',
    'EQUITY',
    'REVENUE',
    'EXPENSE'
);


--
-- Name: normal_balance; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.normal_balance AS ENUM (
    'DEBIT',
    'CREDIT'
);


--
-- Name: adjust_inventory_atomic(text, uuid, numeric, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.adjust_inventory_atomic(p_product_id text, p_location_id uuid, p_amount numeric, p_reason text, p_user_id text, p_tenant_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_actual_location_id uuid := p_location_id;
    v_main_warehouse_id  uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
    -- Resolve warehouse location if none provided
    IF v_actual_location_id IS NULL THEN
        SELECT id INTO v_actual_location_id
        FROM public.inventory_locations
        WHERE tenant_id = p_tenant_id AND type = 'WAREHOUSE'
        LIMIT 1;

        IF v_actual_location_id IS NULL THEN
            v_actual_location_id := v_main_warehouse_id;
        END IF;
    END IF;

    -- Upsert into inventory_balances — fires trg_sync_product_stock
    INSERT INTO public.inventory_balances (product_id, location_id, quantity, tenant_id)
    VALUES (p_product_id, v_actual_location_id, p_amount, p_tenant_id)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET
        quantity   = GREATEST(0, public.inventory_balances.quantity + EXCLUDED.quantity),
        updated_at = NOW();

    -- Record movement log
    INSERT INTO public.movement_log (id, product_id, type, quantity, reason, user_id, tenant_id, date)
    VALUES (
        'LOG-' || floor(extract(epoch from now())) || '-' || substr(md5(random()::text), 1, 5),
        p_product_id,
        CASE WHEN p_amount >= 0 THEN 'IN' ELSE 'OUT' END,
        ABS(p_amount),
        p_reason,
        p_user_id,
        p_tenant_id,
        NOW()
    );
END;
$$;


--
-- Name: apply_client_balance_delta(text, numeric, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_client_balance_delta(p_client_id text, p_delta numeric, p_tenant_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.clients
  SET outstanding_balance = GREATEST(0, COALESCE(outstanding_balance, 0) + p_delta)
  WHERE id = p_client_id AND tenant_id = p_tenant_id;
END;
$$;


--
-- Name: apply_product_stock_delta(text, numeric, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_product_stock_delta(p_product_id text, p_delta numeric, p_tenant_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.products
  SET stock = GREATEST(0, COALESCE(stock, 0) + p_delta)
  WHERE id = p_product_id AND tenant_id = p_tenant_id;
END;
$$;


--
-- Name: create_staff_account(text, text, text[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_staff_account(new_email text, new_password text, new_roles text[], new_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  new_userId UUID;
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, is_super_admin
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated', 'authenticated',
    new_email,
    crypt(new_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('name', new_name, 'roles', new_roles),
    now(), now(), '', false
  )
  RETURNING id INTO new_userId;

  INSERT INTO public.users (id, email, name, roles, status)
  VALUES (new_userId, new_email, new_name, new_roles, 'ACTIVE')
  ON CONFLICT (id) DO UPDATE SET roles = new_roles;

  RETURN new_userId;
END;
$$;


--
-- Name: create_staff_account(text, text, text[], text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_staff_account(p_email text, p_password text, p_roles text[], p_name text, p_tenant_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  new_userId UUID;
BEGIN
  -- Insert into auth.users (Standard Supabase Auth)
  -- Note: We include tenant_id in user_metadata for easy access via JWT
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, is_super_admin
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated', 'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('name', p_name, 'roles', p_roles, 'tenant_id', p_tenant_id),
    now(), now(), '', false
  )
  RETURNING id INTO new_userId;

  -- Insert into public.users with the correct tenant_id
  INSERT INTO public.users (id, email, name, roles, status, tenant_id)
  VALUES (new_userId, p_email, p_name, p_roles, 'ACTIVE', p_tenant_id)
  ON CONFLICT (id) DO UPDATE 
  SET roles = p_roles, 
      tenant_id = EXCLUDED.tenant_id,
      name = EXCLUDED.name;

  RETURN new_userId;
END;
$$;


--
-- Name: current_tenant_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_tenant_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    -- 1. Try to get tenant_id from JWT claims
    (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid,
    
    -- 2. Fallback to querying public.users
    (SELECT tenant_id::uuid FROM public.users WHERE id = (auth.uid())::text LIMIT 1)
  );
$$;


--
-- Name: get_gl_balances(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_gl_balances(p_tenant_id uuid) RETURNS TABLE(account_id uuid, code text, name text, type public.account_type, category text, normal_balance public.normal_balance, total_debit numeric, total_credit numeric, balance numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
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
$$;


--
-- Name: get_my_tenant_plan(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_tenant_plan() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT t.plan
  FROM public.tenants t
  WHERE t.id = public.current_tenant_id()
  LIMIT 1
$$;


--
-- Name: get_next_invoice_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_next_invoice_number() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    next_num INTEGER;
    prefix TEXT := 'INV-';
    year_prefix TEXT := to_char(current_date, 'YY');
BEGIN
    -- Increment and fetch the counter atomically
    UPDATE public.settings 
    SET value = (value::int + 1)::text::jsonb,
        updated_at = now()
    WHERE key = 'invoice_counter'
    RETURNING (value::int) INTO next_num;

    -- Return formatted number (e.g., INV-24-1001)
    RETURN prefix || year_prefix || '-' || next_num::text;
END;
$$;


--
-- Name: get_next_invoice_number(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_next_invoice_number(p_tenant_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    next_num INTEGER;
    prefix TEXT := 'INV-';
    year_prefix TEXT := to_char(current_date, 'YY');
BEGIN
    -- Increment and fetch the counter atomically for the specific tenant
    UPDATE public.settings 
    SET value = ((value::text::int + 1)::text)::jsonb
    WHERE key = 'invoice_counter' AND tenant_id = p_tenant_id
    RETURNING (value::text::int) INTO next_num;

    -- Fallback if setting doesn't exist (initialize it)
    IF next_num IS NULL THEN
        INSERT INTO public.settings (key, value, tenant_id)
        VALUES ('invoice_counter', '1'::jsonb, p_tenant_id)
        ON CONFLICT (key, tenant_id) DO UPDATE SET value = '1'::jsonb
        RETURNING (value::text::int) INTO next_num;
    END IF;

    -- Return formatted number (e.g., INV-24-1001)
    RETURN prefix || year_prefix || '-' || LPAD(next_num::text, 4, '0');
END;
$$;


--
-- Name: gl_account_id(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gl_account_id(p_tenant_id uuid, p_code text) RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  SELECT id FROM public.gl_accounts WHERE tenant_id = p_tenant_id AND code = p_code LIMIT 1;
$$;


--
-- Name: gl_assert_journal_balanced(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gl_assert_journal_balanced() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_journal_id uuid;
  v_debit numeric;
  v_credit numeric;
BEGIN
  v_journal_id := COALESCE(NEW.journal_id, OLD.journal_id);
  IF v_journal_id IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.gl_journals WHERE id = v_journal_id) THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
    INTO v_debit, v_credit
    FROM public.gl_lines WHERE journal_id = v_journal_id;
  IF v_debit IS DISTINCT FROM v_credit THEN
    RAISE EXCEPTION 'GL-01 balance violation: journal % debit=% credit=%',
      v_journal_id, v_debit, v_credit;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: gl_drop_source_journal(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gl_drop_source_journal(p_tenant_id uuid, p_ref_type text, p_ref_id text) RETURNS void
    LANGUAGE sql
    AS $$
  DELETE FROM public.gl_journals
   WHERE tenant_id = p_tenant_id
     AND reference_type = p_ref_type
     AND reference_id = p_ref_id;
$$;


--
-- Name: gl_post_client_payments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gl_post_client_payments() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_src record; v_tenant_id uuid; v_ref_id text;
  v_amount numeric; v_journal_id uuid;
BEGIN
  v_src := COALESCE(NEW, OLD);
  v_tenant_id := v_src.tenant_id;
  v_ref_id := v_src.id::text;
  PERFORM public.gl_drop_source_journal(v_tenant_id, 'PAYMENT', v_ref_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  v_amount := COALESCE(NEW.amount, 0);
  IF v_amount = 0 THEN RETURN NEW; END IF;
  INSERT INTO public.gl_journals (tenant_id, reference_type, reference_id, description)
  VALUES (v_tenant_id, 'PAYMENT', v_ref_id, 'Client payment received') RETURNING id INTO v_journal_id;
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
  VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'1000'), v_amount);
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
  VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'1100'), v_amount);
  RETURN NEW;
END;
$$;


--
-- Name: gl_post_expenses(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gl_post_expenses() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_src record; v_tenant_id uuid; v_ref_id text;
  v_amount numeric; v_cat text; v_desc text;
  v_journal_id uuid; v_debit_code text;
BEGIN
  v_src := COALESCE(NEW, OLD);
  v_tenant_id := v_src.tenant_id;
  v_ref_id := v_src.id::text;
  PERFORM public.gl_drop_source_journal(v_tenant_id, 'EXPENSE', v_ref_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  v_amount := COALESCE(NEW.amount, 0);
  v_cat := COALESCE(NEW.category, '');
  v_desc := COALESCE(NEW.note, 'Expense');
  IF v_amount = 0 THEN RETURN NEW; END IF;
  v_debit_code := CASE WHEN upper(v_cat) LIKE '%PAYROLL%' THEN '5100' ELSE '5200' END;
  INSERT INTO public.gl_journals (tenant_id, reference_type, reference_id, description)
  VALUES (v_tenant_id, 'EXPENSE', v_ref_id, v_desc) RETURNING id INTO v_journal_id;
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
  VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id, v_debit_code), v_amount);
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
  VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'1000'), v_amount);
  RETURN NEW;
END;
$$;


--
-- Name: gl_post_purchases(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gl_post_purchases() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_src record; v_tenant_id uuid; v_ref_id text;
  v_total numeric; v_pay_type text; v_journal_id uuid;
BEGIN
  v_src := COALESCE(NEW, OLD);
  v_tenant_id := v_src.tenant_id;
  v_ref_id := v_src.id::text;
  PERFORM public.gl_drop_source_journal(v_tenant_id, 'PURCHASE', v_ref_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  v_total := COALESCE(NEW.total_amount, 0);
  v_pay_type := COALESCE(NEW.payment_type, 'CREDIT');
  IF v_total = 0 THEN RETURN NEW; END IF;
  INSERT INTO public.gl_journals (tenant_id, reference_type, reference_id, description)
  VALUES (v_tenant_id, 'PURCHASE', v_ref_id, 'Stock purchase') RETURNING id INTO v_journal_id;
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
  VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'1200'), v_total);
  IF upper(v_pay_type) = 'CASH' THEN
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
    VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'1000'), v_total);
  ELSE
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
    VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'2000'), v_total);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: gl_post_sales(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gl_post_sales() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_src record; v_tenant_id uuid; v_ref_id text;
  v_total numeric; v_cogs numeric; v_paystatus text; v_status text;
  v_journal_id uuid;
BEGIN
  v_src := COALESCE(NEW, OLD);
  v_tenant_id := v_src.tenant_id;
  v_ref_id := v_src.id::text;
  PERFORM public.gl_drop_source_journal(v_tenant_id, 'SALE', v_ref_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  v_total := COALESCE(NEW."totalAmount", 0);
  v_cogs := COALESCE(NEW."totalCogs", 0);
  v_paystatus := COALESCE(NEW."paymentStatus", 'UNPAID');
  v_status := COALESCE(NEW."status", '');
  IF upper(v_status) = 'CANCELLED' OR v_total = 0 THEN RETURN NEW; END IF;
  INSERT INTO public.gl_journals (tenant_id, reference_type, reference_id, description)
  VALUES (v_tenant_id, 'SALE', v_ref_id, 'Sale posting') RETURNING id INTO v_journal_id;
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
  VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'4000'), v_total);
  IF upper(v_paystatus) = 'PAID' THEN
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
    VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'1000'), v_total);
  ELSE
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
    VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'1100'), v_total);
  END IF;
  IF v_cogs > 0 THEN
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
    VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'5000'), v_cogs);
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
    VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'1200'), v_cogs);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: has_module_access(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_module_access(p_module text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_plan text;
BEGIN
  IF public.is_global_admin() THEN
    RETURN true;
  END IF;

  SELECT public.get_my_tenant_plan() INTO v_plan;

  CASE v_plan
    WHEN 'ENTERPRISE' THEN
      RETURN true;
    WHEN 'PRO' THEN
      RETURN p_module = ANY(ARRAY[
        'dashboard','inventory','sales','clients','expenses','daybook',
        'purchases','suppliers','vehicles','orders','payroll','reports','invoices'
      ]);
    ELSE
      RETURN p_module = ANY(ARRAY[
        'dashboard','inventory','sales','clients','expenses','daybook','invoices'
      ]);
  END CASE;
END;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  -- Using a direct check to avoid recursion on the users table
  -- Note: SELECTing from public.users as SECURITY DEFINER bypasses RLS
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE public.users.id = (auth.uid())::text 
    AND (public.users.roles @> '{OWNER}' OR public.users.roles @> '{GLOBAL_ADMIN}')
  );
$$;


--
-- Name: is_admin_check(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin_check() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  SELECT public.is_admin();
$$;


--
-- Name: is_admin_safe(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin_safe() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE public.users.id = (auth.uid())::text 
    AND (public.users.roles @> '{OWNER}' OR public.users.roles @> '{GLOBAL_ADMIN}')
  );
$$;


--
-- Name: is_global_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_global_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    -- 1. Check JWT claims (jsonb containment)
    (auth.jwt() -> 'user_metadata' -> 'roles') @> '["GLOBAL_ADMIN"]'::jsonb,
    
    -- 2. Fallback to DB check (text[] containment)
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = (auth.uid())::text 
      AND roles @> ARRAY['GLOBAL_ADMIN']::text[]
    )
  );
$$;


--
-- Name: is_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_staff() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE public.users.id = (auth.uid())::text 
    AND (public.users.roles @> '{STAFF}' OR public.users.roles @> '{GLOBAL_ADMIN}' OR public.users.roles @> '{OWNER}')
  );
$$;


--
-- Name: is_tenant_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_tenant_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(
    -- Try to find OWNER or GLOBAL_ADMIN in the JWT user_metadata roles array
    (auth.jwt() -> 'user_metadata' -> 'roles') @> '"OWNER"' OR 
    (auth.jwt() -> 'user_metadata' -> 'roles') @> '"GLOBAL_ADMIN"',
    
    -- Fallback to public.users table just in case
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = (auth.uid())::text 
      AND (roles @> '{OWNER}' OR roles @> '{GLOBAL_ADMIN}')
    )
  );
$$;


--
-- Name: is_tenant_member(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_tenant_member() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = (auth.uid())::text
  );
$$;


--
-- Name: log_audit_event(text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_audit_event(p_action text, p_entity_type text, p_entity_id text, p_summary text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
declare
  v_tenant uuid;
  v_email  text;
begin
  v_tenant := current_tenant_id();
  if v_tenant is null then
    -- Don't silently drop; callers should be tenant-scoped.
    raise exception 'audit_log: no tenant in session';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  insert into public.audit_log
    (tenant_id, actor_id, actor_email, action, entity_type, entity_id, summary, metadata)
  values
    (v_tenant, auth.uid(), v_email, p_action, p_entity_type, p_entity_id, p_summary, coalesce(p_metadata, '{}'::jsonb));
end;
$$;


--
-- Name: on_invoice_payment_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_invoice_payment_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- Sync for the affected client
    IF (TG_OP = 'DELETE') THEN
        IF (OLD.client_id IS NOT NULL) THEN
           PERFORM public.sync_client_outstanding_balance(OLD.client_id);
        END IF;
        RETURN OLD;
    ELSIF (TG_OP = 'INSERT') THEN
         IF (NEW.client_id IS NOT NULL) THEN
            PERFORM public.sync_client_outstanding_balance(NEW.client_id);
         END IF;
         RETURN NEW;
    ELSE
        -- For UPDATE, sync both OLD and NEW client
        IF (OLD.client_id IS NOT NULL) THEN
            PERFORM public.sync_client_outstanding_balance(OLD.client_id);
        END IF;
        IF (NEW.client_id IS NOT NULL AND (OLD.client_id IS NULL OR OLD.client_id <> NEW.client_id)) THEN
            PERFORM public.sync_client_outstanding_balance(NEW.client_id);
        END IF;
        RETURN NEW;
    END IF;
END;
$$;


--
-- Name: process_purchase(text, text, numeric, numeric, text, text, text, text, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_purchase(p_id text, p_product_id text, p_quantity numeric, p_total_amount numeric, p_supplier_id text, p_payment_type text, p_date text, p_notes text, p_user_id text, p_location_id uuid DEFAULT NULL::uuid, p_tenant_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_tenant_id UUID;
  v_target_location UUID;
BEGIN
  -- Resolve tenant_id: 
  -- 1. Use explicitly provided p_tenant_id (priority for Global Admins)
  -- 2. Fallback to user metadata in public.users
  IF p_tenant_id IS NOT NULL THEN
    v_tenant_id := p_tenant_id;
  ELSE
    SELECT tenant_id INTO v_tenant_id FROM public.users WHERE id = p_user_id LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant Resolution Failed: User % has no assigned tenant.', p_user_id;
  END IF;

  -- Default to provided location or search for Main Warehouse
  IF p_location_id IS NOT NULL THEN
    v_target_location := p_location_id;
  ELSE
    SELECT id INTO v_target_location FROM public.inventory_locations 
    WHERE tenant_id = v_tenant_id AND type = 'WAREHOUSE' LIMIT 1;
    
    IF v_target_location IS NULL THEN
      SELECT id INTO v_target_location FROM public.inventory_locations 
      WHERE tenant_id = v_tenant_id LIMIT 1;
    END IF;
  END IF;

  -- Insert Purchase
  INSERT INTO public.purchases (
    id, total_amount, date, linked_product_id, product_id,
    supplier_id, payment_type, notes, quantity, tenant_id
  )
  VALUES (
    p_id, p_total_amount, p_date, p_product_id, p_product_id,
    p_supplier_id, p_payment_type, p_notes, p_quantity, v_tenant_id
  );

  IF p_product_id IS NOT NULL THEN
    -- Update Legacy Stock
    UPDATE public.products 
    SET stock = COALESCE(stock, 0) + p_quantity 
    WHERE id = p_product_id AND tenant_id = v_tenant_id;

    -- Update Location Stock (Inventory Balances)
    IF v_target_location IS NOT NULL THEN
      INSERT INTO public.inventory_balances (location_id, product_id, quantity, tenant_id)
      VALUES (v_target_location, p_product_id, p_quantity, v_tenant_id)
      ON CONFLICT (location_id, product_id, tenant_id) 
      DO UPDATE SET quantity = inventory_balances.quantity + EXCLUDED.quantity, updated_at = now();
    END IF;

    -- Log Movement
    INSERT INTO public.movement_log (id, date, product_id, product_name, type, quantity, reason, user_id, tenant_id)
    VALUES (
      gen_random_uuid()::text, 
      p_date, 
      p_product_id, 
      (SELECT name FROM public.products WHERE id = p_product_id AND tenant_id = v_tenant_id), 
      'IN', 
      p_quantity, 
      'Purchase: ' || p_id, 
      p_user_id, 
      v_tenant_id
    );
  END IF;
END;
$$;


--
-- Name: process_sale(text, text, jsonb, numeric, text, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_sale(p_id text, p_shop_id text, p_items jsonb, p_total_amount numeric, p_payment_method text, p_payment_status text, p_date text, p_user_id text, p_location_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  item record;
  v_tenant_id UUID;
  v_source_location UUID;
BEGIN
  -- Resolve tenant_id from the calling user
  SELECT tenant_id INTO v_tenant_id FROM public.users WHERE id = p_user_id LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'User not found or has no tenant assignment';
  END IF;

  -- Resolve location: explicit param, otherwise tenant's warehouse (auto-create if missing)
  IF p_location_id IS NOT NULL THEN
    v_source_location := p_location_id;
  ELSE
    SELECT id INTO v_source_location
    FROM public.inventory_locations
    WHERE tenant_id = v_tenant_id AND type = 'WAREHOUSE'
    ORDER BY created_at ASC NULLS LAST
    LIMIT 1;

    IF v_source_location IS NULL THEN
      INSERT INTO public.inventory_locations (id, tenant_id, name, type)
      VALUES (gen_random_uuid(), v_tenant_id, 'Main Warehouse', 'WAREHOUSE')
      RETURNING id INTO v_source_location;
    END IF;
  END IF;

  -- Insert the sale with tenant_id
  INSERT INTO public.sales (id, "shopId", items, "totalAmount", "paymentMethod", "paymentStatus", date, "bookedBy", tenant_id, "vehicleId")
  VALUES (
    p_id, p_shop_id, p_items, p_total_amount, p_payment_method, p_payment_status, p_date, p_user_id, v_tenant_id,
    (SELECT reference_id FROM public.inventory_locations WHERE id = v_source_location AND type = 'VEHICLE')
  );

  -- Deduct stock and log movements
  FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(id text, quantity numeric, name text) LOOP
    -- 1. Legacy global product stock (clamp to 0)
    UPDATE public.products
    SET stock = GREATEST(0, COALESCE(stock, 0) - item.quantity)
    WHERE id = item.id AND tenant_id = v_tenant_id;

    -- 2a. Ensure a location balance row exists (seed to 0 when missing)
    INSERT INTO public.inventory_balances (location_id, product_id, quantity, tenant_id)
    VALUES (v_source_location, item.id, 0, v_tenant_id)
    ON CONFLICT (location_id, product_id, tenant_id) DO NOTHING;

    -- 2b. Decrement the balance atomically (clamp to 0)
    UPDATE public.inventory_balances
    SET quantity = GREATEST(0, quantity - item.quantity),
        updated_at = now()
    WHERE location_id = v_source_location
      AND product_id = item.id
      AND tenant_id = v_tenant_id;

    -- 3. Log Movement
    INSERT INTO public.movement_log (id, date, product_id, product_name, type, quantity, reason, user_id, tenant_id)
    VALUES (gen_random_uuid()::text, p_date, item.id, item.name, 'OUT', item.quantity, 'Sale: ' || p_id, p_user_id, v_tenant_id);
  END LOOP;

  -- Update client outstanding balance for credit sales
  IF p_payment_method = 'Credit' THEN
    UPDATE public.clients
    SET outstanding_balance = COALESCE(outstanding_balance, 0) + p_total_amount
    WHERE id = p_shop_id AND tenant_id = v_tenant_id;
  END IF;
END;
$$;


--
-- Name: record_platform_error(uuid, uuid, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_platform_error(p_tenant_id uuid, p_user_id uuid, p_user_role text, p_module text, p_action text, p_error_code text, p_error_message text, p_stack_trace text, p_severity text, p_plan_tier text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_error_id UUID;
BEGIN
    INSERT INTO public.platform_error_logs (
        tenant_id, user_id, user_role, module, action, 
        error_code, error_message, stack_trace, severity, plan_tier
    )
    VALUES (
        p_tenant_id, p_user_id, p_user_role, p_module, p_action, 
        p_error_code, p_error_message, p_stack_trace, p_severity, p_plan_tier
    )
    RETURNING id INTO v_error_id;
    
    RETURN v_error_id;
END;
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: seed_tenant_chart_of_accounts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_tenant_chart_of_accounts() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
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
$$;


--
-- Name: sync_client_outstanding_balance(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_client_outstanding_balance(p_client_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_invoice_due numeric;
    v_sale_due numeric;
BEGIN
    -- Sum unpaid GST invoices
    SELECT COALESCE(SUM(grand_total - COALESCE(paid_amount, 0)), 0)
    INTO v_invoice_due
    FROM public.invoices
    WHERE client_id = p_client_id AND payment_status != 'PAID';

    -- Sum unpaid legacy sales
    SELECT COALESCE(SUM("totalAmount"), 0)
    INTO v_sale_due
    FROM public.sales
    WHERE "shopId" = p_client_id AND "paymentStatus" != 'PAID';

    -- Update the client table
    UPDATE public.clients
    SET outstanding_balance = v_invoice_due + v_sale_due
    WHERE id = p_client_id;
END;
$$;


--
-- Name: sync_client_outstanding_balance(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_client_outstanding_balance(p_client_id text, p_tenant_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_invoice_due numeric;
    v_sale_due numeric;
BEGIN
    -- Sum unpaid GST invoices for this tenant
    SELECT COALESCE(SUM(grand_total - COALESCE(paid_amount, 0)), 0)
    INTO v_invoice_due
    FROM public.invoices
    WHERE client_id = p_client_id AND tenant_id = p_tenant_id AND payment_status != 'PAID';

    -- Sum unpaid legacy sales for this tenant
    SELECT COALESCE(SUM("totalAmount"), 0)
    INTO v_sale_due
    FROM public.sales
    WHERE "shopId" = p_client_id AND tenant_id = p_tenant_id AND "paymentStatus" != 'PAID';

    -- Update the client table
    UPDATE public.clients
    SET outstanding_balance = v_invoice_due + v_sale_due
    WHERE id = p_client_id AND tenant_id = p_tenant_id;
END;
$$;


--
-- Name: sync_product_stock_sum(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_product_stock_sum() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_product_id text;
    v_tenant_id  uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_product_id := OLD.product_id;
        v_tenant_id  := OLD.tenant_id;
    ELSE
        v_product_id := NEW.product_id;
        v_tenant_id  := NEW.tenant_id;
    END IF;

    UPDATE public.products
    SET stock = COALESCE(
        (SELECT SUM(quantity)
         FROM public.inventory_balances
         WHERE product_id = v_product_id
           AND tenant_id  = v_tenant_id),
        0
    )
    WHERE id        = v_product_id
      AND tenant_id = v_tenant_id;

    RETURN NULL; -- Required for AFTER row triggers
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id uuid DEFAULT public.current_tenant_id() NOT NULL,
    actor_id uuid,
    actor_email text,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    summary text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: budgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budgets (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    period text NOT NULL,
    category text NOT NULL,
    amount numeric(14,2) NOT NULL,
    type text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT budgets_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT budgets_type_check CHECK ((type = ANY (ARRAY['REVENUE'::text, 'EXPENSE'::text])))
);


--
-- Name: business_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_profile (
    id text NOT NULL,
    name text,
    address text,
    phone text,
    email text,
    website text,
    country text,
    currency text,
    "currencySymbol" text,
    "taxId" text,
    logo text,
    "lowStockThreshold" numeric DEFAULT 10,
    pan_no text,
    bank_name text,
    account_no text,
    ifsc_code text,
    upi_id text,
    gst_no text DEFAULT ''::text,
    state text DEFAULT ''::text,
    state_code text DEFAULT ''::text,
    logo_url text DEFAULT ''::text,
    invoice_prefix text DEFAULT 'INV'::text,
    invoice_counter integer DEFAULT 1,
    invoice_terms text DEFAULT 'Payment due within 30 days. Goods once sold will not be taken back. Subject to local jurisdiction.'::text,
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL
);


--
-- Name: client_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_payments (
    id text NOT NULL,
    client_id text,
    amount numeric DEFAULT 0,
    date text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL
);


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id text NOT NULL,
    name text,
    contact text,
    phone text,
    address text,
    created_at timestamp with time zone DEFAULT now(),
    balance numeric DEFAULT 0,
    outstanding_balance numeric(10,2) DEFAULT 0,
    email text,
    credit_limit numeric DEFAULT 0,
    gstin text,
    gst_no text DEFAULT ''::text,
    billing_address text DEFAULT ''::text,
    shipping_address text DEFAULT ''::text,
    state text DEFAULT ''::text,
    state_code text DEFAULT ''::text,
    is_seed boolean DEFAULT false,
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: day_book; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.day_book (
    id text NOT NULL,
    date text NOT NULL,
    opening_balance numeric DEFAULT 0,
    closing_balance numeric DEFAULT 0,
    total_sales numeric DEFAULT 0,
    total_expenses numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    is_closed boolean DEFAULT false,
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id text NOT NULL,
    name text,
    role text,
    salary numeric,
    status text DEFAULT 'ACTIVE'::text,
    created_at text,
    daily_rate numeric DEFAULT 0,
    days_worked numeric DEFAULT 0,
    amount_paid numeric(10,2) DEFAULT 0,
    department text,
    email text,
    phone text,
    "position" text,
    pay_type text,
    bank_account text,
    notes text,
    is_seed boolean DEFAULT false,
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id text NOT NULL,
    category text,
    amount numeric,
    note text,
    date text,
    route_id text,
    created_at timestamp with time zone DEFAULT now(),
    split_type text,
    is_seed boolean DEFAULT false,
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL
);


--
-- Name: gl_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gl_accounts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    type public.account_type NOT NULL,
    category text NOT NULL,
    normal_balance public.normal_balance NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: gl_journals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gl_journals (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    date timestamp with time zone DEFAULT now() NOT NULL,
    reference_type text NOT NULL,
    reference_id text,
    description text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: gl_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gl_lines (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    journal_id uuid NOT NULL,
    account_id uuid NOT NULL,
    debit numeric(15,2) DEFAULT 0 NOT NULL,
    credit numeric(15,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT gl_lines_credit_check CHECK ((credit >= (0)::numeric)),
    CONSTRAINT gl_lines_debit_check CHECK ((debit >= (0)::numeric))
);


--
-- Name: inventory_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_balances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid,
    product_id text NOT NULL,
    quantity double precision DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL
);


--
-- Name: inventory_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    reference_id text,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    CONSTRAINT inventory_locations_type_check CHECK ((type = ANY (ARRAY['WAREHOUSE'::text, 'VEHICLE'::text])))
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id text NOT NULL,
    date timestamp with time zone DEFAULT now(),
    client_id text,
    sale_id text,
    amount numeric(15,2),
    status text DEFAULT 'DRAFT'::text,
    due_date timestamp with time zone,
    is_seed boolean DEFAULT false,
    invoice_number text,
    grand_total numeric DEFAULT 0,
    taxable_amount numeric DEFAULT 0,
    tax_total numeric DEFAULT 0,
    discount_total numeric DEFAULT 0,
    payment_status text DEFAULT 'UNPAID'::text,
    invoice_date text,
    client_name text,
    cgst_amount numeric DEFAULT 0,
    sgst_amount numeric DEFAULT 0,
    igst_amount numeric DEFAULT 0,
    round_off numeric DEFAULT 0,
    items jsonb,
    paid_amount numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL
);


--
-- Name: mechanic_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mechanic_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid,
    name character varying(255),
    work_description text,
    total_due numeric(10,2),
    amount_paid numeric(10,2) DEFAULT 0,
    pending numeric(10,2),
    work_date date,
    created_at timestamp without time zone DEFAULT now(),
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL
);


--
-- Name: movement_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movement_log (
    id text NOT NULL,
    date text,
    product_id text,
    product_name text,
    type text,
    quantity numeric,
    reason text,
    user_id text,
    created_at timestamp with time zone DEFAULT now(),
    is_seed boolean DEFAULT false,
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL
);


--
-- Name: payroll; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll (
    id text NOT NULL,
    "employeeId" text,
    amount numeric,
    month text,
    processed_at text,
    processed_by text,
    created_at timestamp with time zone DEFAULT now(),
    is_seed boolean DEFAULT false,
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL
);


--
-- Name: platform_error_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_error_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    user_id uuid,
    user_role text,
    module text,
    action text,
    error_code text,
    error_message text,
    stack_trace text,
    severity text DEFAULT 'Medium'::text,
    status text DEFAULT 'New'::text,
    plan_tier text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT platform_error_logs_severity_check CHECK ((severity = ANY (ARRAY['Critical'::text, 'High'::text, 'Medium'::text, 'Low'::text]))),
    CONSTRAINT platform_error_logs_status_check CHECK ((status = ANY (ARRAY['New'::text, 'Acknowledged'::text, 'Resolved'::text])))
);


--
-- Name: product_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id text NOT NULL,
    sku text,
    name text,
    category text,
    unit text,
    "costPrice" numeric DEFAULT 0,
    "sellingPrice" numeric DEFAULT 0,
    stock numeric DEFAULT 0,
    "taxRate" numeric DEFAULT 0,
    "taxSlab" text,
    tags text[],
    image text,
    created_at timestamp with time zone DEFAULT now(),
    "lowStockThreshold" numeric DEFAULT 10,
    hsn_code text DEFAULT ''::text,
    tax_rate numeric DEFAULT 18,
    tax_type text DEFAULT 'GST'::text,
    is_seed boolean DEFAULT false,
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    name text,
    email text,
    roles text[] DEFAULT '{STAFF}'::text[],
    status text DEFAULT 'ACTIVE'::text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL
);


--
-- Name: purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchases (
    id text NOT NULL,
    business_id uuid,
    product_id text,
    quantity numeric DEFAULT 0,
    total_amount numeric DEFAULT 0,
    date text,
    created_at timestamp without time zone DEFAULT now(),
    linked_product_id text,
    supplier_name character varying(255),
    payment_type character varying(10) DEFAULT 'cash'::character varying,
    notes text,
    supplier_id text,
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL
);


--
-- Name: routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routes (
    id text NOT NULL,
    "vehicleId" text,
    "driverId" text,
    location text,
    "initialOdometer" text,
    "assignedOrders" jsonb,
    "loadedStock" jsonb,
    status text,
    date text,
    final_odometer text,
    actual_cash numeric,
    reconciled_at text,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL
);


--
-- Name: sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales (
    id text NOT NULL,
    "shopId" text,
    "customerInfo" jsonb,
    "paymentMethod" text,
    "paymentStatus" text,
    "routeId" text,
    items jsonb,
    subtotal numeric,
    discount numeric,
    tax numeric,
    "totalAmount" numeric,
    "totalCogs" numeric,
    date text,
    "salesRepId" text,
    "bookedBy" text,
    status text,
    "scheduledDate" text,
    "deliveredBy" text,
    note text,
    "paidAmount" numeric DEFAULT 0,
    "lastPaymentDate" text,
    created_at timestamp with time zone DEFAULT now(),
    payment_type character varying(10) DEFAULT 'cash'::character varying,
    is_seed boolean DEFAULT false,
    vehicleid text,
    "vehicleId" text,
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL
);


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    key text NOT NULL,
    value jsonb,
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id text NOT NULL,
    name text NOT NULL,
    contact_person text,
    phone text,
    email text,
    address text,
    balance numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    notes text,
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL
);


--
-- Name: tenant_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'STAFF'::text NOT NULL,
    token text DEFAULT encode(extensions.gen_random_bytes(32), 'hex'::text) NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    plan text DEFAULT 'STARTER'::text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    owner_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    settings jsonb DEFAULT '{}'::jsonb
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    name text,
    email text,
    roles text[],
    status text DEFAULT 'ACTIVE'::text,
    created_at text,
    permissions jsonb DEFAULT '{}'::jsonb,
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL
);


--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicles (
    id text NOT NULL,
    name text,
    plate text,
    capacity numeric,
    type text,
    status text,
    "fuelType" text,
    color text,
    year text,
    "lastServiceDate" text,
    "nextServiceDate" text,
    created_at timestamp with time zone DEFAULT now(),
    "plateNumber" text,
    tenant_id uuid DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid NOT NULL
);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: budgets budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_pkey PRIMARY KEY (id);


--
-- Name: budgets budgets_tenant_id_period_category_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_tenant_id_period_category_key UNIQUE (tenant_id, period, category);


--
-- Name: business_profile business_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_profile
    ADD CONSTRAINT business_profile_pkey PRIMARY KEY (id);


--
-- Name: client_payments client_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_payments
    ADD CONSTRAINT client_payments_pkey PRIMARY KEY (id);


--
-- Name: day_book day_book_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.day_book
    ADD CONSTRAINT day_book_pkey PRIMARY KEY (id);


--
-- Name: day_book day_book_tenant_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.day_book
    ADD CONSTRAINT day_book_tenant_date_key UNIQUE (tenant_id, date);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: gl_accounts gl_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_accounts
    ADD CONSTRAINT gl_accounts_pkey PRIMARY KEY (id);


--
-- Name: gl_accounts gl_accounts_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_accounts
    ADD CONSTRAINT gl_accounts_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: gl_journals gl_journals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_journals
    ADD CONSTRAINT gl_journals_pkey PRIMARY KEY (id);


--
-- Name: gl_lines gl_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_lines
    ADD CONSTRAINT gl_lines_pkey PRIMARY KEY (id);


--
-- Name: inventory_balances inventory_balances_location_id_product_id_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_balances
    ADD CONSTRAINT inventory_balances_location_id_product_id_tenant_id_key UNIQUE (location_id, product_id, tenant_id);


--
-- Name: inventory_balances inventory_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_balances
    ADD CONSTRAINT inventory_balances_pkey PRIMARY KEY (id);


--
-- Name: inventory_locations inventory_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_locations
    ADD CONSTRAINT inventory_locations_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: mechanic_payments mechanic_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mechanic_payments
    ADD CONSTRAINT mechanic_payments_pkey PRIMARY KEY (id);


--
-- Name: movement_log movement_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movement_log
    ADD CONSTRAINT movement_log_pkey PRIMARY KEY (id);


--
-- Name: sales orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: payroll payroll_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll
    ADD CONSTRAINT payroll_pkey PRIMARY KEY (id);


--
-- Name: platform_error_logs platform_error_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_error_logs
    ADD CONSTRAINT platform_error_logs_pkey PRIMARY KEY (id);


--
-- Name: product_categories product_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_pkey PRIMARY KEY (id);


--
-- Name: product_categories product_categories_tenant_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_tenant_name_key UNIQUE (tenant_id, name);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: purchases purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);


--
-- Name: routes routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (tenant_id, key);


--
-- Name: clients shops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT shops_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: tenant_invitations tenant_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_invitations
    ADD CONSTRAINT tenant_invitations_pkey PRIMARY KEY (id);


--
-- Name: tenant_invitations tenant_invitations_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_invitations
    ADD CONSTRAINT tenant_invitations_token_key UNIQUE (token);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--
-- Name: inventory_balances uq_inventory_balances_product_location; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_balances
    ADD CONSTRAINT uq_inventory_balances_product_location UNIQUE (product_id, location_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);


--
-- Name: audit_log_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_action_idx ON public.audit_log USING btree (tenant_id, action, created_at DESC);


--
-- Name: audit_log_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_entity_idx ON public.audit_log USING btree (entity_type, entity_id);


--
-- Name: audit_log_tenant_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_tenant_created_idx ON public.audit_log USING btree (tenant_id, created_at DESC);


--
-- Name: budgets_tenant_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX budgets_tenant_period_idx ON public.budgets USING btree (tenant_id, period);


--
-- Name: idx_business_profile_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_profile_tenant ON public.business_profile USING btree (tenant_id, id);


--
-- Name: idx_client_payments_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_payments_tenant ON public.client_payments USING btree (tenant_id, id);


--
-- Name: idx_clients_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_active ON public.clients USING btree (tenant_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_clients_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_tenant ON public.clients USING btree (tenant_id, id);


--
-- Name: idx_day_book_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_day_book_tenant ON public.day_book USING btree (tenant_id, id);


--
-- Name: idx_employees_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_tenant ON public.employees USING btree (tenant_id, id);


--
-- Name: idx_expenses_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_tenant ON public.expenses USING btree (tenant_id, id);


--
-- Name: idx_gl_accounts_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gl_accounts_tenant ON public.gl_accounts USING btree (tenant_id);


--
-- Name: idx_gl_journals_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gl_journals_reference ON public.gl_journals USING btree (reference_type, reference_id);


--
-- Name: idx_gl_journals_tenant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gl_journals_tenant_date ON public.gl_journals USING btree (tenant_id, date);


--
-- Name: idx_gl_lines_journal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gl_lines_journal ON public.gl_lines USING btree (journal_id);


--
-- Name: idx_gl_lines_tenant_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gl_lines_tenant_account ON public.gl_lines USING btree (tenant_id, account_id);


--
-- Name: idx_inventory_balances_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_balances_tenant ON public.inventory_balances USING btree (tenant_id, id);


--
-- Name: idx_inventory_locations_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_locations_tenant ON public.inventory_locations USING btree (tenant_id, id);


--
-- Name: idx_invoices_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_tenant ON public.invoices USING btree (tenant_id, id);


--
-- Name: idx_mechanic_payments_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mechanic_payments_tenant ON public.mechanic_payments USING btree (tenant_id, id);


--
-- Name: idx_movement_log_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movement_log_tenant ON public.movement_log USING btree (tenant_id, id);


--
-- Name: idx_payroll_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payroll_tenant ON public.payroll USING btree (tenant_id, id);


--
-- Name: idx_product_categories_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_categories_tenant ON public.product_categories USING btree (tenant_id, id);


--
-- Name: idx_products_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_tenant ON public.products USING btree (tenant_id, id);


--
-- Name: idx_profiles_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_tenant ON public.profiles USING btree (tenant_id, id);


--
-- Name: idx_purchases_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchases_tenant ON public.purchases USING btree (tenant_id, id);


--
-- Name: idx_routes_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routes_tenant ON public.routes USING btree (tenant_id, id);


--
-- Name: idx_sales_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_tenant ON public.sales USING btree (tenant_id, id);


--
-- Name: idx_suppliers_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_tenant ON public.suppliers USING btree (tenant_id, id);


--
-- Name: idx_tenant_invitations_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_invitations_tenant ON public.tenant_invitations USING btree (tenant_id);


--
-- Name: idx_tenant_invitations_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_invitations_token ON public.tenant_invitations USING btree (token);


--
-- Name: idx_tenants_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenants_slug ON public.tenants USING btree (slug);


--
-- Name: idx_users_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_tenant ON public.users USING btree (tenant_id, id);


--
-- Name: idx_vehicles_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_tenant ON public.vehicles USING btree (tenant_id, id);


--
-- Name: gl_lines trg_gl_assert_balanced; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_gl_assert_balanced AFTER INSERT OR DELETE OR UPDATE ON public.gl_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.gl_assert_journal_balanced();


--
-- Name: client_payments trg_gl_client_payments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gl_client_payments AFTER INSERT OR DELETE OR UPDATE ON public.client_payments FOR EACH ROW EXECUTE FUNCTION public.gl_post_client_payments();


--
-- Name: expenses trg_gl_expenses; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gl_expenses AFTER INSERT OR DELETE OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.gl_post_expenses();


--
-- Name: purchases trg_gl_purchases; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gl_purchases AFTER INSERT OR DELETE OR UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.gl_post_purchases();


--
-- Name: sales trg_gl_sales; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gl_sales AFTER INSERT OR DELETE OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.gl_post_sales();


--
-- Name: tenants trg_seed_chart_of_accounts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_seed_chart_of_accounts AFTER INSERT ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.seed_tenant_chart_of_accounts();


--
-- Name: inventory_balances trg_sync_product_stock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_product_stock AFTER INSERT OR DELETE OR UPDATE OF quantity ON public.inventory_balances FOR EACH ROW EXECUTE FUNCTION public.sync_product_stock_sum();


--
-- Name: invoices trigger_sync_invoice_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_sync_invoice_payment AFTER INSERT OR DELETE OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.on_invoice_payment_sync();


--
-- Name: audit_log audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: business_profile business_profile_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_profile
    ADD CONSTRAINT business_profile_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: client_payments client_payments_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_payments
    ADD CONSTRAINT client_payments_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: client_payments client_payments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_payments
    ADD CONSTRAINT client_payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: clients clients_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: day_book day_book_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.day_book
    ADD CONSTRAINT day_book_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: employees employees_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: expenses expenses_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: gl_accounts gl_accounts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_accounts
    ADD CONSTRAINT gl_accounts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: gl_journals gl_journals_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_journals
    ADD CONSTRAINT gl_journals_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: gl_lines gl_lines_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_lines
    ADD CONSTRAINT gl_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.gl_accounts(id) ON DELETE RESTRICT;


--
-- Name: gl_lines gl_lines_journal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_lines
    ADD CONSTRAINT gl_lines_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.gl_journals(id) ON DELETE CASCADE;


--
-- Name: gl_lines gl_lines_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_lines
    ADD CONSTRAINT gl_lines_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: inventory_balances inventory_balances_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_balances
    ADD CONSTRAINT inventory_balances_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id) ON DELETE CASCADE;


--
-- Name: inventory_balances inventory_balances_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_balances
    ADD CONSTRAINT inventory_balances_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: inventory_locations inventory_locations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_locations
    ADD CONSTRAINT inventory_locations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: invoices invoices_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: invoices invoices_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id);


--
-- Name: invoices invoices_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: mechanic_payments mechanic_payments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mechanic_payments
    ADD CONSTRAINT mechanic_payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: movement_log movement_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movement_log
    ADD CONSTRAINT movement_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: payroll payroll_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll
    ADD CONSTRAINT payroll_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: platform_error_logs platform_error_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_error_logs
    ADD CONSTRAINT platform_error_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;


--
-- Name: product_categories product_categories_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: products products_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: purchases purchases_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: routes routes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: sales sales_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: settings settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: suppliers suppliers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: tenant_invitations tenant_invitations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_invitations
    ADD CONSTRAINT tenant_invitations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenants tenants_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id);


--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: vehicles vehicles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: platform_error_logs Admins can update status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update status" ON public.platform_error_logs FOR UPDATE USING ((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['GLOBAL_ADMIN'::text, 'OWNER'::text])));


--
-- Name: platform_error_logs Global Admins see all logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Global Admins see all logs" ON public.platform_error_logs FOR SELECT USING ((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'GLOBAL_ADMIN'::text));


--
-- Name: platform_error_logs Owners see tenant logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners see tenant logs" ON public.platform_error_logs FOR SELECT USING (((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'OWNER'::text) AND (tenant_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'tenant_id'::text))::uuid)));


--
-- Name: gl_accounts Tenant Scoped Access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant Scoped Access" ON public.gl_accounts TO authenticated USING ((public.is_tenant_admin() AND ((tenant_id = public.current_tenant_id()) OR public.is_global_admin()))) WITH CHECK ((public.is_tenant_admin() AND ((tenant_id = public.current_tenant_id()) OR public.is_global_admin())));


--
-- Name: gl_journals Tenant Scoped Access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant Scoped Access" ON public.gl_journals TO authenticated USING ((public.is_tenant_admin() AND ((tenant_id = public.current_tenant_id()) OR public.is_global_admin()))) WITH CHECK ((public.is_tenant_admin() AND ((tenant_id = public.current_tenant_id()) OR public.is_global_admin())));


--
-- Name: gl_lines Tenant Scoped Access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant Scoped Access" ON public.gl_lines TO authenticated USING ((public.is_tenant_admin() AND ((tenant_id = public.current_tenant_id()) OR public.is_global_admin()))) WITH CHECK ((public.is_tenant_admin() AND ((tenant_id = public.current_tenant_id()) OR public.is_global_admin())));


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_log_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_admin_delete ON public.audit_log FOR DELETE USING (public.is_global_admin());


--
-- Name: audit_log audit_log_tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_tenant_select ON public.audit_log FOR SELECT USING ((public.is_global_admin() OR (tenant_id = public.current_tenant_id())));


--
-- Name: budgets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

--
-- Name: business_profile; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_profile ENABLE ROW LEVEL SECURITY;

--
-- Name: client_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: day_book; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.day_book ENABLE ROW LEVEL SECURITY;

--
-- Name: employees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: gl_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gl_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: gl_journals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gl_journals ENABLE ROW LEVEL SECURITY;

--
-- Name: gl_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gl_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_invitations global_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY global_admin_all ON public.tenant_invitations TO authenticated USING (public.is_global_admin());


--
-- Name: tenants global_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY global_admin_all ON public.tenants TO authenticated USING (public.is_global_admin());


--
-- Name: inventory_balances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: mechanic_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mechanic_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: movement_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.movement_log ENABLE ROW LEVEL SECURITY;

--
-- Name: tenants owner_read_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_read_own ON public.tenants FOR SELECT TO authenticated USING ((id = public.current_tenant_id()));


--
-- Name: payroll; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;

--
-- Name: employees plan_gate_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_delete ON public.employees AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_module_access('payroll'::text));


--
-- Name: mechanic_payments plan_gate_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_delete ON public.mechanic_payments AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_module_access('vehicles'::text));


--
-- Name: payroll plan_gate_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_delete ON public.payroll AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_module_access('payroll'::text));


--
-- Name: purchases plan_gate_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_delete ON public.purchases AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_module_access('purchases'::text));


--
-- Name: routes plan_gate_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_delete ON public.routes AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_module_access('vehicles'::text));


--
-- Name: settings plan_gate_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_delete ON public.settings AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_module_access('settings'::text));


--
-- Name: suppliers plan_gate_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_delete ON public.suppliers AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_module_access('suppliers'::text));


--
-- Name: vehicles plan_gate_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_delete ON public.vehicles AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_module_access('vehicles'::text));


--
-- Name: employees plan_gate_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_insert ON public.employees AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_module_access('payroll'::text));


--
-- Name: mechanic_payments plan_gate_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_insert ON public.mechanic_payments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_module_access('vehicles'::text));


--
-- Name: payroll plan_gate_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_insert ON public.payroll AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_module_access('payroll'::text));


--
-- Name: purchases plan_gate_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_insert ON public.purchases AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_module_access('purchases'::text));


--
-- Name: routes plan_gate_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_insert ON public.routes AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_module_access('vehicles'::text));


--
-- Name: settings plan_gate_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_insert ON public.settings AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_module_access('settings'::text));


--
-- Name: suppliers plan_gate_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_insert ON public.suppliers AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_module_access('suppliers'::text));


--
-- Name: vehicles plan_gate_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_insert ON public.vehicles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_module_access('vehicles'::text));


--
-- Name: audit_log plan_gate_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_select ON public.audit_log AS RESTRICTIVE FOR SELECT TO authenticated USING (public.has_module_access('audit-log'::text));


--
-- Name: employees plan_gate_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_update ON public.employees AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_module_access('payroll'::text)) WITH CHECK (public.has_module_access('payroll'::text));


--
-- Name: mechanic_payments plan_gate_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_update ON public.mechanic_payments AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_module_access('vehicles'::text)) WITH CHECK (public.has_module_access('vehicles'::text));


--
-- Name: payroll plan_gate_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_update ON public.payroll AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_module_access('payroll'::text)) WITH CHECK (public.has_module_access('payroll'::text));


--
-- Name: purchases plan_gate_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_update ON public.purchases AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_module_access('purchases'::text)) WITH CHECK (public.has_module_access('purchases'::text));


--
-- Name: routes plan_gate_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_update ON public.routes AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_module_access('vehicles'::text)) WITH CHECK (public.has_module_access('vehicles'::text));


--
-- Name: settings plan_gate_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_update ON public.settings AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_module_access('settings'::text)) WITH CHECK (public.has_module_access('settings'::text));


--
-- Name: suppliers plan_gate_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_update ON public.suppliers AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_module_access('suppliers'::text)) WITH CHECK (public.has_module_access('suppliers'::text));


--
-- Name: vehicles plan_gate_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_gate_update ON public.vehicles AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_module_access('vehicles'::text)) WITH CHECK (public.has_module_access('vehicles'::text));


--
-- Name: platform_error_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_error_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: product_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: purchases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

--
-- Name: routes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

--
-- Name: sales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles self_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY self_update ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid()));


--
-- Name: settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_invitations tenant_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_admin_all ON public.tenant_invitations TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()));


--
-- Name: budgets tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.budgets FOR DELETE USING ((((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()) OR public.is_global_admin()));


--
-- Name: business_profile tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.business_profile FOR DELETE TO authenticated USING (false);


--
-- Name: client_payments tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.client_payments FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()));


--
-- Name: clients tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.clients FOR DELETE USING ((((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()) OR public.is_global_admin()));


--
-- Name: day_book tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.day_book FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()));


--
-- Name: employees tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.employees FOR DELETE USING ((((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()) OR public.is_global_admin()));


--
-- Name: expenses tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.expenses FOR DELETE USING ((((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()) OR public.is_global_admin()));


--
-- Name: inventory_balances tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.inventory_balances FOR DELETE USING ((((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()) OR public.is_global_admin()));


--
-- Name: inventory_locations tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.inventory_locations FOR DELETE USING ((((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()) OR public.is_global_admin()));


--
-- Name: invoices tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.invoices FOR DELETE USING ((((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()) OR public.is_global_admin()));


--
-- Name: mechanic_payments tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.mechanic_payments FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()));


--
-- Name: movement_log tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.movement_log FOR DELETE USING ((((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()) OR public.is_global_admin()));


--
-- Name: payroll tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.payroll FOR DELETE USING ((((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()) OR public.is_global_admin()));


--
-- Name: product_categories tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.product_categories FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()));


--
-- Name: products tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.products FOR DELETE USING ((((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()) OR public.is_global_admin()));


--
-- Name: purchases tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.purchases FOR DELETE USING ((((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()) OR public.is_global_admin()));


--
-- Name: routes tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.routes FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()));


--
-- Name: sales tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.sales FOR DELETE USING ((((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()) OR public.is_global_admin()));


--
-- Name: suppliers tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.suppliers FOR DELETE USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: users tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.users FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()));


--
-- Name: vehicles tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.vehicles FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()));


--
-- Name: budgets tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.budgets FOR INSERT WITH CHECK (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: business_profile tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.business_profile FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()));


--
-- Name: client_payments tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.client_payments FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: clients tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.clients FOR INSERT WITH CHECK (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: day_book tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.day_book FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: employees tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.employees FOR INSERT WITH CHECK (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: expenses tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.expenses FOR INSERT WITH CHECK (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: inventory_balances tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.inventory_balances FOR INSERT WITH CHECK (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: inventory_locations tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.inventory_locations FOR INSERT WITH CHECK ((((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()) OR public.is_global_admin()));


--
-- Name: invoices tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.invoices FOR INSERT WITH CHECK (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: mechanic_payments tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.mechanic_payments FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: movement_log tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.movement_log FOR INSERT WITH CHECK (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: payroll tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.payroll FOR INSERT WITH CHECK ((((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()) OR public.is_global_admin()));


--
-- Name: product_categories tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.product_categories FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()));


--
-- Name: products tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.products FOR INSERT WITH CHECK (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: purchases tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.purchases FOR INSERT WITH CHECK (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: routes tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.routes FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: sales tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.sales FOR INSERT WITH CHECK (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: settings tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.settings FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()));


--
-- Name: suppliers tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.suppliers FOR INSERT WITH CHECK (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: users tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.users FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()));


--
-- Name: vehicles tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.vehicles FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: tenant_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: budgets tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.budgets FOR SELECT USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: business_profile tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.business_profile FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: client_payments tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.client_payments FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: clients tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.clients FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: day_book tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.day_book FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: employees tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.employees FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: expenses tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.expenses FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: inventory_balances tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.inventory_balances FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: inventory_locations tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.inventory_locations FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: invoices tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.invoices FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: mechanic_payments tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.mechanic_payments FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: movement_log tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.movement_log FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: payroll tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.payroll FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: product_categories tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.product_categories FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: products tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.products FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: profiles tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.profiles FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR (id = auth.uid()) OR public.is_global_admin()));


--
-- Name: purchases tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.purchases FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: routes tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.routes FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: sales tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.sales FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: settings tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.settings FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: suppliers tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.suppliers FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: users tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.users FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: vehicles tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.vehicles FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: budgets tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.budgets FOR UPDATE USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: business_profile tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.business_profile FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()));


--
-- Name: client_payments tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.client_payments FOR UPDATE TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: clients tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.clients FOR UPDATE USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: day_book tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.day_book FOR UPDATE TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: employees tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.employees FOR UPDATE USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: expenses tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.expenses FOR UPDATE USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: inventory_balances tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.inventory_balances FOR UPDATE USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: inventory_locations tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.inventory_locations FOR UPDATE USING ((((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()) OR public.is_global_admin()));


--
-- Name: invoices tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.invoices FOR UPDATE USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: mechanic_payments tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.mechanic_payments FOR UPDATE TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: movement_log tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.movement_log FOR UPDATE USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: payroll tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.payroll FOR UPDATE USING ((((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()) OR public.is_global_admin()));


--
-- Name: product_categories tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.product_categories FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()));


--
-- Name: products tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.products FOR UPDATE USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: purchases tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.purchases FOR UPDATE USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: routes tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.routes FOR UPDATE TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: sales tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.sales FOR UPDATE USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: settings tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.settings FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()));


--
-- Name: suppliers tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.suppliers FOR UPDATE USING (((tenant_id = public.current_tenant_id()) OR public.is_global_admin()));


--
-- Name: users tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.users FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()));


--
-- Name: vehicles tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.vehicles FOR UPDATE TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: tenants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

--
-- Name: users user_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_self_read ON public.users FOR SELECT TO authenticated USING ((id = (auth.uid())::text));


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict XSxCjTGNKg6KF5sF3EWgA6aPeIFaM5xhR79y4KGLZCb7WNBA5omxQEIMBjiNCg2

