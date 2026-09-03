-- MVR Smart Maintenance v2.7
-- Repair result choices + mandatory three repair images.

alter table public.repair_reports drop constraint if exists repair_reports_status_check;

update public.repair_reports
set status=case
  when status='completed' then 'operational'
  when status='waiting_parts' then 'no_parts'
  when status in ('waiting','in_progress') then 'follow_up'
  else status
end
where status in ('completed','waiting_parts','waiting','in_progress');

alter table public.repair_reports alter column status set default 'operational';
alter table public.repair_reports add constraint repair_reports_status_check
  check (status in ('operational','no_parts','follow_up'));

update public.departments
set require_image=true, required_image_types=array['Before','Evidence','After']::text[];

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


create or replace function public.mvr_create_repair_report(
  p_report jsonb,
  p_images jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path='public,pg_temp'
as $$
declare
  v_id uuid;
  v_img jsonb;
  v_prefix text;
  v_dept public.departments%rowtype;
  v_required text;
begin
  if private.current_profile_id() is null then
    raise exception 'Active profile not found';
  end if;

  v_id:=coalesce(nullif(p_report->>'id','')::uuid,gen_random_uuid());
  v_prefix:='repair/'||auth.uid()::text||'/'||v_id::text||'/';
  select * into v_dept from public.departments where id=private.current_department_id() and is_active=true;
  if v_dept.id is null then raise exception 'Department is inactive or not found'; end if;

  if jsonb_typeof(coalesce(p_images,'[]'::jsonb))<>'array' then
    raise exception 'Images must be an array';
  end if;
  if jsonb_array_length(coalesce(p_images,'[]'::jsonb))>5 then
    raise exception 'Maximum 5 images';
  end if;
  if jsonb_array_length(coalesce(p_images,'[]'::jsonb))<3 then
    raise exception 'Before, Evidence and After images are required';
  end if;
  if exists(
    select 1 from jsonb_array_elements(coalesce(p_images,'[]'::jsonb)) x
    where coalesce(x->>'image_type','') not in ('Before','Evidence','After')
  ) then raise exception 'Unsupported image type'; end if;

  foreach v_required in array array['Before','Evidence','After'] loop
    if not exists(
      select 1 from jsonb_array_elements(coalesce(p_images,'[]'::jsonb)) x
      where lower(x->>'image_type')=lower(v_required)
    ) then raise exception 'Required repair image is missing: %',v_required; end if;
  end loop;

  if coalesce(p_report->>'status','') not in ('operational','no_parts','follow_up') then
    raise exception 'Invalid repair result';
  end if;
  if nullif(p_report->>'finished_at','') is null then
    raise exception 'Repair finish time is required';
  end if;

  insert into public.repair_reports(
    id,department_id,machine_id,technician_id,machine_group_id,
    area_point_id,problem_id,cause_id,action_id,area_point_snapshot,
    symptom,problem_type,severity,cause,action_taken,spare_parts,
    status,started_at,finished_at,remark
  ) values(
    v_id,
    private.current_department_id(),
    (p_report->>'machine_id')::uuid,
    private.current_profile_id(),
    nullif(p_report->>'machine_group_id','')::uuid,
    nullif(p_report->>'area_point_id','')::uuid,
    nullif(p_report->>'problem_id','')::uuid,
    nullif(p_report->>'cause_id','')::uuid,
    nullif(p_report->>'action_id','')::uuid,
    nullif(p_report->>'area_point_snapshot',''),
    coalesce(p_report->>'symptom',''),
    nullif(p_report->>'problem_type',''),
    coalesce(p_report->>'severity','medium'),
    coalesce(p_report->>'cause',''),
    coalesce(p_report->>'action_taken',''),
    nullif(p_report->>'spare_parts',''),
    coalesce(p_report->>'status','operational'),
    (p_report->>'started_at')::timestamptz,
    nullif(p_report->>'finished_at','')::timestamptz,
    nullif(p_report->>'remark','')
  );

  for v_img in select * from jsonb_array_elements(coalesce(p_images,'[]'::jsonb)) loop
    if coalesce(v_img->>'file_path','') not like v_prefix||'%' then
      raise exception 'Invalid repair image path';
    end if;
    if not exists(
      select 1 from storage.objects o
      where o.bucket_id='maintenance-media' and o.name=v_img->>'file_path'
    ) then
      raise exception 'Uploaded image object not found';
    end if;

    insert into public.repair_images(
      repair_report_id,image_type,file_name,file_path,
      uploaded_by_profile_id,bucket_name,created_at
    ) values(
      v_id,
      nullif(v_img->>'image_type',''),
      nullif(v_img->>'file_name',''),
      v_img->>'file_path',
      private.current_profile_id(),
      'maintenance-media',
      now()
    );
  end loop;

  return v_id;
end $$;

revoke all on function public.mvr_create_repair_report(jsonb,jsonb) from public,anon;
grant execute on function public.mvr_create_repair_report(jsonb,jsonb) to authenticated;

