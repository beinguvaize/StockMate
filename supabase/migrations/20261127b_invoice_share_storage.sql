-- Where a shared invoice's PDF is kept, for the client's download button.
--
-- PRIVATE bucket: no public address, nothing listable. A shop's signed-in
-- staff may read and write only inside their own shop's folder
-- (<tenant id>/<invoice>.pdf), the same rule purchase-bills and
-- product-images use. The client never touches the bucket; the invoice-view
-- Edge Function checks the link and hands out a signed address that works for
-- 60 seconds.
--
-- The app uploads with upsert (one file per invoice, replaced on each share),
-- which needs SELECT + INSERT + UPDATE. DELETE is granted for symmetry, but
-- this platform blocks direct deletes on storage.objects; a revoked link
-- leaves its PDF in the shop's private folder, where only the shop can see it.
--
-- Idempotent.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('invoice-shares', 'invoice-shares', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
   SET public = false,
       file_size_limit = EXCLUDED.file_size_limit,
       allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS ishare_select ON storage.objects;
DROP POLICY IF EXISTS ishare_insert ON storage.objects;
DROP POLICY IF EXISTS ishare_update ON storage.objects;
DROP POLICY IF EXISTS ishare_delete ON storage.objects;

CREATE POLICY ishare_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'invoice-shares' AND (storage.foldername(name))[1] = (public.current_tenant_id())::text);
CREATE POLICY ishare_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoice-shares' AND (storage.foldername(name))[1] = (public.current_tenant_id())::text);
CREATE POLICY ishare_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'invoice-shares' AND (storage.foldername(name))[1] = (public.current_tenant_id())::text)
  WITH CHECK (bucket_id = 'invoice-shares' AND (storage.foldername(name))[1] = (public.current_tenant_id())::text);
CREATE POLICY ishare_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'invoice-shares' AND (storage.foldername(name))[1] = (public.current_tenant_id())::text);
