-- A visible metadata row is not authority to read somebody else's object.
-- Require the uploader's path prefix to match the metadata owner as well.
drop policy if exists "Household can view shared attachment objects" on storage.objects;
create policy "Household can view shared attachment objects"
on storage.objects for select to authenticated using (
  bucket_id = 'attachments'
  and exists (
    select 1 from public.attachments a
    where a.storage_path = storage.objects.name
      and a.user_id::text = split_part(storage.objects.name, '/', 1)
  )
);

-- Restrictive policies also protect against other permissive writer policies.
create policy "Attachment paths belong to metadata owner" on public.attachments
as restrictive for insert to authenticated
with check (user_id = auth.uid() and split_part(storage_path, '/', 1) = user_id::text);
create policy "Attachment path updates belong to metadata owner" on public.attachments
as restrictive for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and split_part(storage_path, '/', 1) = user_id::text);
