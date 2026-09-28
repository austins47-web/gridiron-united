-- League logos: the commissioner's upload was always refused.
--
-- The policies in 20260930000000 read storage.foldername(name) inside a
-- subquery on public.leagues, which has its own `name` column, so `name`
-- meant the league's name ("Watts Upfitting") rather than the file's
-- path, and the folder check never matched. The object's column is now
-- named explicitly. A read policy is added too: an upload that replaces a
-- file (upsert) also needs to read it.

drop policy if exists league_logos_insert on storage.objects;
create policy league_logos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'league-logos'
    and exists (
      select 1 from public.leagues l
      where l.id::text = (storage.foldername(objects.name))[1] and l.commissioner_id = auth.uid()
    )
  );

drop policy if exists league_logos_update on storage.objects;
create policy league_logos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'league-logos'
    and exists (
      select 1 from public.leagues l
      where l.id::text = (storage.foldername(objects.name))[1] and l.commissioner_id = auth.uid()
    )
  );

drop policy if exists league_logos_delete on storage.objects;
create policy league_logos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'league-logos'
    and exists (
      select 1 from public.leagues l
      where l.id::text = (storage.foldername(objects.name))[1] and l.commissioner_id = auth.uid()
    )
  );

-- Logos are public anyway (public bucket); this lets an upsert see the file
drop policy if exists league_logos_read on storage.objects;
create policy league_logos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'league-logos');
