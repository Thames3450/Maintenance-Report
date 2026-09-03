-- v2.22: allow an authenticated technician to read metadata for repair images
-- under their own auth.uid() prefix immediately after upload.
-- This breaks the previous circular dependency where mvr_create_repair_report()
-- checked storage.objects, but mvr_media_read only allowed files already linked
-- to a saved repair report.

drop policy if exists mvr_media_read on storage.objects;

create policy mvr_media_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'maintenance-media'
  and (
    private.is_admin()
    or name like ('repair/' || (select auth.uid())::text || '/%')
    or private.can_read_media(name)
  )
);
