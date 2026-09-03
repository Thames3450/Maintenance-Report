-- MVR Smart Maintenance v2.8
-- Department input modes + machine-specific Problem/Cause/Action mappings.
-- Live project hftlogubohbjiivcvkut has already received this migration.

update public.departments
set free_text_machine_problem=true,
    free_text_cause_action=true,
    free_text_entry=false
where free_text_entry=true;

create table if not exists public.machine_problem_map (
  machine_id uuid not null references public.machines(id) on delete cascade,
  problem_id uuid not null references public.problems(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(machine_id,problem_id)
);
create table if not exists public.machine_cause_map (
  machine_id uuid not null references public.machines(id) on delete cascade,
  cause_id uuid not null references public.causes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(machine_id,cause_id)
);
create table if not exists public.machine_action_map (
  machine_id uuid not null references public.machines(id) on delete cascade,
  action_id uuid not null references public.actions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(machine_id,action_id)
);

create index if not exists idx_machine_problem_map_problem on public.machine_problem_map(problem_id);
create index if not exists idx_machine_cause_map_cause on public.machine_cause_map(cause_id);
create index if not exists idx_machine_action_map_action on public.machine_action_map(action_id);

insert into public.machine_problem_map(machine_id,problem_id)
select distinct m.id,x.problem_id from public.machines m join public.line_problem_map x on x.line_id=m.line_id
where m.line_id is not null on conflict do nothing;
insert into public.machine_cause_map(machine_id,cause_id)
select distinct m.id,x.cause_id from public.machines m join public.line_cause_map x on x.line_id=m.line_id
where m.line_id is not null on conflict do nothing;
insert into public.machine_action_map(machine_id,action_id)
select distinct m.id,x.action_id from public.machines m join public.line_action_map x on x.line_id=m.line_id
where m.line_id is not null on conflict do nothing;

alter table public.machine_problem_map enable row level security;
alter table public.machine_cause_map enable row level security;
alter table public.machine_action_map enable row level security;

revoke all on public.machine_problem_map from anon,authenticated;
revoke all on public.machine_cause_map from anon,authenticated;
revoke all on public.machine_action_map from anon,authenticated;
grant select,insert,delete on public.machine_problem_map to authenticated;
grant select,insert,delete on public.machine_cause_map to authenticated;
grant select,insert,delete on public.machine_action_map to authenticated;

drop policy if exists mvr_machine_problem_map_read on public.machine_problem_map;
drop policy if exists mvr_machine_problem_map_admin_insert on public.machine_problem_map;
drop policy if exists mvr_machine_problem_map_admin_delete on public.machine_problem_map;
create policy mvr_machine_problem_map_read on public.machine_problem_map for select to authenticated
using(private.is_active_user() and (private.is_admin() or exists(select 1 from public.machines m where m.id=machine_problem_map.machine_id and private.can_access_department(m.department_id))));
create policy mvr_machine_problem_map_admin_insert on public.machine_problem_map for insert to authenticated with check(private.is_admin());
create policy mvr_machine_problem_map_admin_delete on public.machine_problem_map for delete to authenticated using(private.is_admin());

drop policy if exists mvr_machine_cause_map_read on public.machine_cause_map;
drop policy if exists mvr_machine_cause_map_admin_insert on public.machine_cause_map;
drop policy if exists mvr_machine_cause_map_admin_delete on public.machine_cause_map;
create policy mvr_machine_cause_map_read on public.machine_cause_map for select to authenticated
using(private.is_active_user() and (private.is_admin() or exists(select 1 from public.machines m where m.id=machine_cause_map.machine_id and private.can_access_department(m.department_id))));
create policy mvr_machine_cause_map_admin_insert on public.machine_cause_map for insert to authenticated with check(private.is_admin());
create policy mvr_machine_cause_map_admin_delete on public.machine_cause_map for delete to authenticated using(private.is_admin());

drop policy if exists mvr_machine_action_map_read on public.machine_action_map;
drop policy if exists mvr_machine_action_map_admin_insert on public.machine_action_map;
drop policy if exists mvr_machine_action_map_admin_delete on public.machine_action_map;
create policy mvr_machine_action_map_read on public.machine_action_map for select to authenticated
using(private.is_active_user() and (private.is_admin() or exists(select 1 from public.machines m where m.id=machine_action_map.machine_id and private.can_access_department(m.department_id))));
create policy mvr_machine_action_map_admin_insert on public.machine_action_map for insert to authenticated with check(private.is_admin());
create policy mvr_machine_action_map_admin_delete on public.machine_action_map for delete to authenticated using(private.is_admin());

create or replace function public.mvr_admin_set_item_machines(p_type text,p_item_id uuid,p_machine_ids uuid[] default '{}'::uuid[])
returns void language plpgsql security invoker set search_path='public,pg_temp'
as $$
declare v_dept text; v_machine uuid;
begin
  if not private.is_admin() then raise exception 'Admin permission required'; end if;
  if p_type='problem' then
    select coalesce(department_code,'MVR') into v_dept from public.problems where id=p_item_id;
    delete from public.machine_problem_map where problem_id=p_item_id;
    foreach v_machine in array coalesce(p_machine_ids,'{}'::uuid[]) loop
      if not exists(select 1 from public.machines m join public.departments d on d.id=m.department_id where m.id=v_machine and d.dept_code=v_dept) then raise exception 'Machine is not available for department %',v_dept; end if;
      insert into public.machine_problem_map(machine_id,problem_id) values(v_machine,p_item_id) on conflict do nothing;
    end loop;
  elsif p_type='cause' then
    select coalesce(department_code,'MVR') into v_dept from public.causes where id=p_item_id;
    delete from public.machine_cause_map where cause_id=p_item_id;
    foreach v_machine in array coalesce(p_machine_ids,'{}'::uuid[]) loop
      if not exists(select 1 from public.machines m join public.departments d on d.id=m.department_id where m.id=v_machine and d.dept_code=v_dept) then raise exception 'Machine is not available for department %',v_dept; end if;
      insert into public.machine_cause_map(machine_id,cause_id) values(v_machine,p_item_id) on conflict do nothing;
    end loop;
  elsif p_type='action' then
    select coalesce(department_code,'MVR') into v_dept from public.actions where id=p_item_id;
    delete from public.machine_action_map where action_id=p_item_id;
    foreach v_machine in array coalesce(p_machine_ids,'{}'::uuid[]) loop
      if not exists(select 1 from public.machines m join public.departments d on d.id=m.department_id where m.id=v_machine and d.dept_code=v_dept) then raise exception 'Machine is not available for department %',v_dept; end if;
      insert into public.machine_action_map(machine_id,action_id) values(v_machine,p_item_id) on conflict do nothing;
    end loop;
  else
    raise exception 'Unsupported master type';
  end if;
end $$;
revoke all on function public.mvr_admin_set_item_machines(text,uuid,uuid[]) from public,anon;
grant execute on function public.mvr_admin_set_item_machines(text,uuid,uuid[]) to authenticated;

create or replace function public.mvr_admin_create_master_item(p_type text,p_payload jsonb,p_machine_ids uuid[] default '{}'::uuid[])
returns jsonb language plpgsql security invoker set search_path='public,pg_temp'
as $$
declare v_id uuid; v_row jsonb;
begin
  if not private.is_admin() then raise exception 'Admin permission required'; end if;
  if p_type='problem' then
    insert into public.problems(problem_code,problem_name,breakdown_type,department_code,is_active)
    values(nullif(trim(p_payload->>'problem_code'),''),trim(p_payload->>'problem_name'),nullif(trim(p_payload->>'breakdown_type'),''),nullif(trim(p_payload->>'department_code'),''),true)
    returning id,to_jsonb(problems.*) into v_id,v_row;
  elsif p_type='cause' then
    insert into public.causes(cause_code,cause_name,category,department_code,is_active)
    values(nullif(trim(p_payload->>'cause_code'),''),trim(p_payload->>'cause_name'),nullif(trim(p_payload->>'category'),''),nullif(trim(p_payload->>'department_code'),''),true)
    returning id,to_jsonb(causes.*) into v_id,v_row;
  elsif p_type='action' then
    insert into public.actions(action_code,action_name,department_code,is_active)
    values(nullif(trim(p_payload->>'action_code'),''),trim(p_payload->>'action_name'),nullif(trim(p_payload->>'department_code'),''),true)
    returning id,to_jsonb(actions.*) into v_id,v_row;
  else raise exception 'Unsupported master type'; end if;
  perform public.mvr_admin_set_item_machines(p_type,v_id,coalesce(p_machine_ids,'{}'::uuid[]));
  return v_row;
end $$;
revoke all on function public.mvr_admin_create_master_item(text,jsonb,uuid[]) from public,anon;
grant execute on function public.mvr_admin_create_master_item(text,jsonb,uuid[]) to authenticated;

-- private.prepare_repair_report() was also updated in the live migration so Problem/Cause/Action
-- are accepted only when a matching machine_*_map row exists for the selected machine.

create or replace function private.prepare_repair_report()
returns trigger language plpgsql security definer set search_path=''
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
    select * into v_profile from public.app_profiles where id=private.current_profile_id() and is_active=true and role='technician';
    if v_profile.id is null then raise exception 'Active technician profile not found'; end if;
    new.technician_id:=v_profile.id; new.department_id:=v_profile.department_id;
    if tg_op='UPDATE' then new.deleted_at:=old.deleted_at;new.deleted_by:=old.deleted_by;new.delete_reason:=old.delete_reason;end if;
  else
    select * into v_profile from public.app_profiles where id=new.technician_id;
    if v_admin then new.department_id:=v_machine.department_id; end if;
  end if;
  if v_profile.id is null then raise exception 'Technician profile not found'; end if;
  if v_machine.department_id is distinct from new.department_id then raise exception 'Machine is outside the report department'; end if;
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
    if v_group.id is null or v_group.department_id is distinct from new.department_id then raise exception 'Machine group is invalid'; end if;
  end if;

  if new.area_point_id is not null then
    select * into v_point from public.area_points where id=new.area_point_id and is_active is distinct from false;
    if v_point.id is null or v_point.machine_id is distinct from new.machine_id then raise exception 'Area point does not belong to selected machine'; end if;
    new.area_point_snapshot:=v_point.point_name;
  elsif tg_op='INSERT' and not v_dept.free_text_machine_problem then
    raise exception 'Area point must be selected from Master Data';
  end if;

  if new.problem_id is not null then
    select * into v_problem from public.problems where id=new.problem_id and is_active is distinct from false;
    if v_problem.id is null then raise exception 'Problem not found or inactive'; end if;
    if not (v_problem.department_code=v_dept.dept_code or (v_dept.dept_code='MVR' and v_problem.department_code is null)) then raise exception 'Problem is outside selected department'; end if;
    if not exists(select 1 from public.machine_problem_map x where x.machine_id=new.machine_id and x.problem_id=new.problem_id) then raise exception 'Problem is not configured for selected machine'; end if;
    new.symptom:=v_problem.problem_name; new.problem_type:=v_problem.breakdown_type;
  elsif tg_op='INSERT' and not v_dept.free_text_machine_problem then
    raise exception 'Problem must be selected from Master Data';
  elsif coalesce(btrim(new.symptom),'')='' then raise exception 'Problem description is required'; end if;

  if new.cause_id is not null then
    select * into v_cause from public.causes where id=new.cause_id and is_active is distinct from false;
    if v_cause.id is null then raise exception 'Cause not found or inactive'; end if;
    if not (v_cause.department_code=v_dept.dept_code or (v_dept.dept_code='MVR' and v_cause.department_code is null)) then raise exception 'Cause is outside selected department'; end if;
    if not exists(select 1 from public.machine_cause_map x where x.machine_id=new.machine_id and x.cause_id=new.cause_id) then raise exception 'Cause is not configured for selected machine'; end if;
    new.cause:=v_cause.cause_name;
  elsif tg_op='INSERT' and not v_dept.free_text_cause_action then raise exception 'Cause must be selected from Master Data';
  elsif coalesce(btrim(new.cause),'')='' then raise exception 'Cause is required'; end if;

  if new.action_id is not null then
    select * into v_action from public.actions where id=new.action_id and is_active is distinct from false;
    if v_action.id is null then raise exception 'Action not found or inactive'; end if;
    if not (v_action.department_code=v_dept.dept_code or (v_dept.dept_code='MVR' and v_action.department_code is null)) then raise exception 'Action is outside selected department'; end if;
    if not exists(select 1 from public.machine_action_map x where x.machine_id=new.machine_id and x.action_id=new.action_id) then raise exception 'Action is not configured for selected machine'; end if;
    new.action_taken:=v_action.action_name;
  elsif tg_op='INSERT' and not v_dept.free_text_cause_action then raise exception 'Action must be selected from Master Data';
  elsif coalesce(btrim(new.action_taken),'')='' then raise exception 'Action is required'; end if;

  if new.finished_at is not null then
    if new.finished_at<new.started_at then raise exception 'Repair finish time cannot be before start time'; end if;
    new.loss_time_min:=greatest(0,round(extract(epoch from(new.finished_at-new.started_at))/60.0)::int);
  else new.loss_time_min:=0; end if;
  if new.finished_at is null then raise exception 'Repair report requires finish time'; end if;
  return new;
end $$;
revoke all on function private.prepare_repair_report() from public,anon,authenticated;
