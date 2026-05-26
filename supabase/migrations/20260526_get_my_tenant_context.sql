-- Bypass the post-sign-in RLS race: SECURITY DEFINER reads the user's
-- own row + tenant in one shot regardless of whether the freshly issued
-- JWT has propagated to PostgREST yet.
-- Applied to project lmviftlynuhopzmvaxeu on 2026-05-26.
create or replace function public.get_my_tenant_context()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid text := (auth.uid())::text;
  v_user_row jsonb;
  v_tenant_row jsonb;
  v_tenant_id text;
begin
  if v_uid is null then return null; end if;
  select to_jsonb(u) into v_user_row from public.users u where u.id = v_uid limit 1;
  if v_user_row is null then return null; end if;
  v_tenant_id := v_user_row ->> 'tenant_id';
  if v_tenant_id is null or v_tenant_id = '' then
    return jsonb_build_object('user', v_user_row, 'tenant', null);
  end if;
  select to_jsonb(t) into v_tenant_row from public.tenants t where t.id::text = v_tenant_id limit 1;
  return jsonb_build_object('user', v_user_row, 'tenant', v_tenant_row);
end $$;
grant execute on function public.get_my_tenant_context() to authenticated, anon;
