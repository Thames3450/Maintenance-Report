-- v2.28 People & Manager Workspace
-- Additive migration only. Does not alter technician workflow tables.

create table if not exists public.skill_catalog (
  id uuid primary key default gen_random_uuid(),
  skill_code text not null unique,
  skill_name_en text not null,
  skill_name_th text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.technician_skills (
  profile_id uuid not null references public.app_profiles(id) on delete cascade,
  skill_id uuid not null references public.skill_catalog(id) on delete cascade,
  skill_level smallint not null default 0 check (skill_level between 0 and 5),
  note text,
  assessed_at timestamptz,
  assessed_by uuid references public.app_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, skill_id)
);

create table if not exists public.manager_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.app_profiles(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  machine_id uuid references public.machines(id) on delete set null,
  repair_report_id uuid references public.repair_reports(id) on delete set null,
  bucket text not null default 'today' check (bucket in ('today','follow_up','waiting','improvement')),
  priority text not null default 'P2' check (priority in ('P1','P2','P3','P4')),
  title text not null,
  details text,
  status text not null default 'open' check (status in ('open','done','cancelled')),
  due_date date,
  waiting_for text,
  impact text check (impact is null or impact in ('high','medium','low')),
  effort text check (effort is null or effort in ('high','medium','low')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.manager_weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.app_profiles(id) on delete cascade,
  week_start date not null,
  went_well text,
  went_wrong text,
  improve_next_week text,
  top_priority_1 text,
  top_priority_2 text,
  top_priority_3 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_profile_id, week_start)
);

create index if not exists technician_skills_profile_idx on public.technician_skills(profile_id);
create index if not exists technician_skills_skill_idx on public.technician_skills(skill_id);
create index if not exists manager_tasks_owner_status_idx on public.manager_tasks(owner_profile_id,status);
create index if not exists manager_tasks_bucket_idx on public.manager_tasks(bucket);
create index if not exists manager_tasks_due_idx on public.manager_tasks(due_date);
create index if not exists manager_weekly_reviews_owner_week_idx on public.manager_weekly_reviews(owner_profile_id,week_start);

alter table public.skill_catalog enable row level security;
alter table public.technician_skills enable row level security;
alter table public.manager_tasks enable row level security;
alter table public.manager_weekly_reviews enable row level security;

-- Admin-only management tables. Technician portal does not query these tables.
drop policy if exists skill_catalog_admin_select on public.skill_catalog;
create policy skill_catalog_admin_select on public.skill_catalog for select using (private.is_admin());
drop policy if exists skill_catalog_admin_insert on public.skill_catalog;
create policy skill_catalog_admin_insert on public.skill_catalog for insert with check (private.is_admin());
drop policy if exists skill_catalog_admin_update on public.skill_catalog;
create policy skill_catalog_admin_update on public.skill_catalog for update using (private.is_admin()) with check (private.is_admin());
drop policy if exists skill_catalog_admin_delete on public.skill_catalog;
create policy skill_catalog_admin_delete on public.skill_catalog for delete using (private.is_admin());

drop policy if exists technician_skills_admin_select on public.technician_skills;
create policy technician_skills_admin_select on public.technician_skills for select using (private.is_admin());
drop policy if exists technician_skills_admin_insert on public.technician_skills;
create policy technician_skills_admin_insert on public.technician_skills for insert with check (private.is_admin());
drop policy if exists technician_skills_admin_update on public.technician_skills;
create policy technician_skills_admin_update on public.technician_skills for update using (private.is_admin()) with check (private.is_admin());
drop policy if exists technician_skills_admin_delete on public.technician_skills;
create policy technician_skills_admin_delete on public.technician_skills for delete using (private.is_admin());

drop policy if exists manager_tasks_admin_select on public.manager_tasks;
create policy manager_tasks_admin_select on public.manager_tasks for select using (private.is_admin());
drop policy if exists manager_tasks_admin_insert on public.manager_tasks;
create policy manager_tasks_admin_insert on public.manager_tasks for insert with check (private.is_admin());
drop policy if exists manager_tasks_admin_update on public.manager_tasks;
create policy manager_tasks_admin_update on public.manager_tasks for update using (private.is_admin()) with check (private.is_admin());
drop policy if exists manager_tasks_admin_delete on public.manager_tasks;
create policy manager_tasks_admin_delete on public.manager_tasks for delete using (private.is_admin());

drop policy if exists manager_weekly_reviews_admin_select on public.manager_weekly_reviews;
create policy manager_weekly_reviews_admin_select on public.manager_weekly_reviews for select using (private.is_admin());
drop policy if exists manager_weekly_reviews_admin_insert on public.manager_weekly_reviews;
create policy manager_weekly_reviews_admin_insert on public.manager_weekly_reviews for insert with check (private.is_admin());
drop policy if exists manager_weekly_reviews_admin_update on public.manager_weekly_reviews;
create policy manager_weekly_reviews_admin_update on public.manager_weekly_reviews for update using (private.is_admin()) with check (private.is_admin());
drop policy if exists manager_weekly_reviews_admin_delete on public.manager_weekly_reviews;
create policy manager_weekly_reviews_admin_delete on public.manager_weekly_reviews for delete using (private.is_admin());

insert into public.skill_catalog(skill_code,skill_name_en,skill_name_th,sort_order)
values
 ('MECHANICAL','Mechanical','เครื่องกล',10),
 ('ELECTRICAL','Electrical','ไฟฟ้า',20),
 ('PLC','PLC','พีแอลซี',30),
 ('HMI','HMI','หน้าจอ HMI',40),
 ('SERVO','Servo','เซอร์โว',50),
 ('ROBOT','Robot','หุ่นยนต์',60),
 ('HYDRAULIC','Hydraulic','ไฮดรอลิก',70),
 ('PNEUMATIC','Pneumatic','นิวเมติก',80),
 ('INJECTION','Injection Machine','เครื่องฉีดพลาสติก',90),
 ('VACUUM_FORMING','Vacuum Forming','เครื่องแวคคั่มฟอร์ม',100),
 ('CRANE','Crane','เครน',110),
 ('WELDING','Welding','งานเชื่อม',120)
on conflict (skill_code) do update set
 skill_name_en=excluded.skill_name_en,
 skill_name_th=excluded.skill_name_th,
 sort_order=excluded.sort_order,
 is_active=true,
 updated_at=now();
