-- Applied to prod 20 Aug 2026 (project lmviftlynuhopzmvaxeu).
-- Full rationale in the migration as applied; summary:
--
-- bug_reports.admin_notes reads as private but is NOT: tenant_self_select lets a
-- tenant read their own bug_reports rows, and RLS is row-level, so every column
-- on that row is readable by the customer who filed it. It is empty on both
-- existing reports, so nothing leaked -- it would the first time anyone typed an
-- internal remark into it. Notes therefore live in their own table where
-- visibility is enforced by the row's own policy.
--
-- INTERNAL notes are unreadable by any non-admin. PUBLIC notes are readable only
-- by the tenant whose report they hang off. Verified both ways, including
-- against a second tenant.

CREATE TABLE IF NOT EXISTS bug_report_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL,
  visibility  text NOT NULL DEFAULT 'INTERNAL' CHECK (visibility IN ('PUBLIC', 'INTERNAL')),
  body        text NOT NULL,
  author_id   text,
  author_name text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_bug_report_notes_report
  ON bug_report_notes (report_id, created_at) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION bug_report_notes_set_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT tenant_id INTO NEW.tenant_id FROM bug_reports WHERE id = NEW.report_id;
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'bug_report_notes: report % does not exist', NEW.report_id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bug_report_notes_tenant ON bug_report_notes;
CREATE TRIGGER trg_bug_report_notes_tenant
BEFORE INSERT OR UPDATE ON bug_report_notes
FOR EACH ROW EXECUTE FUNCTION bug_report_notes_set_tenant();

ALTER TABLE bug_report_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brn_select ON bug_report_notes;
CREATE POLICY brn_select ON bug_report_notes FOR SELECT
USING (
  (SELECT is_global_admin())
  OR (visibility = 'PUBLIC' AND deleted_at IS NULL
      AND tenant_id = (SELECT current_tenant_id()))
);

DROP POLICY IF EXISTS brn_admin_write ON bug_report_notes;
CREATE POLICY brn_admin_write ON bug_report_notes FOR ALL
USING ((SELECT is_global_admin())) WITH CHECK ((SELECT is_global_admin()));
