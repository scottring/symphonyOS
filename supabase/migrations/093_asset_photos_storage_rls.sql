-- 093_asset_photos_storage_rls.sql
-- Phase 1A polish: storage policies for the public asset-photos bucket.
-- Path convention: <user_id>/<timestamp>-<filename>
-- The bucket itself is public (anyone with the URL can view), so we only
-- need write-side policies tied to auth.uid().

create policy "Users can upload own asset photos"
  on storage.objects for insert
  with check (
    bucket_id = 'asset-photos'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "Users can update own asset photos"
  on storage.objects for update
  using (
    bucket_id = 'asset-photos'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own asset photos"
  on storage.objects for delete
  using (
    bucket_id = 'asset-photos'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );
