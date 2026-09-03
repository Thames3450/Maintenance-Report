-- MVR Smart Maintenance v2.7
-- Atomic technician repair-report creation with mandatory Before/Evidence/After images.
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

