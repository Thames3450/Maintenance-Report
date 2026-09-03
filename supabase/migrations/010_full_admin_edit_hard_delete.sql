-- MVR Smart Maintenance v2.15
-- Full Admin repair editing support + permanent delete.
-- Live project migration names:
--   mvr_v215_full_admin_edit_hard_delete
--   mvr_v215_history_edit_compat
--   mvr_v215_hard_delete_rls

alter table public.repair_report_audit enable row level security;

grant delete on public.repair_reports to authenticated;
grant delete on public.repair_report_audit to authenticated;

drop policy if exists mvr_repairs_admin_delete on public.repair_reports;
create policy mvr_repairs_admin_delete
on public.repair_reports
for delete to authenticated
using (private.is_admin());

drop policy if exists mvr_repair_report_audit_admin_delete on public.repair_report_audit;
create policy mvr_repair_report_audit_admin_delete
on public.repair_report_audit
for delete to authenticated
using (private.is_admin());

create or replace function public.mvr_admin_hard_delete_repair(p_report_id uuid)
returns void
language plpgsql
security invoker
set search_path='public,pg_temp'
as $$
begin
  if not private.is_admin() then
    raise exception 'Admin permission required';
  end if;

  delete from public.repair_reports
  where id=p_report_id;

  if not found then
    raise exception 'Repair report not found';
  end if;

  delete from public.repair_report_audit
  where repair_report_id=p_report_id;
end $$;

revoke all on function public.mvr_admin_hard_delete_repair(uuid) from public,anon;
grant execute on function public.mvr_admin_hard_delete_repair(uuid) to authenticated;

-- Note: private.prepare_repair_report() in the live project was also upgraded in v2.15
-- to refresh technician code/shift snapshots during Admin edits and to allow unchanged
-- historical inactive Master Data while still rejecting newly selected inactive items.
