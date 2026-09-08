-- v2.30 Mobile Notification core
-- Already applied to live project hftlogubohbjiivcvkut on 2026-09-08.
-- This file is kept for source control / disaster recovery.

alter table public.maintenance_tasks
  add column if not exists assigned_shift text
  check (assigned_shift is null or assigned_shift in ('A','B','O'));

create table if not exists public.notification_preferences (
  profile_id uuid primary key references public.app_profiles(id) on delete cascade,
  push_enabled boolean not null default true,
  urgent_work boolean not null default true,
  planned_work boolean not null default true,
  improvement_work boolean not null default false,
  pm_reminders boolean not null default true,
  overdue boolean not null default true,
  spare_updates boolean not null default true,
  spare_new boolean not null default true,
  quiet_hours_enabled boolean not null default false,
  quiet_start time not null default '22:00',
  quiet_end time not null default '06:00',
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_department_subscriptions (
  profile_id uuid not null references public.app_profiles(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(profile_id,department_id)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.app_profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_name text,
  user_agent text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.app_profiles(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  category text not null,
  title text not null,
  body text not null,
  route text,
  data jsonb not null default '{}'::jsonb,
  dedupe_key text unique,
  pushed_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notification_department_profile_idx on public.notification_department_subscriptions(profile_id);
create index if not exists notification_department_department_idx on public.notification_department_subscriptions(department_id);
create index if not exists push_subscriptions_profile_idx on public.push_subscriptions(profile_id,is_active);
create index if not exists notifications_profile_created_idx on public.notifications(profile_id,created_at desc);
create index if not exists notifications_profile_unread_idx on public.notifications(profile_id,read_at,created_at desc);
create index if not exists maintenance_tasks_assigned_shift_idx on public.maintenance_tasks(department_id,assigned_shift,status);

alter table public.notification_preferences enable row level security;
alter table public.notification_department_subscriptions enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications enable row level security;

create policy notification_preferences_own_select on public.notification_preferences for select to authenticated using (profile_id=private.current_profile_id());
create policy notification_preferences_own_insert on public.notification_preferences for insert to authenticated with check (profile_id=private.current_profile_id());
create policy notification_preferences_own_update on public.notification_preferences for update to authenticated using (profile_id=private.current_profile_id()) with check (profile_id=private.current_profile_id());

create policy notification_department_own_select on public.notification_department_subscriptions for select to authenticated using (profile_id=private.current_profile_id());
create policy notification_department_own_insert on public.notification_department_subscriptions for insert to authenticated with check (private.is_admin() and profile_id=private.current_profile_id());
create policy notification_department_own_update on public.notification_department_subscriptions for update to authenticated using (private.is_admin() and profile_id=private.current_profile_id()) with check (private.is_admin() and profile_id=private.current_profile_id());
create policy notification_department_own_delete on public.notification_department_subscriptions for delete to authenticated using (private.is_admin() and profile_id=private.current_profile_id());

create policy push_subscriptions_own_select on public.push_subscriptions for select to authenticated using (profile_id=private.current_profile_id());
create policy push_subscriptions_own_insert on public.push_subscriptions for insert to authenticated with check (profile_id=private.current_profile_id());
create policy push_subscriptions_own_update on public.push_subscriptions for update to authenticated using (profile_id=private.current_profile_id()) with check (profile_id=private.current_profile_id());
create policy push_subscriptions_own_delete on public.push_subscriptions for delete to authenticated using (profile_id=private.current_profile_id());

create policy notifications_own_select on public.notifications for select to authenticated using (profile_id=private.current_profile_id());
create policy notifications_own_update on public.notifications for update to authenticated using (profile_id=private.current_profile_id()) with check (profile_id=private.current_profile_id());

grant select,insert,update on public.notification_preferences to authenticated;
grant select,insert,update,delete on public.notification_department_subscriptions to authenticated;
grant select,insert,update,delete on public.push_subscriptions to authenticated;
grant select,update on public.notifications to authenticated;

insert into public.notification_preferences(profile_id)
select id from public.app_profiles where is_active=true
on conflict(profile_id) do nothing;

insert into public.notification_department_subscriptions(profile_id,department_id,enabled)
select p.id,d.id,true
from public.app_profiles p cross join public.departments d
where p.role='admin' and p.is_active=true and d.is_active=true
on conflict(profile_id,department_id) do nothing;
