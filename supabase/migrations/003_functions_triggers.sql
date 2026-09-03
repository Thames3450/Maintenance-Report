-- REFERENCE ONLY FOR A NEW / EMPTY SUPABASE PROJECT.
-- DO NOT RUN THIS FILE ON THE CONNECTED MPR Maintenance PROJECT (hftlogubohbjiivcvkut).
-- The live project has already received compatibility migrations. See ../README-LIVE-TH.md.

-- MVR Smart Maintenance
-- 003_functions_triggers.sql

create or replace function private.touch_updated_at()
returns trigger language plpgsql security definer set search_path=''
as $$ begin new.updated_at=now(); return new; end $$;
revoke all on function private.touch_updated_at() from public,anon,authenticated;

do $$ declare t text; begin
  foreach t in array array['departments','machines','app_profiles','repair_reports','pm_plans','pm_checklist_items','pm_schedule','pm_readings','pm_weekly_tasks'] loop
    execute format('drop trigger if exists %I on public.%I','trg_touch_'||t,t);
    execute format('create trigger %I before update on public.%I for each row execute function private.touch_updated_at()','trg_touch_'||t,t);
  end loop;
end $$;

-- Automatically link Auth accounts created with the internal domain.
create or replace function private.link_auth_user_to_profile()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_local text; v_domain text; v_profile_id uuid;
begin
  if new.email is null then return new; end if;
  v_local:=lower(split_part(new.email,'@',1));
  v_domain:=lower(split_part(new.email,'@',2));
  if v_domain <> 'mvr-smart.local' then return new; end if;

  if v_local like 'user%' then
    select p.id into v_profile_id from public.app_profiles p
    where p.role='technician' and p.employee_code=substr(v_local,5) and p.is_active=true limit 1;
  else
    select p.id into v_profile_id from public.app_profiles p
    where p.role='admin' and lower(p.username)=v_local and p.is_active=true limit 1;
  end if;

  if v_profile_id is not null then
    update public.app_profiles
    set auth_user_id=new.id, updated_at=now()
    where id=v_profile_id and (auth_user_id is null or auth_user_id=new.id);
  end if;
  return new;
end $$;
revoke all on function private.link_auth_user_to_profile() from public,anon,authenticated;
drop trigger if exists on_auth_user_created_mvr on auth.users;
create trigger on_auth_user_created_mvr after insert on auth.users for each row execute function private.link_auth_user_to_profile();

-- Repair canonicalization and automatic Loss Time.
create or replace function private.prepare_repair_report()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_profile public.app_profiles%rowtype; v_machine public.machines%rowtype;
begin
  select * into v_machine from public.machines where id=new.machine_id and is_active=true;
  if v_machine.id is null then raise exception 'Machine not found or inactive'; end if;

  if auth.uid() is not null and not private.is_admin() then
    select * into v_profile from public.app_profiles where id=private.current_profile_id() and is_active=true;
    if v_profile.id is null then raise exception 'Active technician profile not found'; end if;
    new.technician_id:=v_profile.id;
    new.department_id:=v_profile.department_id;
  else
    select * into v_profile from public.app_profiles where id=new.technician_id;
  end if;

  if v_profile.id is null then raise exception 'Technician profile not found'; end if;
  if v_profile.department_id is distinct from new.department_id then raise exception 'Technician is outside the report department'; end if;
  if v_machine.department_id is distinct from new.department_id then raise exception 'Machine is outside the selected department'; end if;

  new.technician_name_snapshot:=v_profile.full_name;
  new.technician_photo_path_snapshot:=v_profile.photo_path;
  new.machine_no_snapshot:=v_machine.machine_no;
  new.machine_name_snapshot:=v_machine.machine_name;
  new.production_line_snapshot:=v_machine.production_line;

  if new.finished_at is not null then
    if new.finished_at < new.started_at then raise exception 'Repair finish time cannot be before start time'; end if;
    new.loss_time_min:=greatest(0,round(extract(epoch from (new.finished_at-new.started_at))/60.0)::int);
  else
    new.loss_time_min:=0;
  end if;
  if new.finished_at is null then raise exception 'Repair report requires finish time'; end if;
  return new;
end $$;
revoke all on function private.prepare_repair_report() from public,anon,authenticated;
drop trigger if exists trg_prepare_repair_report on public.repair_reports;
create trigger trg_prepare_repair_report before insert or update on public.repair_reports for each row execute function private.prepare_repair_report();

-- Technician may execute a PM schedule but cannot alter planning fields.
create or replace function private.guard_pm_schedule_update()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_me uuid; v_name text; v_complete boolean; v_sync boolean;
begin
  if private.is_admin() then return new; end if;
  v_me:=private.current_profile_id();
  if v_me is null then raise exception 'Active technician profile not found'; end if;
  select full_name into v_name from public.app_profiles where id=v_me;
  v_complete:=coalesce(current_setting('app.pm_complete',true),'')='1';
  v_sync:=coalesce(current_setting('app.pm_result_sync',true),'')='1';

  if old.status='completed' and not v_sync then
    raise exception 'Completed PM schedule is read-only' using errcode='42501';
  end if;

  if new.plan_id is distinct from old.plan_id
     or new.department_id is distinct from old.department_id
     or new.machine_id is distinct from old.machine_id
     or new.plan_title_snapshot is distinct from old.plan_title_snapshot
     or new.frequency_snapshot is distinct from old.frequency_snapshot
     or new.machine_no_snapshot is distinct from old.machine_no_snapshot
     or new.machine_name_snapshot is distinct from old.machine_name_snapshot
     or new.std_minutes_snapshot is distinct from old.std_minutes_snapshot
     or new.due_date is distinct from old.due_date then
    raise exception 'Technician cannot modify PM planning fields' using errcode='42501';
  end if;

  if not v_sync and new.overall_result is distinct from old.overall_result then
    new.overall_result:=old.overall_result;
  end if;
  if not v_complete and new.completed_at is distinct from old.completed_at then
    new.completed_at:=old.completed_at;
  end if;
  if new.status='completed' and old.status is distinct from 'completed' and not v_complete then
    raise exception 'Complete PM through complete_pm_schedule()' using errcode='42501';
  end if;

  if not v_complete and new.status is distinct from old.status then
    if not (old.status='planned' and new.status='in_progress') then
      raise exception 'Technician may only start a planned PM; completion must use complete_pm_schedule()' using errcode='42501';
    end if;
  end if;

  if old.status='planned' and new.status='in_progress' then
    if old.assigned_to is not null and old.assigned_to is distinct from v_me then
      raise exception 'This PM is assigned to another technician' using errcode='42501';
    end if;
    new.assigned_to:=v_me;
    new.assignee_name_snapshot:=v_name;
    new.started_at:=coalesce(old.started_at,now());
  elsif new.assigned_to is distinct from old.assigned_to then
    raise exception 'Technician cannot modify PM assignment' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_pm_schedule_update() from public,anon,authenticated;
drop trigger if exists trg_guard_pm_schedule_update on public.pm_schedule;
create trigger trg_guard_pm_schedule_update before update on public.pm_schedule for each row execute function private.guard_pm_schedule_update();

-- Reading canonicalization. Out-of-range measurement becomes abnormal automatically.
create or replace function private.prepare_pm_reading()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_item public.pm_checklist_items%rowtype; v_schedule public.pm_schedule%rowtype; v_me uuid; v_out boolean:=false;
begin
  select * into v_item from public.pm_checklist_items where id=new.item_id and is_active=true;
  if v_item.id is null then raise exception 'Checklist item not found or inactive'; end if;
  select * into v_schedule from public.pm_schedule where id=new.schedule_id;
  if v_schedule.id is null then raise exception 'PM schedule not found'; end if;
  if v_schedule.status='completed' and auth.uid() is not null and not private.is_admin() then raise exception 'Completed PM readings are read-only' using errcode='42501'; end if;
  if v_item.plan_id is distinct from v_schedule.plan_id then raise exception 'Checklist item does not belong to this PM plan'; end if;

  if auth.uid() is not null and not private.is_admin() then
    v_me:=private.current_profile_id();
    if v_me is null then raise exception 'Active technician profile not found'; end if;
    if v_schedule.status <> 'in_progress' then
      raise exception 'Start the PM before recording checklist results' using errcode='42501';
    end if;
    if v_schedule.assigned_to is distinct from v_me then
      raise exception 'This PM is assigned to another technician' using errcode='42501';
    end if;
    new.inspector_id:=v_me;
  end if;

  new.item_order_snapshot:=v_item.item_order;
  new.item_name_snapshot:=v_item.item_name;
  new.item_type_snapshot:=v_item.item_type;
  new.min_value_snapshot:=v_item.min_value;
  new.max_value_snapshot:=v_item.max_value;
  new.unit_snapshot:=v_item.unit;
  new.inspected_at:=now();

  if v_item.item_type='measurement' and new.result<>'na' then
    if new.measured_value is null then raise exception 'Measurement value is required'; end if;
    v_out:=(v_item.min_value is not null and new.measured_value<v_item.min_value)
       or (v_item.max_value is not null and new.measured_value>v_item.max_value);
    if v_out then new.result:='abnormal'; end if;
  elsif v_item.item_type<>'measurement' then
    new.measured_value:=null;
  end if;

  if new.result='na' then new.measured_value:=null; end if;
  if new.result='abnormal' and nullif(trim(new.abnormal_detail),'') is null then
    raise exception 'Abnormal checklist result requires abnormal detail';
  end if;
  if new.result<>'abnormal' then new.abnormal_detail:=null; end if;
  return new;
end $$;
revoke all on function private.prepare_pm_reading() from public,anon,authenticated;
drop trigger if exists trg_prepare_pm_reading on public.pm_readings;
create trigger trg_prepare_pm_reading before insert or update on public.pm_readings for each row execute function private.prepare_pm_reading();

create or replace function private.recalculate_pm_result()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_schedule uuid; v_total int; v_bad int;
begin
  if tg_op='DELETE' then v_schedule:=old.schedule_id; else v_schedule:=new.schedule_id; end if;
  select count(*),count(*) filter(where result='abnormal') into v_total,v_bad
  from public.pm_readings where schedule_id=v_schedule;
  perform set_config('app.pm_result_sync','1',true);
  update public.pm_schedule set overall_result=case when v_total=0 then null when v_bad>0 then 'issue' else 'normal' end where id=v_schedule;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.recalculate_pm_result() from public,anon,authenticated;
drop trigger if exists trg_recalculate_pm_result on public.pm_readings;
create trigger trg_recalculate_pm_result after insert or update or delete on public.pm_readings for each row execute function private.recalculate_pm_result();

-- A technician must complete every active checklist item before closing the PM.
create or replace function public.complete_pm_schedule(p_schedule_id uuid,p_execution_note text default null)
returns jsonb language plpgsql security invoker set search_path='public,pg_temp'
as $$
declare v_schedule public.pm_schedule%rowtype; v_expected int; v_actual int; v_me uuid; v_name text;
begin
  select * into v_schedule from public.pm_schedule where id=p_schedule_id;
  if v_schedule.id is null then raise exception 'PM schedule not found or permission denied'; end if;
  v_me:=private.current_profile_id();
  if not private.is_admin() then
    if v_me is null then raise exception 'Active technician profile not found'; end if;
    if v_schedule.status <> 'in_progress' then raise exception 'PM must be started before completion'; end if;
    if v_schedule.assigned_to is distinct from v_me then raise exception 'This PM is assigned to another technician'; end if;
  end if;
  select count(*) into v_expected from public.pm_checklist_items where plan_id=v_schedule.plan_id and is_active=true;
  if v_expected=0 then raise exception 'PM plan has no active checklist items'; end if;
  select count(*) into v_actual from public.pm_readings r join public.pm_checklist_items i on i.id=r.item_id
  where r.schedule_id=p_schedule_id and i.plan_id=v_schedule.plan_id and i.is_active=true;
  if v_actual<v_expected then raise exception 'Checklist is incomplete (%/% items)',v_actual,v_expected; end if;
  select full_name into v_name from public.app_profiles where id=v_me;
  perform set_config('app.pm_complete','1',true);
  update public.pm_schedule
    set status='completed',completed_at=now(),execution_note=nullif(trim(p_execution_note),''),
        assigned_to=coalesce(assigned_to,v_me),assignee_name_snapshot=coalesce(assignee_name_snapshot,v_name),
        started_at=coalesce(started_at,now())
    where id=p_schedule_id returning * into v_schedule;
  return to_jsonb(v_schedule);
end $$;
revoke all on function public.complete_pm_schedule(uuid,text) from public,anon;
grant execute on function public.complete_pm_schedule(uuid,text) to authenticated;

-- Admin-only schedule generator.
create or replace function public.generate_pm_schedule(p_plan_id uuid,p_until date)
returns integer language plpgsql security definer set search_path=''
as $$
declare v_plan public.pm_plans%rowtype; v_machine public.machines%rowtype; v_due date; v_count int:=0;
begin
  if not private.is_admin() then raise exception 'Admin permission required' using errcode='42501'; end if;
  select * into v_plan from public.pm_plans where id=p_plan_id and is_active=true;
  if v_plan.id is null then raise exception 'Active PM plan not found'; end if;
  if p_until<v_plan.start_date or p_until>v_plan.start_date+interval '3 years' then raise exception 'Generate-until date is outside allowed range'; end if;
  select * into v_machine from public.machines where id=v_plan.machine_id and is_active=true;
  if v_machine.id is null then raise exception 'Machine not found or inactive'; end if;
  v_due:=v_plan.start_date;
  while v_due<=p_until loop
    insert into public.pm_schedule(plan_id,department_id,machine_id,plan_title_snapshot,frequency_snapshot,machine_no_snapshot,machine_name_snapshot,std_minutes_snapshot,due_date,status,assigned_to,assignee_name_snapshot)
    values(v_plan.id,v_plan.department_id,v_plan.machine_id,v_plan.title,v_plan.frequency,v_machine.machine_no,v_machine.machine_name,v_plan.std_minutes,v_due,'planned',v_plan.responsible_profile_id,v_plan.responsible_name_snapshot)
    on conflict(plan_id,due_date) do nothing;
    if found then v_count:=v_count+1; end if;
    v_due:=case v_plan.frequency
      when 'daily' then v_due+1
      when 'weekly' then v_due+7
      when 'monthly' then (v_due+interval '1 month')::date
      when 'quarterly' then (v_due+interval '3 months')::date
      when 'semiannual' then (v_due+interval '6 months')::date
      when 'annual' then (v_due+interval '1 year')::date
    end;
  end loop;
  return v_count;
end $$;
revoke all on function public.generate_pm_schedule(uuid,date) from public,anon;
grant execute on function public.generate_pm_schedule(uuid,date) to authenticated;

-- Weekly TPM guard: technician may change only status and note.
create or replace function private.guard_weekly_task_update()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_me uuid;
begin
  if private.is_admin() then return new; end if;
  if new.week_start is distinct from old.week_start or new.day_of_week is distinct from old.day_of_week
     or new.department_id is distinct from old.department_id or new.machine_id is distinct from old.machine_id
     or new.machine_no_snapshot is distinct from old.machine_no_snapshot or new.machine_name_snapshot is distinct from old.machine_name_snapshot
     or new.title is distinct from old.title or new.details is distinct from old.details
     or new.assigned_to is distinct from old.assigned_to or new.assignee_name_snapshot is distinct from old.assignee_name_snapshot
     or new.sort_order is distinct from old.sort_order or new.created_by is distinct from old.created_by then
    raise exception 'Technician may update only TPM execution status and note' using errcode='42501';
  end if;
  v_me:=private.current_profile_id();
  new.status_by:=v_me; new.status_at:=now();
  return new;
end $$;
revoke all on function private.guard_weekly_task_update() from public,anon,authenticated;
drop trigger if exists trg_guard_weekly_task_update on public.pm_weekly_tasks;
create trigger trg_guard_weekly_task_update before update on public.pm_weekly_tasks for each row execute function private.guard_weekly_task_update();

-- KPI summary uses scheduled time = days in month x 24h x machine count in scope.
create or replace function public.kpi_summary(p_department_id uuid default null,p_machine_id uuid default null,p_month date default current_date)
returns table(downtime_min numeric,breakdown_count bigint,mttr_min numeric,mtbf_hour numeric,availability_pct numeric)
language sql stable security invoker set search_path='public,pg_temp'
as $$
with bounds as (
  select date_trunc('month',p_month)::date s,(date_trunc('month',p_month)+interval '1 month')::date e
), scope_machines as (
  select count(*)::numeric cnt from public.machines m
  where m.is_active=true and (p_department_id is null or m.department_id=p_department_id) and (p_machine_id is null or m.id=p_machine_id)
), x as (
  select coalesce(sum(r.loss_time_min),0)::numeric down,count(*)::bigint n
  from public.repair_reports r,bounds b
  where (r.started_at at time zone 'Asia/Bangkok')>=b.s::timestamp and (r.started_at at time zone 'Asia/Bangkok')<b.e::timestamp and (p_department_id is null or r.department_id=p_department_id) and (p_machine_id is null or r.machine_id=p_machine_id)
), sched as (
  select greatest(1,(b.e-b.s)::numeric)*1440*greatest(1,sm.cnt) mins from bounds b,scope_machines sm
)
select x.down,x.n,
  case when x.n=0 then 0 else round(x.down/x.n,2) end,
  case when x.n=0 then 0 else round(greatest(0,s.mins-x.down)/x.n/60,2) end,
  round(greatest(0,least(100,(s.mins-x.down)/nullif(s.mins,0)*100)),2)
from x,sched s
$$;
revoke all on function public.kpi_summary(uuid,uuid,date) from public,anon;
grant execute on function public.kpi_summary(uuid,uuid,date) to authenticated;

create or replace function public.kpi_problem_pareto(p_department_id uuid default null,p_machine_id uuid default null,p_month date default current_date)
returns table(problem_name text,times_occurred bigint,downtime_min numeric)
language sql stable security invoker set search_path='public,pg_temp'
as $$
with b as (select date_trunc('month',p_month)::timestamptz s,(date_trunc('month',p_month)+interval '1 month')::timestamptz e)
select coalesce(nullif(trim(r.problem_type),''),left(r.symptom,80)) problem_name,count(*) times_occurred,coalesce(sum(r.loss_time_min),0)::numeric downtime_min
from public.repair_reports r,b
where (r.started_at at time zone 'Asia/Bangkok')>=b.s::timestamp and (r.started_at at time zone 'Asia/Bangkok')<b.e::timestamp and (p_department_id is null or r.department_id=p_department_id) and (p_machine_id is null or r.machine_id=p_machine_id)
group by 1 order by 2 desc,3 desc limit 10
$$;
revoke all on function public.kpi_problem_pareto(uuid,uuid,date) from public,anon;
grant execute on function public.kpi_problem_pareto(uuid,uuid,date) to authenticated;

create or replace function public.kpi_top_causes(p_department_id uuid default null,p_machine_id uuid default null,p_month date default current_date)
returns table(cause_name text,times_occurred bigint,downtime_min numeric)
language sql stable security invoker set search_path='public,pg_temp'
as $$
with b as (select date_trunc('month',p_month)::timestamptz s,(date_trunc('month',p_month)+interval '1 month')::timestamptz e)
select left(r.cause,100),count(*),coalesce(sum(r.loss_time_min),0)::numeric
from public.repair_reports r,b
where (r.started_at at time zone 'Asia/Bangkok')>=b.s::timestamp and (r.started_at at time zone 'Asia/Bangkok')<b.e::timestamp and (p_department_id is null or r.department_id=p_department_id) and (p_machine_id is null or r.machine_id=p_machine_id)
group by 1 order by 3 desc,2 desc limit 10
$$;
revoke all on function public.kpi_top_causes(uuid,uuid,date) from public,anon;
grant execute on function public.kpi_top_causes(uuid,uuid,date) to authenticated;

create or replace function public.kpi_top_machines(p_department_id uuid default null,p_month date default current_date)
returns table(machine_no text,machine_name text,times_occurred bigint,downtime_min numeric)
language sql stable security invoker set search_path='public,pg_temp'
as $$
with b as (select date_trunc('month',p_month)::timestamptz s,(date_trunc('month',p_month)+interval '1 month')::timestamptz e)
select r.machine_no_snapshot,r.machine_name_snapshot,count(*),coalesce(sum(r.loss_time_min),0)::numeric
from public.repair_reports r,b
where (r.started_at at time zone 'Asia/Bangkok')>=b.s::timestamp and (r.started_at at time zone 'Asia/Bangkok')<b.e::timestamp and (p_department_id is null or r.department_id=p_department_id)
group by 1,2 order by 4 desc,3 desc limit 10
$$;
revoke all on function public.kpi_top_machines(uuid,date) from public,anon;
grant execute on function public.kpi_top_machines(uuid,date) to authenticated;
