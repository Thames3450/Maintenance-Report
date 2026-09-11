-- Spare Request department history for technicians
-- Technicians can READ requests/photos in their own department, but cannot edit other users' requests.
-- Admin behavior remains unchanged.

drop policy if exists spare_requests_read on public.spare_requests;
create policy spare_requests_read
on public.spare_requests
for select
to authenticated
using (private.can_access_department(department_id));

drop policy if exists spare_request_images_read on public.spare_request_images;
create policy spare_request_images_read
on public.spare_request_images
for select
to authenticated
using (
  exists (
    select 1
    from public.spare_requests r
    where r.id = spare_request_images.request_id
      and private.can_access_department(r.department_id)
  )
);

create or replace function private.can_read_media(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
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
  or exists(
    select 1 from public.spare_request_images i
    join public.spare_requests r on r.id=i.request_id
    where i.file_path=p_name
      and private.can_access_department(r.department_id)
  )
$function$;
