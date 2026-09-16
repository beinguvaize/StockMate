-- A home for repair snapshots.
--
-- Before this, every data repair wrote its before-image as a table in public
-- with an ad-hoc name. Seventeen accumulated over eleven days and nothing ever
-- removed them. Sitting in public they were reachable by PostgREST, showed up
-- in schema diffs, and were indistinguishable from real tables.
--
-- Rules:
--   * snapshots live in `snap`, never in public
--   * take one with snap.take(); it registers itself
--   * they expire and snap.sweep() drops them (weekly cron `snapshot-sweep`)
--   * pin one that is backing unresolved work (expires_at = NULL) so the
--     sweep leaves it alone

CREATE SCHEMA IF NOT EXISTS snap;

-- Not in the PostgREST search path, but revoke explicitly: a snapshot is a
-- verbatim copy of tenant data with none of the RLS of the table it came from.
REVOKE ALL ON SCHEMA snap FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS snap.registry (
  table_name  text PRIMARY KEY,
  reason      text NOT NULL,
  row_count   bigint,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text NOT NULL DEFAULT current_user,
  -- NULL means pinned: keep until someone decides otherwise.
  expires_at  timestamptz
);

COMMENT ON TABLE snap.registry IS
  'One row per snapshot in the snap schema. expires_at NULL = pinned, never swept.';

-- Take a snapshot.
--
--   SELECT snap.take('purchase_transfer',
--                    $q$SELECT * FROM purchases WHERE id = 'PUR-E6PRCT'$q$,
--                    'before moving the batch to 13*16 Pkt Cover');
--
-- Deliberately NOT granted to authenticated: it executes the SQL it is given,
-- so it is a superuser tool for repair work, not something the app may call.
CREATE OR REPLACE FUNCTION snap.take(
  p_slug      text,
  p_query     text,
  p_reason    text,
  p_keep_days int DEFAULT 30
) RETURNS text
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_name text;
  v_rows bigint;
BEGIN
  IF p_slug !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'Slug must be lower_snake_case: %', p_slug;
  END IF;

  v_name := p_slug || '_' || to_char(now(), 'YYYYMMDD');

  IF EXISTS (SELECT 1 FROM snap.registry WHERE table_name = v_name) THEN
    RAISE EXCEPTION 'Snapshot snap.% already exists today; pick another slug', v_name;
  END IF;

  EXECUTE format('CREATE TABLE snap.%I AS %s', v_name, p_query);
  EXECUTE format('SELECT count(*) FROM snap.%I', v_name) INTO v_rows;

  INSERT INTO snap.registry (table_name, reason, row_count, expires_at)
  VALUES (v_name, p_reason, v_rows,
          CASE WHEN p_keep_days IS NULL THEN NULL
               ELSE now() + make_interval(days => p_keep_days) END);

  RETURN 'snap.' || v_name;
END;
$fn$;

-- Pin a snapshot that is backing unresolved work, so the sweep skips it.
CREATE OR REPLACE FUNCTION snap.pin(p_table_name text)
RETURNS void LANGUAGE sql AS $fn$
  UPDATE snap.registry SET expires_at = NULL WHERE table_name = p_table_name;
$fn$;

-- Drop everything past its expiry. Returns what it removed, so a scheduled run
-- leaves a readable trace rather than deleting silently.
CREATE OR REPLACE FUNCTION snap.sweep()
RETURNS TABLE (dropped text, reason text, aged_days int)
LANGUAGE plpgsql
AS $fn$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT table_name, registry.reason AS why,
           EXTRACT(day FROM now() - created_at)::int AS age
    FROM snap.registry
    WHERE expires_at IS NOT NULL AND expires_at < now()
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS snap.%I', r.table_name);
    DELETE FROM snap.registry WHERE table_name = r.table_name;
    dropped := r.table_name; reason := r.why; aged_days := r.age;
    RETURN NEXT;
  END LOOP;
END;
$fn$;

-- Anything in snap that never registered itself — a table created by hand.
-- Worth seeing, because an unregistered snapshot never expires.
CREATE OR REPLACE VIEW snap.unregistered AS
SELECT c.relname AS table_name,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'snap' AND c.relkind = 'r'
  AND c.relname <> 'registry'
  AND NOT EXISTS (SELECT 1 FROM snap.registry r WHERE r.table_name = c.relname);

-- Weekly, Sunday 03:30 — just after the daily cron cleanup, and well off the
-- per-minute cadence that caused the Disk IO problem in July.
--   SELECT cron.schedule('snapshot-sweep', '30 3 * * 0', $q$SELECT snap.sweep()$q$);
