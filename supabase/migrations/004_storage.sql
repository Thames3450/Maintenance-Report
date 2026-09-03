-- REFERENCE ONLY FOR A NEW / EMPTY SUPABASE PROJECT.
-- DO NOT RUN THIS FILE ON THE CONNECTED MPR Maintenance PROJECT (hftlogubohbjiivcvkut).
-- The live project has already received compatibility migrations. See ../README-LIVE-TH.md.

-- MVR Smart Maintenance
-- 004_storage.sql
-- Private image bucket + RLS. No service-role key is ever used in the browser.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('maintenance-media','maintenance-media',false,8388608,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.can_read_media(p_name text)
returns boolean language sql stable security definer set search_path=''
as $$
  select private.is_admin()
  or exists(
    select 1 from public.repair_images i join public.repair_reports r on r.id=i.repair_report_id
    where i.file_path=p_name and private.can_access_department(r.department_id)
  )
  or exists(
    select 1 from public.app_profiles p
    where p.photo_path=p_name and (p.id=private.current_profile_id() or private.can_access_department(p.department_id))
  )
  or exists(
    select 1 from public.machines m
    where m.photo_path=p_name and private.can_access_department(m.department_id)
  )
$$;
revoke all on function private.can_read_media(text) from public,anon;
grant execute on function private.can_read_media(text) to authenticated;

drop policy if exists mvr_media_read on storage.objects;
drop policy if exists mvr_media_insert on storage.objects;
drop policy if exists mvr_media_delete on storage.objects;

create policy mvr_media_read on storage.objects for select to authenticated
using (bucket_id='maintenance-media' and private.can_read_media(name));

create policy mvr_media_insert on storage.objects for insert to authenticated
with check (
  bucket_id='maintenance-media' and (
    private.is_admin() or name like ('repair/'||(select auth.uid())::text||'/%')
  )
);

create policy mvr_media_delete on storage.objects for delete to authenticated
using (
  bucket_id='maintenance-media' and (
    private.is_admin() or name like ('repair/'||(select auth.uid())::text||'/%')
  )
);
