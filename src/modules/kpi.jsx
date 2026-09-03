import React, { useEffect, useMemo, useState } from "react";
import {
  addDaysISO,
  formatThaiDate,
  formatThaiDateTime,
  requireSupabase,
  rpc,
  severityLabel,
  statusLabel,
  todayISO
} from "../../core.js";
import { Badge, CardTitle, Empty, ErrorState, Loading, SearchSelect } from "../components/UI.jsx";

const TYPE_LABEL={injection:"Injection",crane:"Crane",vacuum_pump:"Vacuum Pump"};
const SEV_LABEL={low:"เล็กน้อย",medium:"ปานกลาง",high:"รุนแรง"};
const PM_LABEL={normal:"ปกติ",corrected:"แก้ไขแล้ว",issue:"พบปัญหา"};
const PM_STATUS={planned:"วางแผนไว้",in_progress:"กำลังทำ",completed:"เสร็จแล้ว",done:"เสร็จแล้ว",skipped:"ไม่ได้ทำ",overdue:"เกินกำหนด"};

function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d}
function nullableNum(v){const n=Number(v);return v===null||v===undefined||v===""||!Number.isFinite(n)?null:n}
function fmt(v,d=0){const n=nullableNum(v);return n===null?"—":n.toLocaleString("th-TH",{minimumFractionDigits:d,maximumFractionDigits:d})}
function rangeDays(a,b){if(!a||!b)return 0;return Math.max(1,Math.round((new Date(`${b}T12:00:00Z`)-new Date(`${a}T12:00:00Z`))/86400000)+1)}
function startOfMonth(iso=todayISO()){return `${iso.slice(0,7)}-01`}
function startOfYear(iso=todayISO()){return `${iso.slice(0,4)}-01-01`}
function minusMonths(iso,months){const [y,m]=iso.split("-").map(Number);return new Date(Date.UTC(y,m-1-months,1,12)).toISOString().slice(0,10)}
function equipmentLabel(v){return TYPE_LABEL[v]||v||"เครื่องจักร"}
function severityText(v){return SEV_LABEL[v]||severityLabel(v)||v||"-"}
function statusText(v){return statusLabel(v)||v||"-"}

function MetricCard({label,value,unit,sub,tone="",target}){
  return <div className={`kpi-card kpi-card-v2 ${tone}`}>
    <div className="kpi-label">{label}</div>
    <div className="kpi-value">{value}</div>
    <div className="kpi-sub">{unit}{target!==null&&target!==undefined?<span className="kpi-target">เป้า {target}</span>:null}</div>
    {sub?<div className="kpi-note">{sub}</div>:null}
  </div>
}

function Section({icon="kpi",title,sub,children,className=""}){
  return <section className={`card kpi-section ${className}`}><CardTitle icon={icon} title={title} sub={sub}/>{children}</section>
}

function TrendLine({rows=[],dateKey="period_date",valueKey="downtime_min",unit=" นาที"}){
  if(!rows.length)return <Empty title="ยังไม่มีข้อมูลแนวโน้ม"/>;
  const W=780,H=250,L=54,R=18,T=18,B=44;
  const vals=rows.map(r=>num(r[valueKey]));
  const max=Math.max(1,...vals);
  const pts=rows.map((r,i)=>({
    x:L+(rows.length===1?0:(i/(rows.length-1))*(W-L-R)),
    y:T+(1-vals[i]/max)*(H-T-B),
    row:r,
    val:vals[i]
  }));
  const poly=pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area=`${L},${H-B} ${poly} ${pts.at(-1)?.x||L},${H-B}`;
  const ticks=[0,.25,.5,.75,1].map(x=>Math.round(max*x));
  const xidx=[0,Math.round((rows.length-1)/3),Math.round((rows.length-1)*2/3),rows.length-1].filter((v,i,a)=>a.indexOf(v)===i);
  return <div className="chart-shell"><svg className="trend-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="กราฟแนวโน้ม">
    {ticks.map((t,i)=>{const y=T+(1-i/(ticks.length-1))*(H-T-B);return <g key={i}><line x1={L} y1={y} x2={W-R} y2={y} className="chart-grid-line"/><text x={L-8} y={y+4} textAnchor="end" className="chart-axis-text">{t.toLocaleString("th-TH")}</text></g>})}
    <polygon points={area} className="trend-area"/>
    <polyline points={poly} className="trend-line"/>
    {pts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={rows.length>60?2.4:3.8} className="trend-dot"><title>{formatThaiDate(p.row[dateKey])}: {p.val.toLocaleString("th-TH")}{unit}</title></circle>)}
    {xidx.map(i=><text key={i} x={pts[i].x} y={H-15} textAnchor={i===0?"start":i===rows.length-1?"end":"middle"} className="chart-axis-text">{formatThaiDate(rows[i][dateKey],{year:undefined})}</text>)}
  </svg><div className="chart-summary"><span>รวม <b>{vals.reduce((a,b)=>a+b,0).toLocaleString("th-TH")}{unit}</b></span><span>สูงสุด <b>{max.toLocaleString("th-TH")}{unit}</b></span></div></div>
}

function TrendBars({rows=[],dateKey="period_date",valueKey="breakdown_count",unit=" ครั้ง"}){
  if(!rows.length)return <Empty title="ยังไม่มีข้อมูลแนวโน้ม"/>;
  const max=Math.max(1,...rows.map(r=>num(r[valueKey])));
  const visible=rows.length>45?rows.filter((_,i)=>i%Math.ceil(rows.length/45)===0||i===rows.length-1):rows;
  return <div className="spark-bars" title="จำนวนครั้งเสีย"><div className="spark-bar-area">{visible.map((r,i)=>{const v=num(r[valueKey]);return <div className="spark-bar-col" key={`${r[dateKey]}-${i}`}><div className="spark-bar-value">{v||""}</div><div className="spark-bar" style={{height:`${Math.max(v?8:2,v/max*100)}%`}} title={`${formatThaiDate(r[dateKey])}: ${v}${unit}`}/></div>})}</div><div className="chart-summary"><span>รวม <b>{rows.reduce((a,r)=>a+num(r[valueKey]),0).toLocaleString("th-TH")}{unit}</b></span><span>สูงสุด/ช่วง <b>{max.toLocaleString("th-TH")}{unit}</b></span></div></div>
}

function RankBars({rows=[],valueKey="downtime_min",secondaryKey="occurrences",suffix=" นาที",limit=8}){
  const list=(rows||[]).slice(0,limit);
  if(!list.length)return <Empty title="ยังไม่มีข้อมูลสำหรับวิเคราะห์"/>;
  const max=Math.max(1,...list.map(r=>num(r[valueKey])));
  return <div className="analysis-bars">{list.map((r,i)=><div className="analysis-bar-row" key={`${r.label}-${i}`}>
    <div className="analysis-rank">{i+1}</div>
    <div className="analysis-bar-copy"><div className="analysis-bar-title" title={r.label}>{r.label||"ไม่ระบุ"}</div><div className="analysis-track"><div className="analysis-fill" style={{width:`${Math.max(4,num(r[valueKey])/max*100)}%`}}/></div></div>
    <div className="analysis-values"><b>{num(r[valueKey]).toLocaleString("th-TH")}{suffix}</b>{secondaryKey&&r[secondaryKey]!==undefined?<span>{num(r[secondaryKey]).toLocaleString("th-TH")} ครั้ง</span>:null}</div>
  </div>)}</div>
}

function Distribution({rows=[],kind="status"}){
  const total=rows.reduce((a,r)=>a+num(r.occurrences),0);
  if(!total)return <Empty title="ยังไม่มีข้อมูล"/>;
  const label=(v)=>kind==="severity"?severityText(v):kind==="status"?statusText(v):v||"ไม่ระบุ";
  return <div className="distribution-list">{rows.map((r,i)=>{const pct=total?num(r.occurrences)/total*100:0;return <div className="distribution-row" key={`${r.label}-${i}`}><div className="distribution-head"><b>{label(r.label)}</b><span>{num(r.occurrences)} ครั้ง · {pct.toFixed(1)}%</span></div><div className="distribution-track"><div className={`distribution-fill dist-${i%5}`} style={{width:`${pct}%`}}/></div><small>Downtime {num(r.downtime_min).toLocaleString("th-TH")} นาที</small></div>})}</div>
}

function HealthBadge({availability,target=95,breakdowns=0}){
  const a=num(availability,100),t=num(target,95);
  if(!breakdowns)return <span className="health-pill good">ไม่มี Breakdown</span>;
  if(a>=t)return <span className="health-pill good">ปกติ</span>;
  if(a>=t-2)return <span className="health-pill warn">เฝ้าระวัง</span>;
  return <span className="health-pill danger">ต้องวิเคราะห์</span>;
}

function MachineHealth({rows=[],target,search,setSearch,onSelect}){
  const filtered=rows.filter(r=>`${r.machine_no} ${r.machine_name} ${r.area||""}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <div className="machine-health-toolbar"><div className="field kpi-search"><label>ค้นหาเครื่อง</label><input className="input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="เช่น IVF4 / 650T-16 / Crane No.4"/></div><div className="machine-health-count">{filtered.length.toLocaleString("th-TH")} เครื่อง</div></div>
    {!filtered.length?<Empty title="ไม่พบเครื่องจักรตามคำค้น"/>:<>
      <div className="desktop-only"><div className="table-wrap kpi-health-wrap"><table className="table kpi-health-table"><thead><tr><th>เครื่อง</th><th>พื้นที่</th><th>สถานะ</th><th>เสีย</th><th>Downtime</th><th>MTTR</th><th>MTBF</th><th>Availability</th><th></th></tr></thead><tbody>{filtered.map(r=><tr key={r.machine_id}><td><b className="mono">{r.machine_no}</b><br/><span className="muted-xs">{r.machine_name}</span></td><td>{r.area||"-"}{r.has_robot===true?<><br/><span className="robot-tag">Robot</span></>:r.has_robot===false?<><br/><span className="robot-tag off">No Robot</span></>:null}</td><td><HealthBadge availability={r.availability_pct} target={target} breakdowns={num(r.breakdown_count)}/></td><td className="mono">{num(r.breakdown_count)}</td><td className="mono">{num(r.downtime_min).toLocaleString("th-TH")} m</td><td className="mono">{fmt(r.mttr_min,1)}</td><td className="mono">{fmt(r.mtbf_hour,1)}</td><td><b className="mono">{fmt(r.availability_pct,2)}%</b></td><td><button className="btn small" onClick={()=>onSelect(r.machine_id)}>ดูเครื่องนี้</button></td></tr>)}</tbody></table></div></div>
      <div className="mobile-only machine-health-cards">{filtered.map(r=><button type="button" className="machine-health-card" key={r.machine_id} onClick={()=>onSelect(r.machine_id)}><div className="machine-health-card-head"><div><b className="mono">{r.machine_no}</b><span>{r.machine_name}</span></div><HealthBadge availability={r.availability_pct} target={target} breakdowns={num(r.breakdown_count)}/></div><div className="machine-health-mini-grid"><div><small>เสีย</small><b>{num(r.breakdown_count)} ครั้ง</b></div><div><small>Downtime</small><b>{num(r.downtime_min)} นาที</b></div><div><small>MTTR</small><b>{fmt(r.mttr_min,1)}</b></div><div><small>Availability</small><b>{fmt(r.availability_pct,2)}%</b></div></div><div className="machine-health-foot"><span>{r.area||"ไม่ระบุพื้นที่"}</span>{r.has_robot!==null&&r.has_robot!==undefined?<span>{r.has_robot?"มี Robot":"ไม่มี Robot"}</span>:null}</div></button>)}</div>
    </>}
  </>
}

function InsightPanel({data,selectedMachine}){
  const s=data?.summary||{},machines=data?.machine_ranking||[],causes=data?.causes||[],problems=data?.problem_pareto||[];
  const worst=machines.find(x=>num(x.breakdown_count)>0),cause=causes[0],problem=problems[0];
  const insights=[];
  if(selectedMachine)insights.push({title:`กำลังวิเคราะห์ ${selectedMachine.machine_no}`,text:`${selectedMachine.machine_name}${selectedMachine.area?` · ${selectedMachine.area}`:""}${selectedMachine.has_robot===true?" · มี Robot":selectedMachine.has_robot===false?" · ไม่มี Robot":""}`});
  if(worst)insights.push({title:"เครื่องที่เสียเวลาสูงสุด",text:`${worst.machine_no} มี Downtime ${num(worst.downtime_min).toLocaleString("th-TH")} นาที จาก ${num(worst.breakdown_count)} ครั้ง`});
  if(cause)insights.push({title:"สาเหตุหลัก",text:`${cause.label} ทำให้เสียเวลา ${num(cause.downtime_min).toLocaleString("th-TH")} นาที (${num(cause.occurrences)} ครั้ง)`});
  if(problem)insights.push({title:"ปัญหาซ้ำบ่อย",text:`${problem.label} เกิด ${num(problem.occurrences)} ครั้ง รวม ${num(problem.downtime_min).toLocaleString("th-TH")} นาที`});
  if(num(s.follow_up_count)+num(s.no_parts_count)>0)insights.push({title:"งานที่ต้องติดตาม",text:`ต้องติดตามต่อ ${num(s.follow_up_count)} งาน · ไม่มีอะไหล่ ${num(s.no_parts_count)} งาน`});
  if(!insights.length)return <Empty title="ยังไม่มี Insight" text="เมื่อมีประวัติซ่อม ระบบจะสรุปจุดที่ควรสนใจให้ที่นี่"/>;
  return <div className="insight-grid">{insights.slice(0,5).map((x,i)=><div className="insight-card" key={i}><span className="insight-index">{String(i+1).padStart(2,"0")}</span><div><b>{x.title}</b><p>{x.text}</p></div></div>)}</div>
}

export default function KPIModule(){
  const today=todayISO();
  const [departments,setDepartments]=useState([]);
  const [groups,setGroups]=useState([]);
  const [machines,setMachines]=useState([]);
  const [filters,setFilters]=useState({department_id:"",group_id:"",machine_id:"",from:startOfMonth(today),to:today});
  const [data,setData]=useState(null);
  const [pmData,setPmData]=useState([]);
  const [loading,setLoading]=useState(true);
  const [mastersLoading,setMastersLoading]=useState(true);
  const [error,setError]=useState("");
  const [machineSearch,setMachineSearch]=useState("");

  useEffect(()=>{(async()=>{try{setMastersLoading(true);const sb=requireSupabase();const [d,g,m]=await Promise.all([
    sb.from("departments").select("id,dept_code,dept_name,is_active,sort_order").eq("is_active",true).order("sort_order"),
    sb.from("machine_groups").select("id,department_id,group_code,group_name,sort_order,is_active").eq("is_active",true).order("sort_order"),
    sb.from("machines").select("id,department_id,machine_group_id,machine_no,machine_name,production_line,area,equipment_type,has_robot,is_active").eq("is_active",true).order("machine_no")
  ]);if(d.error)throw d.error;if(g.error)throw g.error;if(m.error)throw m.error;setDepartments(d.data||[]);setGroups(g.data||[]);setMachines(m.data||[])}catch(e){setError(e.message||"โหลด Master KPI ไม่สำเร็จ")}finally{setMastersLoading(false)}})()},[]);

  async function load(){
    setLoading(true);setError("");
    try{
      const args={p_department_id:filters.department_id||null,p_group_id:filters.group_id||null,p_machine_id:filters.machine_id||null,p_from:filters.from,p_to:filters.to};
      const dashboard=await rpc("kpi_dashboard_v2",args);
      const sb=requireSupabase();
      let q=sb.from("pm_schedule").select("id,department_id,machine_id,due_date,status,plan_title_snapshot,machine_no_snapshot,machine_name_snapshot,overall_result,completed_at").gte("due_date",filters.from).lte("due_date",filters.to).order("due_date",{ascending:false}).limit(300);
      if(filters.department_id)q=q.eq("department_id",filters.department_id);
      if(filters.machine_id)q=q.eq("machine_id",filters.machine_id);
      else if(filters.group_id){const ids=machines.filter(m=>m.machine_group_id===filters.group_id).map(m=>m.id);if(ids.length)q=q.in("machine_id",ids);else q=q.eq("id","00000000-0000-0000-0000-000000000000")}
      const {data:pm,error:pmErr}=await q;if(pmErr)throw pmErr;
      setData(dashboard||{});setPmData(pm||[]);
    }catch(e){setError(e.message||"โหลด KPI ไม่สำเร็จ")}finally{setLoading(false)}
  }
  useEffect(()=>{if(!mastersLoading)load()},[mastersLoading,filters.department_id,filters.group_id,filters.machine_id,filters.from,filters.to]);

  const visibleGroups=useMemo(()=>groups.filter(g=>!filters.department_id||g.department_id===filters.department_id),[groups,filters.department_id]);
  const visibleMachines=useMemo(()=>machines.filter(m=>(!filters.department_id||m.department_id===filters.department_id)&&(!filters.group_id||m.machine_group_id===filters.group_id)),[machines,filters.department_id,filters.group_id]);
  const selectedMachine=machines.find(m=>m.id===filters.machine_id)||null;
  const selectedDepartment=departments.find(d=>d.id===filters.department_id)||null;
  const selectedGroup=groups.find(g=>g.id===filters.group_id)||null;
  const s=data?.summary||{};
  const trendRows=rangeDays(filters.from,filters.to)>75?(data?.monthly_trend||[]):(data?.daily_trend||[]);
  const trendDateKey=rangeDays(filters.from,filters.to)>75?"period_month":"period_date";
  const pmSummary=useMemo(()=>({total:pmData.length,done:pmData.filter(x=>x.status==="completed").length,issue:pmData.filter(x=>x.overall_result==="issue").length,corrected:pmData.filter(x=>x.overall_result==="corrected").length,normal:pmData.filter(x=>x.overall_result==="normal").length}),[pmData]);

  function setPreset(name){
    const t=todayISO();let from=startOfMonth(t),to=t;
    if(name==="7d")from=addDaysISO(t,-6);
    if(name==="30d")from=addDaysISO(t,-29);
    if(name==="3m")from=minusMonths(t,2);
    if(name==="6m")from=minusMonths(t,5);
    if(name==="year")from=startOfYear(t);
    setFilters(f=>({...f,from,to}));
  }
  function chooseDepartment(v){setFilters(f=>({...f,department_id:v,group_id:"",machine_id:""}));setMachineSearch("")}
  function chooseGroup(v){setFilters(f=>({...f,group_id:v,machine_id:""}));setMachineSearch("")}
  function focusMachine(id){const m=machines.find(x=>x.id===id);if(!m)return;setFilters(f=>({...f,department_id:m.department_id,group_id:m.machine_group_id||"",machine_id:id}));setMachineSearch("");window.scrollTo({top:0,behavior:"smooth"})}
  function resetScope(){setFilters(f=>({...f,department_id:"",group_id:"",machine_id:""}));setMachineSearch("")}

  if(mastersLoading&&!data)return <Loading text="กำลังเตรียมข้อมูล KPI…"/>;
  if(error&&!data)return <ErrorState message={error} onRetry={load}/>;

  return <div className="stack kpi-page-v2">
    <section className="hero kpi-hero"><div className="hero-kicker">MAINTENANCE ANALYTICS</div><h1>KPI & Machine Analytics</h1><p>วิเคราะห์ Downtime, Breakdown, MTBF, MTTR, Availability, ปัญหาซ้ำ สาเหตุ และสุขภาพรายเครื่องจากข้อมูล Repair จริง</p></section>

    <section className="card flat kpi-filter-card"><div className="kpi-filter-head"><CardTitle icon="filter" title="ขอบเขตการวิเคราะห์" sub="เลือกแผนก กลุ่ม/Zone หมายเลขเครื่อง และช่วงวันที่"/><button className="btn ghost small" onClick={resetScope}>ดูทั้งหมด</button></div>
      <div className="quick-range"><button onClick={()=>setPreset("month")}>เดือนนี้</button><button onClick={()=>setPreset("7d")}>7 วัน</button><button onClick={()=>setPreset("30d")}>30 วัน</button><button onClick={()=>setPreset("3m")}>3 เดือน</button><button onClick={()=>setPreset("6m")}>6 เดือน</button><button onClick={()=>setPreset("year")}>ปีนี้</button></div>
      <div className="field-grid kpi-filter-grid">
        <div className="field"><label>แผนก</label><select className="select" value={filters.department_id} onChange={e=>chooseDepartment(e.target.value)}><option value="">ทุกแผนก</option>{departments.map(d=><option key={d.id} value={d.id}>{d.dept_code} · {d.dept_name}</option>)}</select></div>
        <div className="field"><label>กลุ่มเครื่อง / Zone</label><SearchSelect value={filters.group_id} onChange={chooseGroup} disabled={!filters.department_id} placeholder="ทุกกลุ่ม / Zone" searchPlaceholder="ค้นหา Zone หรือกลุ่มเครื่อง…" options={[{value:"",label:"ทุกกลุ่ม / Zone",sub:`${visibleMachines.length} เครื่อง`},...visibleGroups.map(g=>({value:g.id,label:g.group_name,sub:`${machines.filter(m=>m.machine_group_id===g.id).length} เครื่อง`}))]}/></div>
        <div className="field"><label>หมายเลขเครื่อง</label><SearchSelect value={filters.machine_id} onChange={v=>setFilters(f=>({...f,machine_id:v}))} placeholder="ทุกหมายเลขเครื่อง" searchPlaceholder="พิมพ์เลขเครื่อง เช่น 650T-16 / IVF4…" options={[{value:"",label:"ทุกหมายเลขเครื่อง",sub:`${visibleMachines.length} เครื่อง`},...visibleMachines.map(m=>({value:m.id,label:m.machine_no,sub:[m.machine_name,m.area,m.has_robot===true?"มี Robot":m.has_robot===false?"ไม่มี Robot":""].filter(Boolean).join(" · ")}))]}/></div>
        <div className="field"><label>ตั้งแต่วันที่</label><input className="input" type="date" value={filters.from} max={filters.to} onChange={e=>setFilters(f=>({...f,from:e.target.value}))}/></div>
        <div className="field"><label>ถึงวันที่</label><input className="input" type="date" value={filters.to} min={filters.from} onChange={e=>setFilters(f=>({...f,to:e.target.value}))}/></div>
      </div>
      <div className="kpi-scope-strip"><span>{selectedDepartment?selectedDepartment.dept_code:"ทุกแผนก"}</span><b>›</b><span>{selectedGroup?.group_name||"ทุกกลุ่ม"}</span><b>›</b><strong>{selectedMachine?.machine_no||"ทุกเครื่อง"}</strong><div className="scope-date">{formatThaiDate(filters.from)} – {formatThaiDate(filters.to)}</div></div>
      {selectedMachine?<div className="selected-machine-strip"><div><b className="mono">{selectedMachine.machine_no}</b><span>{selectedMachine.machine_name}</span></div><div className="selected-machine-tags">{selectedMachine.area?<span>{selectedMachine.area}</span>:null}{selectedMachine.equipment_type?<span>{equipmentLabel(selectedMachine.equipment_type)}</span>:null}{selectedMachine.has_robot===true?<span>มี Robot</span>:selectedMachine.has_robot===false?<span>ไม่มี Robot</span>:null}</div></div>:null}
    </section>

    {loading?<div className="card flat"><Loading text="กำลังคำนวณ KPI และวิเคราะห์ข้อมูล…"/></div>:null}
    {error?<div className="card flat error-inline">{error}</div>:null}

    <div className="kpi-grid kpi-grid-v2">
      <MetricCard label="Downtime" value={fmt(s.downtime_min)} unit="นาที" tone="danger" sub={`สูงสุดต่อครั้ง ${fmt(s.max_downtime_min)} นาที`}/>
      <MetricCard label="Breakdown" value={fmt(s.breakdown_count)} unit="ครั้ง" tone="warn" sub={`กระทบ ${fmt(s.affected_machines)} / ${fmt(s.active_machines)} เครื่อง`}/>
      <MetricCard label="MTTR" value={fmt(s.mttr_min,1)} unit="นาที/ครั้ง" target={s.target_mttr_min}/>
      <MetricCard label="MTBF" value={fmt(s.mtbf_hour,1)} unit="ชั่วโมง" tone="purple" target={s.target_mtbf_hr}/>
      <MetricCard label="Availability" value={`${fmt(s.availability_pct,2)}%`} unit="ความพร้อมใช้งาน" tone="good" target={s.target_availability!==null&&s.target_availability!==undefined?`${fmt(s.target_availability,0)}%`:null}/>
      <MetricCard label="เครื่องที่มีปัญหา" value={fmt(s.affected_machines)} unit={`จาก ${fmt(s.active_machines)} เครื่อง`} sub={num(s.active_machines)?`${(num(s.affected_machines)/num(s.active_machines)*100).toFixed(1)}% ของขอบเขตที่เลือก`:"-"}/>
      <MetricCard label="ต้องติดตามต่อ" value={fmt(s.follow_up_count)} unit="งาน" tone={num(s.follow_up_count)?"warn":""}/>
      <MetricCard label="ไม่มีอะไหล่" value={fmt(s.no_parts_count)} unit="งาน" tone={num(s.no_parts_count)?"danger":""}/>
    </div>

    <Section icon="kpi" title="Insight ที่ควรสนใจ" sub="สรุปจุดสำคัญจากขอบเขตที่เลือก"><InsightPanel data={data} selectedMachine={selectedMachine}/></Section>

    <div className="kpi-chart-grid">
      <Section icon="kpi" title="แนวโน้ม Downtime" sub={rangeDays(filters.from,filters.to)>75?"สรุปรายเดือน":"สรุปรายวัน"}><TrendLine rows={trendRows} dateKey={trendDateKey}/></Section>
      <Section icon="alert" title="แนวโน้มจำนวนครั้งเสีย" sub={rangeDays(filters.from,filters.to)>75?"Breakdown รายเดือน":"Breakdown รายวัน"}><TrendBars rows={trendRows} dateKey={trendDateKey}/></Section>
    </div>

    <div className="grid grid-3 kpi-analysis-grid">
      <Section icon="alert" title="Pareto ปัญหาซ้ำ" sub="ปัญหาที่เกิดบ่อยที่สุด"><RankBars rows={data?.problem_pareto||[]} valueKey="occurrences" secondaryKey="downtime_min" suffix=" ครั้ง"/></Section>
      <Section icon="machine" title="จุดเสียที่กินเวลา" sub="ตำแหน่งที่สร้าง Downtime สูง"><RankBars rows={data?.point_pareto||[]} valueKey="downtime_min" secondaryKey="occurrences"/></Section>
      <Section icon="repair" title="สาเหตุเสียสูงสุด" sub="เรียงตาม Downtime"><RankBars rows={data?.causes||[]} valueKey="downtime_min" secondaryKey="occurrences"/></Section>
    </div>

    <div className="grid grid-3 kpi-analysis-grid">
      <Section icon="report" title="ประเภทปัญหา" sub="Electrical / Mechanical / Air และประเภทอื่น"><Distribution rows={data?.problem_types||[]} kind="type"/></Section>
      <Section icon="alert" title="ระดับความรุนแรง" sub="สัดส่วนงานเสียแต่ละระดับ"><Distribution rows={data?.severity||[]} kind="severity"/></Section>
      <Section icon="repair" title="ผลหลังซ่อม" sub="ปกติ / ต้องติดตาม / ไม่มีอะไหล่"><Distribution rows={data?.status||[]} kind="status"/></Section>
    </div>

    <Section icon="machine" title="Machine Health — ดู KPI รายหมายเลขเครื่อง" sub="เรียงเครื่องที่ Downtime สูงก่อน กดดูเครื่องนี้เพื่อเจาะรายละเอียด"><MachineHealth rows={data?.machine_ranking||[]} target={s.target_availability} search={machineSearch} setSearch={setMachineSearch} onSelect={focusMachine}/></Section>

    <div className="grid grid-3 kpi-analysis-grid">
      <Section icon="clock" title="Breakdown ตามกะ" sub="ดูว่ากะไหนเกิดงานเสียและ Downtime มาก"><Distribution rows={data?.shifts||[]} kind="shift"/></Section>
      <Section icon="repair" title="วิธีแก้ที่ใช้บ่อย" sub="Action ที่ถูกบันทึกในช่วงที่เลือก"><RankBars rows={data?.actions||[]} valueKey="occurrences" secondaryKey="downtime_min" suffix=" ครั้ง" limit={10}/></Section>
      <Section icon="team" title="ภาระงานช่าง" sub="จำนวนงานที่ช่างรับผิดชอบ"><div className="tech-ranking">{!(data?.technicians||[]).length?<Empty title="ยังไม่มีข้อมูลช่าง"/>:(data.technicians||[]).map((r,i)=><div className="tech-rank-row" key={`${r.technician_code}-${i}`}><div className="tech-rank-no">{i+1}</div><div><b>{r.technician_name}</b><span className="mono">{r.technician_code}</span></div><div><b>{num(r.repair_count)} งาน</b><span>Downtime {num(r.downtime_min)} นาที · เฉลี่ย {num(r.avg_repair_min).toFixed(1)} นาที</span></div></div>)}</div></Section>
    </div>

    <Section icon="pm" title="PM / TPM Performance" sub="ดูผล PM ในช่วงเดียวกับ KPI"><div className="pm-kpi-grid"><div><span>แผนทั้งหมด</span><b>{pmSummary.total}</b></div><div><span>เสร็จแล้ว</span><b>{pmSummary.done}</b></div><div><span>ปกติ</span><b>{pmSummary.normal}</b></div><div><span>แก้ไขแล้ว</span><b>{pmSummary.corrected}</b></div><div className={pmSummary.issue?"pm-issue":""}><span>พบปัญหา</span><b>{pmSummary.issue}</b></div></div>{!pmData.length?<Empty title="ไม่มี PM ในช่วงที่เลือก"/>:<div className="table-wrap pm-kpi-table"><table className="table"><thead><tr><th>วันที่</th><th>เครื่อง</th><th>แผน PM</th><th>สถานะ</th><th>ผลรวม</th><th>เสร็จเมื่อ</th></tr></thead><tbody>{pmData.slice(0,40).map(r=><tr key={r.id}><td>{formatThaiDate(r.due_date)}</td><td><b className="mono">{r.machine_no_snapshot||"-"}</b><br/>{r.machine_name_snapshot||"-"}</td><td>{r.plan_title_snapshot||"-"}</td><td>{PM_STATUS[r.status]||r.status||"-"}</td><td><Badge value={r.overall_result}>{PM_LABEL[r.overall_result]||r.overall_result||"-"}</Badge></td><td>{r.completed_at?formatThaiDateTime(r.completed_at):"-"}</td></tr>)}</tbody></table></div>}</Section>

    <Section icon="report" title="รายการ Breakdown ล่าสุด" sub="ใช้ไล่ย้อนดูเหตุการณ์ที่ทำให้ KPI เปลี่ยน"><div className="table-wrap"><table className="table kpi-recent-table"><thead><tr><th>เวลา</th><th>เครื่อง</th><th>อาการ</th><th>สาเหตุ</th><th>Downtime</th><th>ช่าง</th><th>ผลหลังซ่อม</th></tr></thead><tbody>{!(data?.recent||[]).length?<tr><td colSpan="7"><Empty title="ไม่มี Breakdown ในช่วงที่เลือก"/></td></tr>:(data.recent||[]).map(r=><tr key={r.id}><td>{formatThaiDateTime(r.started_at)}</td><td><b className="mono">{r.machine_no_snapshot}</b><br/>{r.machine_name_snapshot}</td><td>{r.symptom}</td><td>{r.cause}</td><td><b className="mono">{num(r.loss_time_min)} m</b></td><td>{r.technician_name_snapshot}<br/><span className="mono muted-xs">{r.technician_code_snapshot||"-"}</span></td><td>{statusText(r.status)}</td></tr>)}</tbody></table></div></Section>
  </div>
}
