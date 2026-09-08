-- v2.29 Spare Request Collection / ระบบรวบรวมความต้องการอะไหล่
-- Additive only: does not alter repair / PM technician workflows.

create table if not exists public.spare_request_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no text not null unique,
  batch_date date not null default ((now() at time zone 'Asia/Bangkok')::date),
  status text not null default 'draft' check (status in ('draft','sent','cancelled')),
  note text,
  created_by uuid not null references public.app_profiles(id) on delete restrict,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence if not exists public.spare_request_batch_seq start 1;

create table if not exists public.spare_requests (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  machine_id uuid references public.machines(id) on delete set null,
  requester_profile_id uuid not null references public.app_profiles(id) on delete restrict,
  requester_name_snapshot text not null,
  requester_code_snapshot text,
  requester_shift_snapshot text,
  requester_role_snapshot text,
  source_type text not null default 'technician'
    check (source_type in ('technician','engineer','breakdown','pm','inspection','other')),

  requested_part_name text not null,
  requested_part_no text,
  requested_specification text,
  requested_reason text not null,

  part_name text not null,
  part_no text,
  specification text,
  quantity numeric(12,3) not null check (quantity > 0),
  unit text not null default 'pcs',
  urgency text not null default 'planned'
    check (urgency in ('urgent','planned','improvement')),
  remark text,
  admin_note text,
  follow_up_note text,

  status text not null default 'new'
    check (status in ('new','review','ready','sent','follow_up','closed')),
  status_changed_at timestamptz not null default now(),
  batch_id uuid references public.spare_request_batches(id) on delete set null,
  repair_report_id uuid references public.repair_reports(id) on delete set null,
  pm_schedule_id uuid references public.pm_schedule(id) on delete set null,

  reviewed_by uuid references public.app_profiles(id) on delete set null,
  closed_by uuid references public.app_profiles(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.spare_request_images (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.spare_requests(id) on delete cascade,
  image_type text not null default 'part'
    check (image_type in ('part','nameplate','installation','other')),
  file_name text,
  file_path text not null unique,
  uploaded_by uuid not null references public.app_profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists spare_requests_department_idx on public.spare_requests(department_id);
create index if not exists spare_requests_requester_idx on public.spare_requests(requester_profile_id);
create index if not exists spare_requests_status_idx on public.spare_requests(status,status_changed_at);
create index if not exists spare_requests_batch_idx on public.spare_requests(batch_id);
create index if not exists spare_requests_machine_idx on public.spare_requests(machine_id);
create index if not exists spare_request_images_request_idx on public.spare_request_images(request_id);
create index if not exists spare_batches_status_idx on public.spare_request_batches(status,batch_date);
create index if not exists spare_batches_created_by_idx on public.spare_request_batches(created_by);
create index if not exists spare_request_images_uploaded_by_idx on public.spare_request_images(uploaded_by);
create index if not exists spare_requests_reviewed_by_idx on public.spare_requests(reviewed_by);
create index if not exists spare_requests_closed_by_idx on public.spare_requests(closed_by);
create index if not exists spare_requests_repair_report_idx on public.spare_requests(repair_report_id);
create index if not exists spare_requests_pm_schedule_idx on public.spare_requests(pm_schedule_id);

create or replace function public.spare_requests_touch()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  new.updated_at = now();
  if new.status is distinct from old.status then
    new.status_changed_at = now();
  end if;
  if new.status = 'closed' and old.status is distinct from 'closed' then
    new.closed_at = coalesce(new.closed_at, now());
    new.closed_by = coalesce(new.closed_by, private.current_profile_id());
  elsif new.status is distinct from 'closed' then
    new.closed_at = null;
    new.closed_by = null;
  end if;
  return new;
end;
$$;

drop trigger if exists spare_requests_touch on public.spare_requests;
create trigger spare_requests_touch
before update on public.spare_requests
for each row execute function public.spare_requests_touch();

create or replace function public.spare_batches_touch()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists spare_batches_touch on public.spare_request_batches;
create trigger spare_batches_touch
before update on public.spare_request_batches
for each row execute function public.spare_batches_touch();

alter table public.spare_requests enable row level security;
alter table public.spare_request_images enable row level security;
alter table public.spare_request_batches enable row level security;

-- Request visibility: Admin sees all. Technician sees only requests created under their own profile.
drop policy if exists spare_requests_read on public.spare_requests;
create policy spare_requests_read on public.spare_requests
for select to authenticated
using (private.is_admin() or requester_profile_id = private.current_profile_id());

drop policy if exists spare_requests_insert on public.spare_requests;
create policy spare_requests_insert on public.spare_requests
for insert to authenticated
with check (
  private.is_admin()
  or (
    requester_profile_id = private.current_profile_id()
    and department_id = private.current_department_id()
  )
);

drop policy if exists spare_requests_admin_update on public.spare_requests;
create policy spare_requests_admin_update on public.spare_requests
for update to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists spare_requests_admin_delete on public.spare_requests;
create policy spare_requests_admin_delete on public.spare_requests
for delete to authenticated
using (private.is_admin());

-- Images follow the request owner. Admin can manage all.
drop policy if exists spare_request_images_read on public.spare_request_images;
create policy spare_request_images_read on public.spare_request_images
for select to authenticated
using (
  private.is_admin()
  or exists (
    select 1 from public.spare_requests r
    where r.id = request_id
      and r.requester_profile_id = private.current_profile_id()
  )
);

drop policy if exists spare_request_images_insert on public.spare_request_images;
create policy spare_request_images_insert on public.spare_request_images
for insert to authenticated
with check (
  private.is_admin()
  or (
    uploaded_by = private.current_profile_id()
    and exists (
      select 1 from public.spare_requests r
      where r.id = request_id
        and r.requester_profile_id = private.current_profile_id()
    )
  )
);

drop policy if exists spare_request_images_delete on public.spare_request_images;
create policy spare_request_images_delete on public.spare_request_images
for delete to authenticated
using (private.is_admin() or uploaded_by = private.current_profile_id());

-- Batches are an Admin workspace only.
drop policy if exists spare_batches_admin_read on public.spare_request_batches;
create policy spare_batches_admin_read on public.spare_request_batches
for select to authenticated using (private.is_admin());

drop policy if exists spare_batches_admin_insert on public.spare_request_batches;
create policy spare_batches_admin_insert on public.spare_request_batches
for insert to authenticated with check (private.is_admin());

drop policy if exists spare_batches_admin_update on public.spare_request_batches;
create policy spare_batches_admin_update on public.spare_request_batches
for update to authenticated using (private.is_admin()) with check (private.is_admin());

drop policy if exists spare_batches_admin_delete on public.spare_request_batches;
create policy spare_batches_admin_delete on public.spare_request_batches
for delete to authenticated using (private.is_admin());

grant select,insert,update,delete on public.spare_requests to authenticated;
grant select,insert,delete on public.spare_request_images to authenticated;
grant select,insert,update,delete on public.spare_request_batches to authenticated;
grant usage,select on sequence public.spare_request_batch_seq to authenticated;

-- Create one draft batch atomically and attach selected ready requests.
create or replace function public.create_spare_request_batch(p_request_ids uuid[], p_note text default null)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_batch_id uuid;
  v_batch_no text;
  v_updated integer;
begin
  if not private.is_admin() then
    raise exception 'Admin only';
  end if;
  if p_request_ids is null or cardinality(p_request_ids)=0 then
    raise exception 'No spare requests selected';
  end if;

  v_batch_no := 'SPR-' || to_char(now() at time zone 'Asia/Bangkok','YYYYMMDD') || '-' || lpad(nextval('public.spare_request_batch_seq')::text,4,'0');
  insert into public.spare_request_batches(batch_no,note,created_by)
  values(v_batch_no,nullif(btrim(coalesce(p_note,'')),''),private.current_profile_id())
  returning id into v_batch_id;

  update public.spare_requests
  set batch_id=v_batch_id, updated_at=now()
  where id = any(p_request_ids)
    and status='ready'
    and batch_id is null;
  get diagnostics v_updated = row_count;

  if v_updated <> cardinality(p_request_ids) then
    raise exception 'Some selected requests are not Ready or already belong to a batch';
  end if;
  return v_batch_id;
end;
$$;
revoke all on function public.create_spare_request_batch(uuid[],text) from public,anon;
grant execute on function public.create_spare_request_batch(uuid[],text) to authenticated;

-- Mark a batch sent and move every item to Sent in one transaction.
create or replace function public.mark_spare_request_batch_sent(p_batch_id uuid)
returns void
language plpgsql
security invoker
set search_path=''
as $$
begin
  if not private.is_admin() then
    raise exception 'Admin only';
  end if;
  update public.spare_request_batches
  set status='sent',sent_at=coalesce(sent_at,now()),updated_at=now()
  where id=p_batch_id and status='draft';
  if not found then
    raise exception 'Draft batch not found';
  end if;
  update public.spare_requests
  set status='sent',status_changed_at=now(),updated_at=now()
  where batch_id=p_batch_id and status='ready';
end;
$$;
revoke all on function public.mark_spare_request_batch_sent(uuid) from public,anon;
grant execute on function public.mark_spare_request_batch_sent(uuid) to authenticated;

-- Extend private storage read access for spare request images.
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
  or exists(
    select 1 from public.spare_request_images i
    join public.spare_requests r on r.id=i.request_id
    where i.file_path=p_name
      and (private.is_admin() or r.requester_profile_id=private.current_profile_id())
  )
$$;
revoke all on function private.can_read_media(text) from public,anon;
grant execute on function private.can_read_media(text) to authenticated;

-- Keep existing maintenance-media bucket, allow each signed-in user to upload/delete only under their own spare/<auth.uid>/ path.
drop policy if exists mvr_media_insert on storage.objects;
create policy mvr_media_insert on storage.objects for insert to authenticated
with check (
  bucket_id='maintenance-media' and (
    private.is_admin()
    or name like ('repair/'||(select auth.uid())::text||'/%')
    or name like ('spare/'||(select auth.uid())::text||'/%')
  )
);

drop policy if exists mvr_media_delete on storage.objects;
create policy mvr_media_delete on storage.objects for delete to authenticated
using (
  bucket_id='maintenance-media' and (
    private.is_admin()
    or name like ('repair/'||(select auth.uid())::text||'/%')
    or name like ('spare/'||(select auth.uid())::text||'/%')
  )
);
