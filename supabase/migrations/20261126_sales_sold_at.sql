-- When a sale was actually billed.
--
-- sales.created_at is when the row reached the server. A phone that bills with
-- no connection uploads later, so a sale billed on the evening of the 24th
-- showed "6:50 am" (the next morning's sync) under the 24th. sold_at is the
-- time on the device at the moment of billing; readers show
-- COALESCE(sold_at, created_at).
--
-- process_sale gains one optional last argument, p_sold_at, and writes it.
-- NOTHING else in the function changes: the body is taken from the live
-- definition and edited in exactly three places, each asserted to match once,
-- so stock, cost, ledger and credit-limit logic are untouched. Callers that do
-- not send p_sold_at (web, desktop, older phones, complete_appointment) behave
-- exactly as before.
--
-- A time from a device is not trusted blindly: it is kept only when it is not
-- in the future (10 minutes of clock slack) and not older than 60 days.
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS sold_at timestamptz;
COMMENT ON COLUMN public.sales.sold_at IS
  'Device time when the sale was billed. NULL = unknown; use created_at. Display only.';

DO $mig$
DECLARE
  v_oid  oid;
  v_def  text;
  v_new  text;
  v_acl  aclitem[];
  v_owner text;
  g      record;
  a1 constant text := 'p_discount numeric DEFAULT 0)';
  b1 constant text := 'p_discount numeric DEFAULT 0, p_sold_at timestamp with time zone DEFAULT NULL::timestamp with time zone)';
  a2 constant text := E'source_app, location_id, discount\n  ) VALUES (';
  b2 constant text := E'source_app, location_id, discount, sold_at\n  ) VALUES (';
  a3 constant text := E'v_source_location, ROUND(COALESCE(p_discount, 0), 2)\n  );';
  b3 constant text := E'v_source_location, ROUND(COALESCE(p_discount, 0), 2),\n    CASE WHEN p_sold_at IS NOT NULL\n          AND p_sold_at <= now() + interval ''10 minutes''\n          AND p_sold_at >= now() - interval ''60 days''\n         THEN p_sold_at END\n  );';
  n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'process_sale';
  IF n <> 1 THEN RAISE EXCEPTION 'expected exactly one process_sale, found %', n; END IF;

  SELECT p.oid, pg_get_functiondef(p.oid), p.proacl, pg_get_userbyid(p.proowner)
    INTO v_oid, v_def, v_acl, v_owner
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'process_sale';

  IF position('p_sold_at' in v_def) > 0 THEN
    RAISE NOTICE 'process_sale already takes p_sold_at; nothing to do';
    RETURN;
  END IF;

  IF (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 THEN RAISE EXCEPTION 'signature anchor not found exactly once'; END IF;
  IF (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 THEN RAISE EXCEPTION 'insert column anchor not found exactly once'; END IF;
  IF (length(v_def) - length(replace(v_def, a3, ''))) / length(a3) <> 1 THEN RAISE EXCEPTION 'insert values anchor not found exactly once'; END IF;

  v_new := replace(replace(replace(v_def, a1, b1), a2, b2), a3, b3);
  IF length(v_new) <> length(v_def) + (length(b1)-length(a1)) + (length(b2)-length(a2)) + (length(b3)-length(a3)) THEN
    RAISE EXCEPTION 'unexpected size after edit';
  END IF;

  -- A changed argument list is a NEW function to Postgres. The old one must go
  -- first, or both exist and every caller fails with "function is not unique".
  EXECUTE format('DROP FUNCTION %s', v_oid::regprocedure);
  EXECUTE v_new;

  SELECT p.oid INTO v_oid FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'process_sale';
  EXECUTE format('ALTER FUNCTION %s OWNER TO %I', v_oid::regprocedure, v_owner);

  -- Put back exactly who could run it before. A new function is born with the
  -- project's default grants, which include anon: without this, remaking
  -- process_sale would let a caller who is not signed in reach it.
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_oid::regprocedure);
  FOR g IN SELECT DISTINCT x.grantee FROM pg_proc p, aclexplode(p.proacl) x
            WHERE p.oid = v_oid AND x.grantee <> 0 AND x.grantee <> p.proowner LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', v_oid::regprocedure, pg_get_userbyid(g.grantee));
  END LOOP;
  IF v_acl IS NULL THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', v_oid::regprocedure);
  ELSE
    FOR g IN SELECT grantee, privilege_type FROM aclexplode(v_acl) LOOP
      IF g.privilege_type = 'EXECUTE' THEN
        IF g.grantee = 0 THEN
          EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', v_oid::regprocedure);
        ELSE
          EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', v_oid::regprocedure, pg_get_userbyid(g.grantee));
        END IF;
      END IF;
    END LOOP;
  END IF;
END
$mig$;

NOTIFY pgrst, 'reload schema';
