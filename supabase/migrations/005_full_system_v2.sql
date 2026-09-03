-- MVR Smart Maintenance v2.0
-- Live upgrade for project MPR Maintenance.
-- Adds machine groups, structured repair master references, team fields, soft delete/audit,
-- and tightens department-scoped RLS for repair master data.

create table if not exists public.machine_groups (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on update cascade on delete restrict,
  group_code text not null,
  group_name text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(department_id, group_code),
  unique(department_id, group_name)
);

alter table public.machines add column if not exists machine_group_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='machines_machine_group_id_fkey') then
    alter table public.machines add constraint machines_machine_group_id_fkey
      foreign key(machine_group_id) references public.machine_groups(id) on update cascade on delete set null;
  end if;
end $$;
create index if not exists idx_machines_group on public.machines(machine_group_id, is_active);

-- Build groups from the existing machine-name grouping so no existing machine is lost.
insert into public.machine_groups(department_id,group_code,group_name,sort_order,is_active)
select x.department_id,
       case when x.base_code='' then 'GROUP_'||substr(md5(x.group_name),1,8) else x.base_code end as group_code,
       x.group_name,
       x.sort_order,
       true
from (
  select m.department_id,
         m.machine_name as group_name,
         upper(trim(both '_' from regexp_replace(m.machine_name,'[^A-Za-z0-9]+','_','g'))) as base_code,
         row_number() over(partition by m.department_id order by m.machine_name)::int*10 as sort_order
  from public.machines m
  where m.machine_name is not null and btrim(m.machine_name)<>''
  group by m.department_id,m.machine_name
) x
on conflict(department_id,group_name) do nothing;

update public.machines m
set machine_group_id=g.id
from public.machine_groups g
where m.machine_group_id is null
  and g.department_id=m.department_id
  and g.group_name=m.machine_name;

-- Team fields used by Admin and technician cards.
alter table public.app_profiles add column if not exists shift text;
alter table public.app_profiles add column if not exists position text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='app_profiles_shift_check') then
    alter table public.app_profiles add constraint app_profiles_shift_check
      check (shift is null or shift in ('A','B','O')) not valid;
  end if;
end $$;
alter table public.app_profiles validate constraint app_profiles_shift_check;

update public.app_profiles p
set shift=coalesce(p.shift,t.shift),
    position=coalesce(p.position,t.position)
from public.technicians t
where t.id=p.id and (p.shift is null or p.position is null);

create or replace function private.sync_profile_to_legacy_technician()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_code text; v_name text;
begin
  select d.dept_code,d.dept_name into v_code,v_name
  from public.departments d where d.id=new.department_id;
  if new.role='technician' and v_code is null then
    raise exception 'Technician department is required';
  end if;

  insert into public.technicians(
    id,employee_code,full_name,department,department_code,position,role,is_active,shift,auth_user_id
  ) values (
    new.id,new.employee_code,new.full_name,coalesce(v_code,'MVR'),coalesce(v_code,'MVR'),new.position,new.role,new.is_active,new.shift,new.auth_user_id
  )
  on conflict(id) do update set
    employee_code=excluded.employee_code,
    full_name=excluded.full_name,
    department=excluded.department,
    department_code=excluded.department_code,
    position=excluded.position,
    role=excluded.role,
    is_active=excluded.is_active,
    shift=excluded.shift,
    auth_user_id=excluded.auth_user_id;
  return new;
end $$;
revoke all on function private.sync_profile_to_legacy_technician() from public,anon,authenticated;
drop trigger if exists trg_mvr_sync_profile_legacy on public.app_profiles;
create trigger trg_mvr_sync_profile_legacy
after insert or update of employee_code,full_name,department_id,position,role,is_active,shift,auth_user_id
on public.app_profiles for each row execute function private.sync_profile_to_legacy_technician();

create or replace function private.current_department_code()
returns text
language sql
stable
security definer
set search_path=''
as $$
  select d.dept_code
  from public.app_profiles p join public.departments d on d.id=p.department_id
  where p.auth_user_id=(select auth.uid()) and p.is_active=true
  limit 1
$$;
revoke all on function private.current_department_code() from public,anon;
grant execute on function private.current_department_code() to authenticated;

-- Structured references for the technician repair wizard. Existing text columns remain snapshots.
alter table public.repair_reports add column if not exists machine_group_id uuid;
alter table public.repair_reports add column if not exists area_point_id uuid;
alter table public.repair_reports add column if not exists problem_id uuid;
alter table public.repair_reports add column if not exists cause_id uuid;
alter table public.repair_reports add column if not exists action_id uuid;
alter table public.repair_reports add column if not exists area_point_snapshot text;
alter table public.repair_reports add column if not exists deleted_at timestamptz;
alter table public.repair_reports add column if not exists deleted_by uuid;
alter table public.repair_reports add column if not exists delete_reason text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='repair_reports_machine_group_id_fkey') then
    alter table public.repair_reports add constraint repair_reports_machine_group_id_fkey foreign key(machine_group_id) references public.machine_groups(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='repair_reports_area_point_id_fkey') then
    alter table public.repair_reports add constraint repair_reports_area_point_id_fkey foreign key(area_point_id) references public.area_points(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='repair_reports_problem_id_fkey') then
    alter table public.repair_reports add constraint repair_reports_problem_id_fkey foreign key(problem_id) references public.problems(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='repair_reports_cause_id_fkey') then
    alter table public.repair_reports add constraint repair_reports_cause_id_fkey foreign key(cause_id) references public.causes(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='repair_reports_action_id_fkey') then
    alter table public.repair_reports add constraint repair_reports_action_id_fkey foreign key(action_id) references public.actions(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='repair_reports_deleted_by_fkey') then
    alter table public.repair_reports add constraint repair_reports_deleted_by_fkey foreign key(deleted_by) references auth.users(id) on delete set null;
  end if;
end $$;
create index if not exists idx_repairs_group_started on public.repair_reports(machine_group_id,started_at desc);
create index if not exists idx_repairs_point_started on public.repair_reports(area_point_id,started_at desc);
create index if not exists idx_repairs_problem_started on public.repair_reports(problem_id,started_at desc);
create index if not exists idx_repairs_deleted on public.repair_reports(deleted_at) where deleted_at is not null;

-- Backfill group reference for legacy repair reports by machine.
update public.repair_reports r
set machine_group_id=m.machine_group_id
from public.machines m
where r.machine_id=m.id and r.machine_group_id is null;

create table if not exists public.repair_report_audit (
  id uuid primary key default gen_random_uuid(),
  repair_report_id uuid not null,
  action text not null check(action in ('CREATE','UPDATE','DELETE','RESTORE')),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_profile_id uuid references public.app_profiles(id) on delete set null,
  actor_name text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_repair_report_audit_report on public.repair_report_audit(repair_report_id,created_at desc);
create index if not exists idx_repair_report_audit_created on public.repair_report_audit(created_at desc);

create or replace function private.prepare_repair_report()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_profile public.app_profiles%rowtype;
  v_machine public.machines%rowtype;
  v_dept public.departments%rowtype;
  v_group public.machine_groups%rowtype;
  v_point public.area_points%rowtype;
  v_problem public.problems%rowtype;
  v_cause public.causes%rowtype;
  v_action public.actions%rowtype;
  v_admin boolean;
begin
  select * into v_machine from public.machines where id=new.machine_id and is_active=true;
  if v_machine.id is null then raise exception 'Machine not found or inactive'; end if;

  v_admin:=private.is_admin();
  if auth.uid() is not null and not v_admin then
    select * into v_profile from public.app_profiles
    where id=private.current_profile_id() and is_active=true and role='technician';
    if v_profile.id is null then raise exception 'Active technician profile not found'; end if;
    new.technician_id:=v_profile.id;
    new.department_id:=v_profile.department_id;
    if tg_op='UPDATE' then
      new.deleted_at:=old.deleted_at;
      new.deleted_by:=old.deleted_by;
      new.delete_reason:=old.delete_reason;
    end if;
  else
    select * into v_profile from public.app_profiles where id=new.technician_id;
    if v_admin then new.department_id:=v_machine.department_id; end if;
  end if;

  if v_profile.id is null then raise exception 'Technician profile not found'; end if;
  if v_machine.department_id is distinct from new.department_id then
    raise exception 'Machine is outside the report department';
  end if;
  select * into v_dept from public.departments where id=new.department_id and is_active=true;
  if v_dept.id is null then raise exception 'Department is inactive or not found'; end if;

  new.technician_name_snapshot:=v_profile.full_name;
  new.technician_photo_path_snapshot:=v_profile.photo_path;
  new.machine_no_snapshot:=v_machine.machine_no;
  new.machine_name_snapshot:=v_machine.machine_name;
  new.production_line_snapshot:=v_machine.production_line;
  new.machine_group_id:=v_machine.machine_group_id;

  if new.machine_group_id is not null then
    select * into v_group from public.machine_groups where id=new.machine_group_id and is_active=true;
    if v_group.id is null or v_group.department_id is distinct from new.department_id then
      raise exception 'Machine group is invalid';
    end if;
  end if;

  if new.area_point_id is not null then
    select * into v_point from public.area_points where id=new.area_point_id and is_active is distinct from false;
    if v_point.id is null or v_point.machine_id is distinct from new.machine_id then
      raise exception 'Area point does not belong to selected machine';
    end if;
    new.area_point_snapshot:=v_point.point_name;
  elsif tg_op='INSERT' and not (v_dept.free_text_entry or v_dept.free_text_machine_problem) then
    raise exception 'Area point must be selected from Master Data';
  end if;

  if new.problem_id is not null then
    select * into v_problem from public.problems where id=new.problem_id and is_active is distinct from false;
    if v_problem.id is null then raise exception 'Problem not found or inactive'; end if;
    if not (v_problem.department_code=v_dept.dept_code or (v_dept.dept_code='MVR' and v_problem.department_code is null)) then
      raise exception 'Problem is outside selected department';
    end if;
    if v_machine.line_id is not null
       and exists(select 1 from public.line_problem_map x where x.line_id=v_machine.line_id)
       and not exists(select 1 from public.line_problem_map x where x.line_id=v_machine.line_id and x.problem_id=new.problem_id) then
      raise exception 'Problem is not enabled for selected production line';
    end if;
    new.symptom:=v_problem.problem_name;
    new.problem_type:=v_problem.breakdown_type;
  elsif tg_op='INSERT' and not (v_dept.free_text_entry or v_dept.free_text_machine_problem) then
    raise exception 'Problem must be selected from Master Data';
  elsif coalesce(btrim(new.symptom),'')='' then
    raise exception 'Problem description is required';
  end if;

  if new.cause_id is not null then
    select * into v_cause from public.causes where id=new.cause_id and is_active is distinct from false;
    if v_cause.id is null then raise exception 'Cause not found or inactive'; end if;
    if not (v_cause.department_code=v_dept.dept_code or (v_dept.dept_code='MVR' and v_cause.department_code is null)) then
      raise exception 'Cause is outside selected department';
    end if;
    if v_machine.line_id is not null
       and exists(select 1 from public.line_cause_map x where x.line_id=v_machine.line_id)
       and not exists(select 1 from public.line_cause_map x where x.line_id=v_machine.line_id and x.cause_id=new.cause_id) then
      raise exception 'Cause is not enabled for selected production line';
    end if;
    new.cause:=v_cause.cause_name;
  elsif tg_op='INSERT' and not (v_dept.free_text_entry or v_dept.free_text_cause_action) then
    raise exception 'Cause must be selected from Master Data';
  elsif coalesce(btrim(new.cause),'')='' then
    raise exception 'Cause is required';
  end if;

  if new.action_id is not null then
    select * into v_action from public.actions where id=new.action_id and is_active is distinct from false;
    if v_action.id is null then raise exception 'Action not found or inactive'; end if;
    if not (v_action.department_code=v_dept.dept_code or (v_dept.dept_code='MVR' and v_action.department_code is null)) then
      raise exception 'Action is outside selected department';
    end if;
    if v_machine.line_id is not null
       and exists(select 1 from public.line_action_map x where x.line_id=v_machine.line_id)
       and not exists(select 1 from public.line_action_map x where x.line_id=v_machine.line_id and x.action_id=new.action_id) then
      raise exception 'Action is not enabled for selected production line';
    end if;
    new.action_taken:=v_action.action_name;
  elsif tg_op='INSERT' and not (v_dept.free_text_entry or v_dept.free_text_cause_action) then
    raise exception 'Action must be selected from Master Data';
  elsif coalesce(btrim(new.action_taken),'')='' then
    raise exception 'Action is required';
  end if;

  if new.finished_at is not null then
    if new.finished_at<new.started_at then raise exception 'Repair finish time cannot be before start time'; end if;
    new.loss_time_min:=greatest(0,round(extract(epoch from(new.finished_at-new.started_at))/60.0)::int);
  else
    new.loss_time_min:=0;
  end if;
  if new.finished_at is null then
    raise exception 'Repair report requires finish time';
  end if;
  return new;
end $$;
revoke all on function private.prepare_repair_report() from public,anon,authenticated;

create or replace function private.audit_repair_report()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_action text; v_profile public.app_profiles%rowtype;
begin
  select * into v_profile from public.app_profiles where auth_user_id=auth.uid() limit 1;
  if tg_op='INSERT' then v_action:='CREATE';
  elsif old.deleted_at is null and new.deleted_at is not null then v_action:='DELETE';
  elsif old.deleted_at is not null and new.deleted_at is null then v_action:='RESTORE';
  else v_action:='UPDATE'; end if;
  insert into public.repair_report_audit(
    repair_report_id,action,actor_user_id,actor_profile_id,actor_name,old_data,new_data
  ) values(
    coalesce(new.id,old.id),v_action,auth.uid(),v_profile.id,v_profile.full_name,
    case when tg_op='INSERT' then null else to_jsonb(old) end,
    case when tg_op='DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new,old);
end $$;
revoke all on function private.audit_repair_report() from public,anon,authenticated;
drop trigger if exists trg_mvr_audit_repair_report on public.repair_reports;
create trigger trg_mvr_audit_repair_report
after insert or update on public.repair_reports for each row execute function private.audit_repair_report();

create or replace function public.mvr_soft_delete_repair(p_report_id uuid,p_reason text default null)
returns void
language plpgsql
security invoker
set search_path='public,pg_temp'
as $$
begin
  if not private.is_admin() then raise exception 'Admin permission required'; end if;
  update public.repair_reports
  set deleted_at=now(),deleted_by=auth.uid(),delete_reason=nullif(btrim(p_reason),'')
  where id=p_report_id and deleted_at is null;
  if not found then raise exception 'Report not found'; end if;
end $$;
revoke all on function public.mvr_soft_delete_repair(uuid,text) from public,anon;
grant execute on function public.mvr_soft_delete_repair(uuid,text) to authenticated;

create or replace function public.mvr_restore_repair(p_report_id uuid)
returns void
language plpgsql
security invoker
set search_path='public,pg_temp'
as $$
begin
  if not private.is_admin() then raise exception 'Admin permission required'; end if;
  update public.repair_reports set deleted_at=null,deleted_by=null,delete_reason=null where id=p_report_id;
  if not found then raise exception 'Report not found'; end if;
end $$;
revoke all on function public.mvr_restore_repair(uuid) from public,anon;
grant execute on function public.mvr_restore_repair(uuid) to authenticated;

-- RLS: machine groups.
alter table public.machine_groups enable row level security;
revoke all on public.machine_groups from anon;
revoke all on public.machine_groups from authenticated;
grant select,insert,update,delete on public.machine_groups to authenticated;
drop policy if exists mvr_machine_groups_read on public.machine_groups;
drop policy if exists mvr_machine_groups_admin_insert on public.machine_groups;
drop policy if exists mvr_machine_groups_admin_update on public.machine_groups;
drop policy if exists mvr_machine_groups_admin_delete on public.machine_groups;
create policy mvr_machine_groups_read on public.machine_groups for select to authenticated
using (private.is_active_user() and private.can_access_department(department_id));
create policy mvr_machine_groups_admin_insert on public.machine_groups for insert to authenticated with check(private.is_admin());
create policy mvr_machine_groups_admin_update on public.machine_groups for update to authenticated using(private.is_admin()) with check(private.is_admin());
create policy mvr_machine_groups_admin_delete on public.machine_groups for delete to authenticated using(private.is_admin());

-- RLS: repair report soft-delete visibility; no hard delete from client.
drop policy if exists mvr_repairs_read on public.repair_reports;
drop policy if exists mvr_repairs_admin_delete on public.repair_reports;
create policy mvr_repairs_read on public.repair_reports for select to authenticated
using (
  private.is_active_user()
  and private.can_access_department(department_id)
  and (private.is_admin() or deleted_at is null)
);
revoke delete on public.repair_reports from authenticated;

-- RLS for the new audit table.
alter table public.repair_report_audit enable row level security;
revoke all on public.repair_report_audit from anon,authenticated;
grant select on public.repair_report_audit to authenticated;
drop policy if exists mvr_repair_audit_admin_read on public.repair_report_audit;
create policy mvr_repair_audit_admin_read on public.repair_report_audit for select to authenticated using(private.is_admin());

-- Department-scope legacy master data used by the new technician wizard.
drop policy if exists problems_read on public.problems;
create policy problems_read on public.problems for select to authenticated using(
  private.is_admin() or (
    private.is_active_user() and
    (department_code=private.current_department_code() or (private.current_department_code()='MVR' and department_code is null))
  )
);
drop policy if exists causes_read on public.causes;
create policy causes_read on public.causes for select to authenticated using(
  private.is_admin() or (
    private.is_active_user() and
    (department_code=private.current_department_code() or (private.current_department_code()='MVR' and department_code is null))
  )
);
drop policy if exists actions_read on public.actions;
create policy actions_read on public.actions for select to authenticated using(
  private.is_admin() or (
    private.is_active_user() and
    (department_code=private.current_department_code() or (private.current_department_code()='MVR' and department_code is null))
  )
);
drop policy if exists area_points_read on public.area_points;
create policy area_points_read on public.area_points for select to authenticated using(
  private.is_admin() or exists(
    select 1 from public.machines m where m.id=area_points.machine_id and private.can_access_department(m.department_id)
  )
);
drop policy if exists production_lines_read on public.production_lines;
create policy production_lines_read on public.production_lines for select to authenticated using(
  private.is_admin() or exists(
    select 1 from public.machines m where m.line_id=production_lines.id and private.can_access_department(m.department_id)
  )
);
drop policy if exists line_problem_map_read on public.line_problem_map;
create policy line_problem_map_read on public.line_problem_map for select to authenticated using(
  private.is_admin() or exists(select 1 from public.machines m where m.line_id=line_problem_map.line_id and private.can_access_department(m.department_id))
);
drop policy if exists line_cause_map_read on public.line_cause_map;
create policy line_cause_map_read on public.line_cause_map for select to authenticated using(
  private.is_admin() or exists(select 1 from public.machines m where m.line_id=line_cause_map.line_id and private.can_access_department(m.department_id))
);
drop policy if exists line_action_map_read on public.line_action_map;
create policy line_action_map_read on public.line_action_map for select to authenticated using(
  private.is_admin() or exists(select 1 from public.machines m where m.line_id=line_action_map.line_id and private.can_access_department(m.department_id))
);

-- Make updated_at reliable for machine groups.
drop trigger if exists trg_mvr_touch_machine_groups on public.machine_groups;
create trigger trg_mvr_touch_machine_groups before update on public.machine_groups
for each row execute function private.touch_updated_at();
