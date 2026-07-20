/*
# Create storage bucket for product images

1. New Storage Bucket
- `produtos-fotos` — public bucket for product photos uploaded from the app.
- Files are publicly readable so product images load in the PDV and customer menu.
- Only authenticated users (gerente) can upload and overwrite files.
2. Security
- Public read: anyone can view product images (anon + authenticated).
- Authenticated write: only signed-in users can upload, update, delete.
3. Important Notes
- Bucket is created with `public = true` so URLs are accessible without signed URLs.
- Storage policies use `auth.role() = 'authenticated'` for write operations.
- File naming convention: `produtos/<uuid>.<ext>` to avoid collisions.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('produtos-fotos', 'produtos-fotos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read policy
DROP POLICY IF EXISTS "public_read_produtos_fotos" ON storage.objects;
CREATE POLICY "public_read_produtos_fotos"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'produtos-fotos');

-- Authenticated upload
DROP POLICY IF EXISTS "auth_upload_produtos_fotos" ON storage.objects;
CREATE POLICY "auth_upload_produtos_fotos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'produtos-fotos');

-- Authenticated update (overwrite)
DROP POLICY IF EXISTS "auth_update_produtos_fotos" ON storage.objects;
CREATE POLICY "auth_update_produtos_fotos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'produtos-fotos')
WITH CHECK (bucket_id = 'produtos-fotos');

-- Authenticated delete
DROP POLICY IF EXISTS "auth_delete_produtos_fotos" ON storage.objects;
CREATE POLICY "auth_delete_produtos_fotos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'produtos-fotos');
