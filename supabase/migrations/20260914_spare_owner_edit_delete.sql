-- v2.35.0 — Technician owner edit/delete for Spare Request + audit + image management

create table if not exists public.spare_request_audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid,
  action text not null check (action in ('UPDATE','DELETE')),
  actor_profile_id uuid references public.app_profiles(id) on delete set null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.spare_request_audit enable row level security;

drop policy if exists spare_request_audit_admin_read on public.spare_request_audit;
create policy spare_request_audit_admin_read on public.spare_request_audit
for select to authenticated using (private.is_admin());

drop policy if exists spare_requests_owner_update on public.spare_requests;
create policy spare_requests_owner_update on public.spare_requests
for update to authenticated
using (private.is_technician() and requester_profile_id=private.current_profile_id() and department_id=private.current_department_id())
with check (private.is_technician() and requester_profile_id=private.current_profile_id() and department_id=private.current_department_id());

drop policy if exists spare_requests_owner_delete on public.spare_requests;
create policy spare_requests_owner_delete on public.spare_requests
for delete to authenticated
using (private.is_technician() and requester_profile_id=private.current_profile_id() and department_id=private.current_department_id());

create or replace function private.protect_spare_request_owner_workflow()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or private.is_admin() then return new; end if;
  if private.is_technician() and old.requester_profile_id=private.current_profile_id() and old.department_id=private.current_department_id() then
    new.department_id:=old.department_id;
    new.requester_profile_id:=old.requester_profile_id;
    new.requester_name_snapshot:=old.requester_name_snapshot;
    new.requester_code_snapshot:=old.requester_code_snapshot;
    new.requester_shift_snapshot:=old.requester_shift_snapshot;
    new.requester_role_snapshot:=old.requester_role_snapshot;
    new.source_type:=old.source_type;
    new.status:=old.status;
    new.status_changed_at:=old.status_changed_at;
    new.batch_id:=old.batch_id;
    new.repair_report_id:=old.repair_report_id;
    new.pm_schedule_id:=old.pm_schedule_id;
    new.reviewed_by:=old.reviewed_by;
    new.closed_by:=old.closed_by;
    new.closed_at:=old.closed_at;
    new.admin_note:=old.admin_note;
    new.follow_up_note:=old.follow_up_note;
    new.created_at:=old.created_at;
    if new.machine_id is not null and not exists(select 1 from public.machines m where m.id=new.machine_id and m.department_id=old.department_id) then
      raise exception 'Machine must belong to the requester department';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_spare_request_owner_workflow on public.spare_requests;
create trigger trg_protect_spare_request_owner_workflow before update on public.spare_requests
for each row execute function private.protect_spare_request_owner_workflow();

create or replace function private.audit_spare_request_change()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if tg_op='UPDATE' then
    insert into public.spare_request_audit(request_id,action,actor_profile_id,old_data,new_data)
    values(old.id,'UPDATE',private.current_profile_id(),to_jsonb(old),to_jsonb(new));
    return new;
  elsif tg_op='DELETE' then
    insert into public.spare_request_audit(request_id,action,actor_profile_id,old_data,new_data)
    values(old.id,'DELETE',private.current_profile_id(),to_jsonb(old),null);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_audit_spare_request_change on public.spare_requests;
create trigger trg_audit_spare_request_change after update or delete on public.spare_requests
for each row execute function private.audit_spare_request_change();

drop policy if exists spare_request_images_delete on public.spare_request_images;
create policy spare_request_images_delete on public.spare_request_images
for delete to authenticated
using (
  private.is_admin()
  or exists(select 1 from public.spare_requests r where r.id=spare_request_images.request_id and r.requester_profile_id=private.current_profile_id() and r.department_id=private.current_department_id())
);

create or replace function private.can_manage_spare_media(p_name text)
returns boolean language sql stable security definer set search_path=''
as $$
  select private.is_admin()
  or exists(
    select 1 from public.spare_request_images i
    join public.spare_requests r on r.id=i.request_id
    where i.file_path=p_name and r.requester_profile_id=private.current_profile_id() and r.department_id=private.current_department_id()
  )
$$;

drop policy if exists mvr_media_delete on storage.objects;
create policy mvr_media_delete on storage.objects for delete to authenticated
using (
  bucket_id='maintenance-media'
  and (
    private.is_admin()
    or name like ('repair/' || (select auth.uid())::text || '/%')
    or name like ('spare/' || (select auth.uid())::text || '/%')
    or private.can_manage_spare_media(name)
  )
);
