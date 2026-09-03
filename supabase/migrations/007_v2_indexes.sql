-- Cover the new v2 foreign keys used by report drill-down and audit.
create index if not exists idx_repair_reports_cause_id on public.repair_reports(cause_id);
create index if not exists idx_repair_reports_action_id on public.repair_reports(action_id);
create index if not exists idx_repair_reports_deleted_by on public.repair_reports(deleted_by);
create index if not exists idx_repair_report_audit_actor_user on public.repair_report_audit(actor_user_id);
create index if not exists idx_repair_report_audit_actor_profile on public.repair_report_audit(actor_profile_id);
