-- v2.34.0 MPR Supervisor: read-only global history access
alter table public.app_profiles drop constraint if exists app_profiles_role_check;
alter table public.app_profiles add constraint app_profiles_role_check check (role = any (array['admin'::text,'technician'::text,'supervisor'::text]));
alter table public.app_profiles drop constraint if exists app_profiles_supervisor_department_required;
alter table public.app_profiles add constraint app_profiles_supervisor_department_required check ((role <> 'supervisor'::text) or (department_id is not null));
alter table public.technicians drop constraint if exists technicians_role_check;
alter table public.technicians add constraint technicians_role_check check (role = any (array['technician'::text,'admin'::text,'supervisor'::text]));

create or replace function private.is_supervisor() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.app_profiles p where p.auth_user_id=(select auth.uid()) and p.is_active=true and p.role='supervisor')
$$;
create or replace function private.is_technician() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.app_profiles p where p.auth_user_id=(select auth.uid()) and p.is_active=true and p.role='technician')
$$;
create or replace function private.can_read_department(p_department_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.is_admin() or private.is_supervisor() or p_department_id=private.current_department_id()
$$;

-- The live project also updates SELECT policies for profiles/departments/machines/repair/spare
-- to use can_read_department(), while all repair/spare/PM write policies explicitly require
-- private.is_admin() or private.is_technician(). This keeps Supervisor read-only.
