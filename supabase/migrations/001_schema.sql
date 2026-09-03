-- REFERENCE ONLY FOR A NEW / EMPTY SUPABASE PROJECT.
-- DO NOT RUN THIS FILE ON THE CONNECTED MPR Maintenance PROJECT (hftlogubohbjiivcvkut).
-- The live project has already received compatibility migrations. See ../README-LIVE-TH.md.

-- MVR Smart Maintenance
-- 001_schema.sql
-- Fresh schema. No sample/demo data is inserted.

create extension if not exists pgcrypto;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  dept_code text not null unique,
  dept_name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on update cascade on delete restrict,
  machine_no text not null,
  machine_name text not null,
  production_line text,
  photo_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(department_id, machine_no)
);

-- Pre-provision users here before they have Auth accounts.
-- Technician auth_user_id is created/linked automatically on first code-only login.
create table if not exists public.app_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  employee_code text not null unique,
  username text unique,
  full_name text not null,
  department_id uuid references public.departments(id) on update cascade on delete restrict,
  role text not null default 'technician' check (role in ('admin','technician')),
  is_active boolean not null default true,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_username_required check (role <> 'admin' or username is not null),
  constraint technician_department_required check (role <> 'technician' or department_id is not null)
);

create table if not exists public.repair_reports (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on update cascade on delete restrict,
  machine_id uuid not null references public.machines(id) on update cascade on delete restrict,
  technician_id uuid not null references public.app_profiles(id) on update cascade on delete restrict,
  technician_name_snapshot text not null,
  technician_photo_path_snapshot text,
  machine_no_snapshot text not null,
  machine_name_snapshot text not null,
  production_line_snapshot text,
  symptom text not null,
  problem_type text,
  severity text not null default 'medium' check (severity in ('low','medium','high')),
  cause text not null,
  action_taken text not null,
  spare_parts text,
  status text not null default 'operational' check (status in ('operational','no_parts','follow_up')),
  started_at timestamptz not null,
  finished_at timestamptz,
  loss_time_min integer not null default 0 check (loss_time_min >= 0),
  remark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.repair_images (
  id uuid primary key default gen_random_uuid(),
  repair_report_id uuid not null references public.repair_reports(id) on delete cascade,
  file_path text not null unique,
  file_name text,
  caption text,
  uploaded_by uuid not null references public.app_profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.pm_plans (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on update cascade on delete restrict,
  machine_id uuid not null references public.machines(id) on update cascade on delete restrict,
  title text not null,
  description text,
  frequency text not null check (frequency in ('daily','weekly','monthly','quarterly','semiannual','annual')),
  start_date date not null,
  responsible_profile_id uuid references public.app_profiles(id) on delete set null,
  responsible_name_snapshot text,
  std_minutes integer not null default 0 check (std_minutes >= 0),
  is_active boolean not null default true,
  created_by uuid references public.app_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pm_checklist_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.pm_plans(id) on delete cascade,
  item_order integer not null default 1,
  item_name text not null,
  item_type text not null default 'check' check (item_type in ('check','measurement')),
  min_value numeric,
  max_value numeric,
  unit text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint measurement_range_valid check (min_value is null or max_value is null or min_value <= max_value)
);

create table if not exists public.pm_schedule (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.pm_plans(id) on update cascade on delete restrict,
  department_id uuid not null references public.departments(id) on update cascade on delete restrict,
  machine_id uuid not null references public.machines(id) on update cascade on delete restrict,
  plan_title_snapshot text not null,
  frequency_snapshot text not null,
  machine_no_snapshot text not null,
  machine_name_snapshot text not null,
  std_minutes_snapshot integer not null default 0,
  due_date date not null,
  status text not null default 'planned' check (status in ('planned','in_progress','completed','skipped')),
  assigned_to uuid references public.app_profiles(id) on delete set null,
  assignee_name_snapshot text,
  started_at timestamptz,
  completed_at timestamptz,
  execution_note text,
  overall_result text check (overall_result in ('normal','corrected','issue')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id, due_date)
);

create table if not exists public.pm_readings (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.pm_schedule(id) on delete cascade,
  item_id uuid not null references public.pm_checklist_items(id) on delete restrict,
  item_order_snapshot integer not null,
  item_name_snapshot text not null,
  item_type_snapshot text not null,
  min_value_snapshot numeric,
  max_value_snapshot numeric,
  unit_snapshot text,
  result text not null check (result in ('normal','abnormal','na')),
  measured_value numeric,
  abnormal_detail text,
  note text,
  inspector_id uuid not null references public.app_profiles(id) on delete restrict,
  inspected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(schedule_id, item_id)
);

create table if not exists public.pm_weekly_tasks (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  day_of_week integer not null check (day_of_week between 1 and 7),
  department_id uuid not null references public.departments(id) on update cascade on delete restrict,
  machine_id uuid references public.machines(id) on update cascade on delete set null,
  machine_no_snapshot text,
  machine_name_snapshot text,
  title text not null,
  details text,
  assigned_to uuid references public.app_profiles(id) on delete set null,
  assignee_name_snapshot text,
  status text not null default 'planned' check (status in ('planned','in_progress','done','skipped')),
  note text,
  sort_order integer not null default 0,
  created_by uuid references public.app_profiles(id) on delete set null,
  status_by uuid references public.app_profiles(id) on delete set null,
  status_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Server-side throttle store for code-only login. Browser roles receive no table privileges.
create table if not exists public.employee_code_login_rate_limits (
  fingerprint text primary key,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_machines_department on public.machines(department_id, is_active);
create index if not exists idx_profiles_department on public.app_profiles(department_id, role, is_active);
create index if not exists idx_repairs_dept_started on public.repair_reports(department_id, started_at desc);
create index if not exists idx_repairs_machine_started on public.repair_reports(machine_id, started_at desc);
create index if not exists idx_repairs_tech_started on public.repair_reports(technician_id, started_at desc);
create index if not exists idx_repairs_status on public.repair_reports(status, started_at desc);
create index if not exists idx_repair_images_report on public.repair_images(repair_report_id);
create index if not exists idx_pm_plans_department on public.pm_plans(department_id, is_active);
create index if not exists idx_pm_plans_machine on public.pm_plans(machine_id, is_active);
create index if not exists idx_pm_checklist_plan on public.pm_checklist_items(plan_id, item_order);
create index if not exists idx_pm_schedule_dept_due on public.pm_schedule(department_id, due_date, status);
create index if not exists idx_pm_schedule_machine_due on public.pm_schedule(machine_id, due_date);
create index if not exists idx_pm_readings_schedule on public.pm_readings(schedule_id);
create index if not exists idx_pm_weekly_dept_week on public.pm_weekly_tasks(department_id, week_start, day_of_week);
