-- v2.26 Admin-only Work Board
-- Additive migration: does not rename/drop existing tables and does not change technician-side policies.

create table if not exists public.maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id) on delete set null,
  machine_id uuid references public.machines(id) on delete set null,
  repair_report_id uuid references public.repair_reports(id) on delete set null,
  title text not null,
  details text,
  task_type text not null default 'planned' check (task_type in ('follow_up','planned','improvement','inspection','safety','other')),
  priority text not null default 'P3' check (priority in ('P1','P2','P3','P4')),
  status text not null default 'new' check (status in ('new','assigned','working','waiting','completed','cancelled')),
  assigned_to uuid references public.app_profiles(id) on delete set null,
  owner_profile_id uuid references public.app_profiles(id) on delete set null,
  due_date date,
  waiting_reason text,
  completed_at timestamptz,
  created_by uuid references public.app_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maintenance_tasks_department_idx on public.maintenance_tasks(department_id);
create index if not exists maintenance_tasks_machine_idx on public.maintenance_tasks(machine_id);
create index if not exists maintenance_tasks_status_idx on public.maintenance_tasks(status);
create index if not exists maintenance_tasks_due_date_idx on public.maintenance_tasks(due_date);
create index if not exists maintenance_tasks_assigned_to_idx on public.maintenance_tasks(assigned_to);

alter table public.maintenance_tasks enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='maintenance_tasks' and policyname='mvr_maintenance_tasks_admin_select') then
    create policy "mvr_maintenance_tasks_admin_select" on public.maintenance_tasks for select using (private.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='maintenance_tasks' and policyname='mvr_maintenance_tasks_admin_insert') then
    create policy "mvr_maintenance_tasks_admin_insert" on public.maintenance_tasks for insert with check (private.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='maintenance_tasks' and policyname='mvr_maintenance_tasks_admin_update') then
    create policy "mvr_maintenance_tasks_admin_update" on public.maintenance_tasks for update using (private.is_admin()) with check (private.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='maintenance_tasks' and policyname='mvr_maintenance_tasks_admin_delete') then
    create policy "mvr_maintenance_tasks_admin_delete" on public.maintenance_tasks for delete using (private.is_admin());
  end if;
end $$;

create or replace function public.maintenance_tasks_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_at = coalesce(new.completed_at, now());
  elsif new.status is distinct from 'completed' then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists maintenance_tasks_touch_updated_at on public.maintenance_tasks;
create trigger maintenance_tasks_touch_updated_at
before update on public.maintenance_tasks
for each row execute function public.maintenance_tasks_touch_updated_at();
