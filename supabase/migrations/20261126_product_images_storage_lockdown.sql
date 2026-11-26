-- product-images was writable by anyone on the internet: "Public Upload" and
-- "Public Update/Delete" were granted to role public, so a caller who was not
-- signed in could upload into, overwrite or delete any shop's product photos,
-- and "Public Read" let them list every shop's folder.
--
-- Now: only signed-in staff, and only inside their own shop's folder
-- (<tenant id>/...), the same rule purchase-bills already uses. The bucket
-- stays public, so a photo's own address still opens without a sign-in --
-- that is how product pictures and the signature on a printed bill load.
DROP POLICY IF EXISTS "Public Read" ON storage.objects;
DROP POLICY IF EXISTS "Public Upload" ON storage.objects;
DROP POLICY IF EXISTS "Public Update/Delete" ON storage.objects;
DROP POLICY IF EXISTS pimg_select ON storage.objects;
DROP POLICY IF EXISTS pimg_insert ON storage.objects;
DROP POLICY IF EXISTS pimg_update ON storage.objects;
DROP POLICY IF EXISTS pimg_delete ON storage.objects;

CREATE POLICY pimg_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = (public.current_tenant_id())::text);
CREATE POLICY pimg_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND (storage.foldername(name))[1] = (public.current_tenant_id())::text);
CREATE POLICY pimg_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = (public.current_tenant_id())::text)
  WITH CHECK (bucket_id = 'product-images' AND (storage.foldername(name))[1] = (public.current_tenant_id())::text);
CREATE POLICY pimg_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = (public.current_tenant_id())::text);

-- Pictures only, and nothing huge. 5 MB leaves room for a web session still
-- running the old page, which uploads the camera original.
UPDATE storage.buckets
   SET file_size_limit = 5242880,
       allowed_mime_types = ARRAY['image/*']
 WHERE id = 'product-images';
