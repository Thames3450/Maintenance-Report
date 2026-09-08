create or replace function public.kpi_trend_metrics_v1(
  p_department_id uuid default null,
  p_group_id uuid default null,
  p_machine_id uuid default null,
  p_from date default (date_trunc('month',current_date))::date,
  p_to date default current_date
)
returns jsonb
language sql
stable
security invoker
set search_path='public,pg_temp'
as $$
with
b as (
  select least(p_from,p_to) as s, greatest(p_from,p_to) as e
),
sm as (
  select m.*
  from public.machines m
  where m.is_active=true
    and (p_department_id is null or m.department_id=p_department_id)
    and (p_group_id is null or m.machine_group_id=p_group_id)
    and (p_machine_id is null or m.id=p_machine_id)
),
r as (
  select rr.*
  from public.repair_reports rr
  join sm on sm.id=rr.machine_id
  cross join b
  where rr.deleted_at is null
    and (rr.started_at at time zone 'Asia/Bangkok')>=b.s::timestamp
    and (rr.started_at at time zone 'Asia/Bangkok')<(b.e+1)::timestamp
),
meta as (
  select
    (select count(*)::numeric from sm) as machine_count,
    coalesce((
      select ks.hours_per_day::numeric
      from public.kpi_settings ks
      join public.departments d on d.dept_code=ks.dept_code
      where p_department_id is not null
        and d.id=p_department_id
        and (
          ks.machine_no is null
          or (
            p_machine_id is not null
            and ks.machine_no=(select machine_no from sm limit 1)
          )
        )
      order by (ks.machine_no is not null) desc,ks.updated_at desc
      limit 1
    ),24::numeric) as hours_per_day
),
calendar_days as (
  select gs::date as period_date
  from b cross join lateral generate_series(b.s,b.e,interval '1 day') gs
),
daily_raw as (
  select cd.period_date,count(r.id)::bigint as breakdown_count,coalesce(sum(r.loss_time_min),0)::numeric as downtime_min
  from calendar_days cd
  left join r on (r.started_at at time zone 'Asia/Bangkok')::date=cd.period_date
  group by cd.period_date
),
daily as (
  select
    dr.period_date,dr.breakdown_count,dr.downtime_min,
    round(m.machine_count*m.hours_per_day*60,2) as scheduled_min,
    round(greatest(0,m.machine_count*m.hours_per_day*60-dr.downtime_min),2) as uptime_min,
    case when dr.breakdown_count=0 then null else round(dr.downtime_min/dr.breakdown_count,2) end as mttr_min,
    case when dr.breakdown_count=0 then null else round(greatest(0,m.machine_count*m.hours_per_day*60-dr.downtime_min)/dr.breakdown_count/60,2) end as mtbf_hour,
    case when m.machine_count=0 then null else round(greatest(0,least(100,greatest(0,m.machine_count*m.hours_per_day*60-dr.downtime_min)/nullif(m.machine_count*m.hours_per_day*60,0)*100)),2) end as availability_pct
  from daily_raw dr cross join meta m
  order by dr.period_date
),
calendar_months as (
  select gs::date as period_month,greatest(gs::date,b.s) as period_start,least((gs+interval '1 month - 1 day')::date,b.e) as period_end
  from b cross join lateral generate_series(date_trunc('month',b.s)::date,date_trunc('month',b.e)::date,interval '1 month') gs
),
monthly_raw as (
  select
    cm.period_month,cm.period_start,cm.period_end,(cm.period_end-cm.period_start+1)::numeric as days_count,
    count(r.id)::bigint as breakdown_count,coalesce(sum(r.loss_time_min),0)::numeric as downtime_min
  from calendar_months cm
  left join r on (r.started_at at time zone 'Asia/Bangkok')::date between cm.period_start and cm.period_end
  group by cm.period_month,cm.period_start,cm.period_end
),
monthly as (
  select
    mr.period_month,mr.breakdown_count,mr.downtime_min,
    round(mr.days_count*m.hours_per_day*m.machine_count*60,2) as scheduled_min,
    round(greatest(0,mr.days_count*m.hours_per_day*m.machine_count*60-mr.downtime_min),2) as uptime_min,
    case when mr.breakdown_count=0 then null else round(mr.downtime_min/mr.breakdown_count,2) end as mttr_min,
    case when mr.breakdown_count=0 then null else round(greatest(0,mr.days_count*m.hours_per_day*m.machine_count*60-mr.downtime_min)/mr.breakdown_count/60,2) end as mtbf_hour,
    case when m.machine_count=0 then null else round(greatest(0,least(100,greatest(0,mr.days_count*m.hours_per_day*m.machine_count*60-mr.downtime_min)/nullif(mr.days_count*m.hours_per_day*m.machine_count*60,0)*100)),2) end as availability_pct
  from monthly_raw mr cross join meta m
  order by mr.period_month
)
select jsonb_build_object(
  'daily_trend',coalesce((select jsonb_agg(to_jsonb(d) order by d.period_date) from daily d),'[]'::jsonb),
  'monthly_trend',coalesce((select jsonb_agg(to_jsonb(mo) order by mo.period_month) from monthly mo),'[]'::jsonb)
)
$$;

revoke all on function public.kpi_trend_metrics_v1(uuid,uuid,uuid,date,date) from public,anon;
grant execute on function public.kpi_trend_metrics_v1(uuid,uuid,uuid,date,date) to authenticated;
