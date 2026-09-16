-- 19 FUTURE DISPO products carry a SKU in the hsn_code column -- TES, TEB, LD0,
-- LD00, LD1..LD10, HM00, HM01, PKT1316, KG1316, PKT1620, KG1620, P12, STB, STS.
--
-- An HSN must be 4, 6 or 8 digits. These print on invoices and purchase
-- vouchers and flow into the GSTR-1 HSN summary (Table 12), where a made-up
-- code is worse than an absent one: a blank is visibly incomplete, whereas
-- "TES" looks deliberate and nothing downstream questions it.
--
-- Cleared rather than replaced, at the owner's direction. Assigning a tax code
-- is their call with their accountant, not an inference from a product name --
-- the tenant has no existing tissue or straw product to take a precedent from.
--
-- 12 of the 19 already carry the same string in `sku`, so nothing is lost there.
-- The other 7 have an empty sku and the hsn_code string is the only record of
-- that code, which is why the snapshot below is taken before anything changes.
--
-- The import paths that let these in are fixed in the same change
-- (src/lib/hsn.js, used by ImportData and BulkAdd), so this is a one-off
-- cleanup and not a recurring chore.

CREATE SCHEMA IF NOT EXISTS snap;

DROP TABLE IF EXISTS snap.invalid_hsn_20260805;
CREATE TABLE snap.invalid_hsn_20260805 AS
SELECT id, tenant_id, name, sku, hsn_code, "taxRate", category, now() AS taken_at
FROM public.products
WHERE deleted_at IS NULL
  AND hsn_code IS NOT NULL
  AND btrim(hsn_code) <> ''
  AND hsn_code !~ '^(\d{4}|\d{6}|\d{8})$';

UPDATE public.products
   SET hsn_code = NULL, updated_at = now()
 WHERE tenant_id = 'fd4927bf-c084-4bed-ba13-d30e650da6f3'
   AND deleted_at IS NULL
   AND hsn_code IS NOT NULL
   AND btrim(hsn_code) <> ''
   AND hsn_code !~ '^(\d{4}|\d{6}|\d{8})$';

DO $chk$
DECLARE v_left int; v_snap int;
BEGIN
  SELECT count(*) INTO v_snap FROM snap.invalid_hsn_20260805;

  SELECT count(*) INTO v_left
  FROM public.products
  WHERE tenant_id = 'fd4927bf-c084-4bed-ba13-d30e650da6f3'
    AND deleted_at IS NULL
    AND hsn_code IS NOT NULL
    AND btrim(hsn_code) <> ''
    AND hsn_code !~ '^(\d{4}|\d{6}|\d{8})$';

  IF v_left > 0 THEN
    RAISE EXCEPTION '% invalid HSN codes remain', v_left;
  END IF;
  IF v_snap <> 19 THEN
    RAISE EXCEPTION 'expected 19 snapshotted rows, got % - check before trusting the rollback', v_snap;
  END IF;
END $chk$;
