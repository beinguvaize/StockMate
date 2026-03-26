-- StockMate User Provisioning Setup
-- Run this script in your Supabase Dashboard SQL Editor to enable direct password entry in the app.

-- 1. Enable the pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create the high-privilege RPC function
CREATE OR REPLACE FUNCTION create_staff_account(
  new_email TEXT,
  new_password TEXT,
  new_roles TEXT[],
  new_name TEXT
) RETURNS UUID AS $$
DECLARE
  new_userId UUID;
BEGIN
  -- 1. Create user in auth.users
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    is_super_admin
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    new_email,
    crypt(new_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('name', new_name, 'roles', new_roles),
    now(),
    now(),
    '',
    false
  )
  RETURNING id INTO new_userId;

  -- 2. Create entry in public.users
  INSERT INTO public.users (id, email, name, roles, status)
  VALUES (new_userId, new_email, new_name, new_roles, 'ACTIVE')
  ON CONFLICT (id) DO UPDATE SET roles = new_roles;

  RETURN new_userId;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Grant access to authenticated users (admins) to call this function
GRANT EXECUTE ON FUNCTION create_staff_account TO anon, authenticated, service_role;
