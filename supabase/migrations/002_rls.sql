-- REFERENCE ONLY FOR A NEW / EMPTY SUPABASE PROJECT.
-- DO NOT RUN THIS FILE ON THE CONNECTED MPR Maintenance PROJECT (hftlogubohbjiivcvkut).
-- The live project has already received compatibility migrations. See ../README-LIVE-TH.md.

-- MVR Smart Maintenance
-- 002_rls.sql
-- RLS is the authorization boundary. UI hiding is not treated as security.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.current_profile_id()
returns uuid language sql stable security definer set search_path=''
as $$
  select p.id from public.app_profiles p
  where p.auth_user_id=(select auth.uid()) and p.is_active=true limit 1
$$;

create or replace function private.current_department_id()
returns uuid language sql stable security definer set search_path=''
as $$
  select p.department_id from public.app_profiles p
  where p.auth_user_id=(select auth.uid()) and p.is_active=true limit 1
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(select 1 from public.app_profiles p
    where p.auth_user_id=(select auth.uid()) and p.is_active=true and p.role='admin')
$$;

create or replace function private.is_active_user()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(select 1 from public.app_profiles p
    where p.auth_user_id=(select auth.uid()) and p.is_active=true)
$$;

create or replace function private.can_access_department(p_department_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select private.is_admin() or p_department_id=private.current_department_id()
$$;

create or replace function private.can_access_plan(p_plan_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(select 1 from public.pm_plans p
    where p.id=p_plan_id and private.can_access_department(p.department_id))
$$;

create or replace function private.can_access_schedule(p_schedule_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(select 1 from public.pm_schedule s
    where s.id=p_schedule_id and private.can_access_department(s.department_id))
$$;

revoke all on function private.current_profile_id() from public,anon;
revoke all on function private.current_department_id() from public,anon;
revoke all on function private.is_admin() from public,anon;
revoke all on function private.is_active_user() from public,anon;
revoke all on function private.can_access_department(uuid) from public,anon;
revoke all on function private.can_access_plan(uuid) from public,anon;
revoke all on function private.can_access_schedule(uuid) from public,anon;
grant execute on function private.current_profile_id() to authenticated;
grant execute on function private.current_department_id() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.can_access_department(uuid) to authenticated;
grant execute on function private.can_access_plan(uuid) to authenticated;
grant execute on function private.can_access_schedule(uuid) to authenticated;

-- Lock anonymous Data API access completely.
do $$ declare t text; begin
  foreach t in array array['departments','machines','app_profiles','repair_reports','repair_images','pm_plans','pm_schedule','pm_checklist_items','pm_readings','pm_weekly_tasks','employee_code_login_rate_limits'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon',t);
  end loop;
end $$;

-- Departments
grant select,insert,update,delete on public.departments to authenticated;
create policy departments_read on public.departments for select to authenticated
  using (private.is_active_user() and (private.is_admin() or id=private.current_department_id()));
create policy departments_admin_insert on public.departments for insert to authenticated with check (private.is_admin());
create policy departments_admin_update on public.departments for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy departments_admin_delete on public.departments for delete to authenticated using (private.is_admin());

-- Machines
grant select,insert,update,delete on public.machines to authenticated;
create policy machines_read on public.machines for select to authenticated
  using (private.is_active_user() and private.can_access_department(department_id));
create policy machines_admin_insert on public.machines for insert to authenticated with check (private.is_admin());
create policy machines_admin_update on public.machines for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy machines_admin_delete on public.machines for delete to authenticated using (private.is_admin());

-- Profiles: technician can read self only. Employee codes are access credentials and are not exposed as a directory.
grant select,insert,update,delete on public.app_profiles to authenticated;
create policy profiles_read on public.app_profiles for select to authenticated
  using (private.is_admin() or auth_user_id=(select auth.uid()));
create policy profiles_admin_insert on public.app_profiles for insert to authenticated with check (private.is_admin());
create policy profiles_admin_update on public.app_profiles for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy profiles_admin_delete on public.app_profiles for delete to authenticated using (private.is_admin());

-- Repair reports
grant select,insert,update on public.repair_reports to authenticated;
grant delete on public.repair_reports to authenticated;
create policy repairs_read on public.repair_reports for select to authenticated
  using (private.is_active_user() and private.can_access_department(department_id));
create policy repairs_insert on public.repair_reports for insert to authenticated
  with check (private.is_admin() or (department_id=private.current_department_id() and technician_id=private.current_profile_id()));
create policy repairs_update on public.repair_reports for update to authenticated
  using (private.is_admin() or (department_id=private.current_department_id() and technician_id=private.current_profile_id()))
  with check (private.is_admin() or (department_id=private.current_department_id() and technician_id=private.current_profile_id()));
create policy repairs_admin_delete on public.repair_reports for delete to authenticated using (private.is_admin());

-- Repair images
grant select,insert,delete on public.repair_images to authenticated;
create policy repair_images_read on public.repair_images for select to authenticated using (
  exists(select 1 from public.repair_reports r where r.id=repair_report_id and private.can_access_department(r.department_id))
);
create policy repair_images_insert on public.repair_images for insert to authenticated with check (
  private.is_admin() or (uploaded_by=private.current_profile_id() and exists(
    select 1 from public.repair_reports r where r.id=repair_report_id and r.technician_id=private.current_profile_id() and r.department_id=private.current_department_id()))
);
create policy repair_images_delete on public.repair_images for delete to authenticated using (private.is_admin() or uploaded_by=private.current_profile_id());

-- PM plans
grant select,insert,update,delete on public.pm_plans to authenticated;
create policy pm_plans_read on public.pm_plans for select to authenticated using (private.is_active_user() and private.can_access_department(department_id));
create policy pm_plans_admin_insert on public.pm_plans for insert to authenticated with check (private.is_admin());
create policy pm_plans_admin_update on public.pm_plans for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy pm_plans_admin_delete on public.pm_plans for delete to authenticated using (private.is_admin());

-- PM checklist definition
grant select,insert,update,delete on public.pm_checklist_items to authenticated;
create policy pm_items_read on public.pm_checklist_items for select to authenticated using (private.is_active_user() and private.can_access_plan(plan_id));
create policy pm_items_admin_insert on public.pm_checklist_items for insert to authenticated with check (private.is_admin());
create policy pm_items_admin_update on public.pm_checklist_items for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy pm_items_admin_delete on public.pm_checklist_items for delete to authenticated using (private.is_admin());

-- Generated PM work schedule. Technician UPDATE is execution-only; a trigger enforces immutable planning fields.
grant select,insert,update,delete on public.pm_schedule to authenticated;
create policy pm_schedule_read on public.pm_schedule for select to authenticated using (private.is_active_user() and private.can_access_department(department_id));
create policy pm_schedule_admin_insert on public.pm_schedule for insert to authenticated with check (private.is_admin());
create policy pm_schedule_update on public.pm_schedule for update to authenticated
  using (private.is_admin() or (private.is_active_user() and department_id=private.current_department_id()))
  with check (private.is_admin() or department_id=private.current_department_id());
create policy pm_schedule_admin_delete on public.pm_schedule for delete to authenticated using (private.is_admin());

-- PM execution readings
grant select,insert,update,delete on public.pm_readings to authenticated;
create policy pm_readings_read on public.pm_readings for select to authenticated using (private.is_active_user() and private.can_access_schedule(schedule_id));
create policy pm_readings_insert on public.pm_readings for insert to authenticated with check (
  private.is_admin() or (private.can_access_schedule(schedule_id) and inspector_id=private.current_profile_id())
);
create policy pm_readings_update on public.pm_readings for update to authenticated
  using (private.is_admin() or (private.can_access_schedule(schedule_id) and inspector_id=private.current_profile_id()))
  with check (private.is_admin() or (private.can_access_schedule(schedule_id) and inspector_id=private.current_profile_id()));
create policy pm_readings_admin_delete on public.pm_readings for delete to authenticated using (private.is_admin());

-- Weekly TPM tasks. Technician UPDATE is status/note only; trigger enforces it.
grant select,insert,update,delete on public.pm_weekly_tasks to authenticated;
create policy weekly_read on public.pm_weekly_tasks for select to authenticated using (private.is_active_user() and private.can_access_department(department_id));
create policy weekly_admin_insert on public.pm_weekly_tasks for insert to authenticated with check (private.is_admin());
create policy weekly_update on public.pm_weekly_tasks for update to authenticated
  using (private.is_admin() or (private.is_active_user() and department_id=private.current_department_id()))
  with check (private.is_admin() or department_id=private.current_department_id());
create policy weekly_admin_delete on public.pm_weekly_tasks for delete to authenticated using (private.is_admin());

-- Login throttle is server-side only.
revoke all on public.employee_code_login_rate_limits from authenticated,anon;
grant select,insert,update,delete on public.employee_code_login_rate_limits to service_role;
create policy employee_login_rate_service on public.employee_code_login_rate_limits for all to service_role using (true) with check (true);
