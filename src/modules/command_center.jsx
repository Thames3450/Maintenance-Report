import React, { useEffect, useMemo, useState } from "react";
import { formatThaiDate, localDateISO, localDayStartUTC, localNextDayStartUTC, requireSupabase } from "../../core.js";
import { Empty, ErrorState, Icon, Loading } from "../components/UI.jsx";

function n(v){const x=Number(v);return Number.isFinite(x)?x:0}
function deptCode(d){return d?.dept_code||"-"}
function machineLabel(m){return m?`${m.machine_no||"-"} · ${m.machine_name||"ไม่ระบุ"}`:"ไม่ระบุเครื่อง"}
function todayThai(){return formatThaiDate(new Date(),{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
function criticalityCode(v){const x=String(v||"").trim().toUpperCase();if(["A","HIGH"].includes(x))return "A";if(["B","MEDIUM"].includes(x))return "B";if(["C","LOW"].includes(x))return "C";return ""}

export default function CommandCenter({profile,go}){
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[scope,setScope]=useState("all");
  const [data,setData]=useState({departments:[],machines:[],profiles:[],repairsToday:[],repairsMonth:[],openRepairs:[],pmToday:[],pmSoon:[],tasks:[],taskTableReady:true,managerTasks:[],managerReady:true,spareRequests:[],spareReady:true});

  async function load(){
    setLoading(true);setError("");
    try{
      const sb=requireSupabase(),today=localDateISO(),dayStart=localDayStartUTC(today),nextDay=localNextDayStartUTC(today),monthStart=`${today.slice(0,7)}-01`;
      const soon=new Date(`${today}T12:00:00+07:00`);soon.setDate(soon.getDate()+7);const soonISO=localDateISO(soon);
      const baseRepair="id,department_id,machine_id,machine_no_snapshot,machine_name_snapshot,technician_name_snapshot,symptom,severity,status,loss_time_min,started_at,finished_at";
      const [d,m,p,rt,rm,ro,pt,ps]=await Promise.all([
        sb.from("departments").select("id,dept_code,dept_name,is_active,sort_order").eq("is_active",true).order("sort_order"),
        sb.from("machines").select("id,department_id,machine_no,machine_name,criticality,is_active").eq("is_active",true).order("machine_no"),
        sb.from("app_profiles").select("id,department_id,full_name,employee_code,shift,role,is_active").eq("role","technician").eq("is_active",true).order("full_name"),
        sb.from("repair_reports").select(baseRepair).is("deleted_at",null).gte("started_at",dayStart).lt("started_at",nextDay).order("started_at",{ascending:false}),
        sb.from("repair_reports").select(baseRepair).is("deleted_at",null).gte("started_at",`${monthStart}T00:00:00+07:00`).order("started_at",{ascending:false}),
        sb.from("repair_reports").select(baseRepair).is("deleted_at",null).in("status",["follow_up","no_parts"]).order("started_at",{ascending:false}).limit(120),
        sb.from("pm_schedule").select("id,department_id,machine_id,plan_title_snapshot,machine_no_snapshot,machine_name_snapshot,status,due_date,overall_result,assignee_name_snapshot").eq("due_date",today),
        sb.from("pm_schedule").select("id,department_id,machine_id,plan_title_snapshot,machine_no_snapshot,machine_name_snapshot,status,due_date,overall_result,assignee_name_snapshot").gte("due_date",today).lte("due_date",soonISO).eq("status","planned").order("due_date").limit(100)
      ]);
      for(const q of [d,m,p,rt,rm,ro,pt,ps])if(q.error)throw q.error;
      let tasks=[],taskTableReady=true,managerTasks=[],managerReady=true,spareRequests=[],spareReady=true;
      const tq=await sb.from("maintenance_tasks").select("id,department_id,machine_id,title,details,task_type,priority,status,assigned_to,due_date,waiting_reason,created_at").neq("status","cancelled").order("created_at",{ascending:false}).limit(300);
      if(tq.error){taskTableReady=false}else tasks=tq.data||[];
      const mq=await sb.from("manager_tasks").select("id,bucket,priority,status,due_date").eq("owner_profile_id",profile.id).neq("status","cancelled").limit(300);
      if(mq.error){managerReady=false}else managerTasks=mq.data||[];
      const sq=await sb.from("spare_requests").select("id,department_id,status,urgency,created_at").neq("status","closed").limit(500);
      if(sq.error){spareReady=false}else spareRequests=sq.data||[];
      setData({departments:d.data||[],machines:m.data||[],profiles:p.data||[],repairsToday:rt.data||[],repairsMonth:rm.data||[],openRepairs:ro.data||[],pmToday:pt.data||[],pmSoon:ps.data||[],tasks,taskTableReady,managerTasks,managerReady,spareRequests,spareReady});
    }catch(e){setError(e.message||"โหลด Maintenance Command Center ไม่สำเร็จ")}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);

  const deptMap=useMemo(()=>Object.fromEntries(data.departments.map(x=>[x.id,x])),[data.departments]);
  const machineMap=useMemo(()=>Object.fromEntries(data.machines.map(x=>[x.id,x])),[data.machines]);
  const inScope=(x)=>scope==="all"||x.department_id===scope;
  const repairsToday=data.repairsToday.filter(inScope),repairsMonth=data.repairsMonth.filter(inScope),openRepairs=data.openRepairs.filter(inScope),pmToday=data.pmToday.filter(inScope),pmSoon=data.pmSoon.filter(inScope),tasks=data.tasks.filter(inScope),profiles=data.profiles.filter(inScope),machines=data.machines.filter(inScope),spareRequests=data.spareRequests.filter(inScope);
  const activeTasks=tasks.filter(x=>!["completed","cancelled"].includes(x.status));
  const lossToday=repairsToday.reduce((s,x)=>s+n(x.loss_time_min),0);
  const waitParts=openRepairs.filter(x=>x.status==="no_parts");
  const followUps=openRepairs.filter(x=>x.status==="follow_up");
  const urgent=activeTasks.filter(x=>["P1","P2"].includes(x.priority));
  const pmCompleted=pmToday.filter(x=>x.status==="completed").length;
  const pmRate=pmToday.length?Math.round(pmCompleted/pmToday.length*100):0;

  const criticality=useMemo(()=>({
    A:machines.filter(x=>criticalityCode(x.criticality)==="A").length,
    B:machines.filter(x=>criticalityCode(x.criticality)==="B").length,
    C:machines.filter(x=>criticalityCode(x.criticality)==="C").length,
    unclassified:machines.filter(x=>!criticalityCode(x.criticality)).length
  }),[machines]);

  const monthStats=useMemo(()=>{
    const map=new Map();
    for(const r of repairsMonth){
      const key=r.machine_id||`${r.machine_no_snapshot}|${r.machine_name_snapshot}`;
      const old=map.get(key)||{machine_id:r.machine_id,no:r.machine_no_snapshot,name:r.machine_name_snapshot,loss:0,count:0};
      old.loss+=n(r.loss_time_min);old.count++;map.set(key,old);
    }
    return map;
  },[repairsMonth]);

  const topLoss=useMemo(()=>[...monthStats.values()].sort((a,b)=>b.loss-a.loss||b.count-a.count).slice(0,6),[monthStats]);
  const maxLoss=Math.max(1,...topLoss.map(x=>x.loss));

  const criticalRisk=useMemo(()=>machines
    .filter(m=>criticalityCode(m.criticality)==="A")
    .map(m=>({m,stat:monthStats.get(m.id)||{loss:0,count:0},open:openRepairs.filter(r=>r.machine_id===m.id).length}))
    .filter(x=>x.stat.loss>0||x.stat.count>0||x.open>0)
    .sort((a,b)=>b.open-a.open||b.stat.loss-a.stat.loss||b.stat.count-a.stat.count)
    .slice(0,6),[machines,monthStats,openRepairs]);

  const alerts=useMemo(()=>{
    const rows=openRepairs.map(r=>({type:"repair",priority:r.severity==="high"?"P1":"P2",title:machineLabel(machineMap[r.machine_id]||{machine_no:r.machine_no_snapshot,machine_name:r.machine_name_snapshot}),sub:r.status==="no_parts"?"รออะไหล่":"ต้องติดตามงานซ่อม",dept:deptCode(deptMap[r.department_id]),loss:n(r.loss_time_min)}));
    const taskRows=activeTasks.filter(t=>["P1","P2"].includes(t.priority)).map(t=>({type:"task",priority:t.priority,title:machineLabel(machineMap[t.machine_id]),sub:t.title,dept:deptCode(deptMap[t.department_id]),loss:0}));
    return [...taskRows,...rows].slice(0,8);
  },[openRepairs,activeTasks,machineMap,deptMap]);

  if(loading)return <Loading text="กำลังโหลด Command Center…"/>;
  if(error)return <ErrorState message={error} onRetry={load}/>;
  return <div className="stack command-center-root executive-command-center">
    <section className="cc-head executive-head">
      <div><span className="cc-eyebrow">EXECUTIVE MAINTENANCE VIEW</span><h1>Maintenance Command Center</h1><p>{todayThai()} · ภาพรวมสำหรับหัวหน้างานจากข้อมูล Supabase แบบ Live</p></div>
      <div className="cc-actions"><button className="btn ghost" onClick={load}><Icon name="refresh" size={16}/>รีเฟรช</button><button className="btn primary" onClick={()=>go("work")}><Icon name="plus" size={16}/>สร้างงาน</button></div>
    </section>

    <div className="cc-scope-tabs executive-scope"><button className={scope==="all"?"active":""} onClick={()=>setScope("all")}>ทุกแผนก</button>{data.departments.map(d=><button key={d.id} className={scope===d.id?"active":""} onClick={()=>setScope(d.id)}>{d.dept_code}</button>)}</div>

    <section className="exec-primary-grid">
      <div className="exec-primary-card"><div className="exec-card-icon"><Icon name="repair" size={20}/></div><div><span>Breakdown วันนี้</span><b>{repairsToday.length}</b><small>เหตุการณ์ซ่อมที่บันทึกวันนี้</small></div></div>
      <div className="exec-primary-card"><div className="exec-card-icon"><Icon name="clock" size={20}/></div><div><span>Loss Time วันนี้</span><b>{lossToday.toLocaleString("th-TH")} <em>min</em></b><small>เวลาสูญเสียรวมจาก Breakdown</small></div></div>
      <div className={`exec-primary-card ${urgent.length?"danger":""}`}><div className="exec-card-icon"><Icon name="warning" size={20}/></div><div><span>งานเร่งด่วน</span><b>{urgent.length}</b><small>งานที่ควรจัดลำดับก่อน</small></div></div>
      <div className="exec-primary-card"><div className="exec-card-icon"><Icon name="pm" size={20}/></div><div><span>PM วันนี้</span><b>{pmCompleted}/{pmToday.length}</b><small>{pmToday.length?`${pmRate}% Complete`:`ใกล้กำหนด 7 วัน ${pmSoon.length}`}</small></div></div>
    </section>

    <section className="attention-strip">
      <div className="attention-card waiting"><span>รออะไหล่</span><b>{waitParts.length}</b><small>Repair Status: no_parts</small></div>
      <div className="attention-card follow"><span>ต้องติดตาม</span><b>{followUps.length}</b><small>Repair Status: follow_up</small></div>
      <div className="attention-card task"><span>งานมอบหมายค้าง</span><b>{activeTasks.length}</b><small>Work Board ยังไม่ Completed</small></div>
      <div className="attention-card critical"><span>Critical A</span><b>{criticality.A}</b><small>เครื่องสำคัญต่อ Production</small></div>
    </section>

    <section className="manager-bridge-grid">
      <button className="manager-bridge-card spare" onClick={()=>go("spare")}><span className="manager-bridge-icon"><Icon name="spare" size={20}/></span><span><b>Spare Requests</b><small>อะไหล่ · ใหม่ {spareRequests.filter(x=>x.status==="new").length} · พร้อมรวบรวม {spareRequests.filter(x=>x.status==="ready").length} · ติดตาม {spareRequests.filter(x=>x.status==="follow_up").length}</small></span><Icon name="chevron" size={17}/></button>
      <button className="manager-bridge-card team" onClick={()=>go("team")}><span className="manager-bridge-icon"><Icon name="team" size={20}/></span><span><b>Team Management</b><small>จัดการทีมช่าง · {profiles.length} คน · Active {new Set(activeTasks.map(t=>t.assigned_to).filter(Boolean)).size}</small></span><Icon name="chevron" size={17}/></button>
      <button className="manager-bridge-card mine" onClick={()=>go("mywork")}><span className="manager-bridge-icon"><Icon name="user" size={20}/></span><span><b>My Workspace</b><small>งานของฉัน · Today {data.managerTasks.filter(t=>t.status==="open"&&t.bucket==="today").length} · Waiting {data.managerTasks.filter(t=>t.status==="open"&&t.bucket==="waiting").length}</small></span><Icon name="chevron" size={17}/></button>
    </section>

    {!data.taskTableReady&&<div className="cc-info"><Icon name="warning" size={18}/><div><b>Work Board ยังเชื่อม maintenance_tasks ไม่สำเร็จ</b><span>ตรวจสอบ migration และ RLS ก่อนใช้งานการมอบหมายงาน</span></div></div>}

    <div className="cc-layout executive-main-layout">
      <section className="cc-panel cc-alert-panel executive-panel"><div className="cc-panel-head"><div><span className="cc-eyebrow">PRIORITY NOW</span><h2>รายการที่ต้องตัดสินใจตอนนี้</h2><p>รวมงานเร่งด่วน งานรออะไหล่ และงานที่ต้องติดตาม</p></div><button onClick={()=>go("work")}>เปิด Work Board →</button></div>
        {!alerts.length?<Empty title="ไม่มีรายการเร่งด่วน" text="สถานะปัจจุบันไม่มีงานเร่งด่วนหรือ Repair ที่ต้องติดตามในขอบเขตนี้"/>:<div className="cc-alert-list">{alerts.map((a,i)=><div className="cc-alert-row" key={`${a.type}-${i}`}><span className={`cc-priority ${a.priority}`}>เร่งด่วน</span><div><b>{a.title}</b><p>{a.sub}</p><small>{a.dept}{a.loss?` · Loss ${a.loss.toLocaleString("th-TH")} นาที`:""}</small></div><Icon name="chevron" size={18}/></div>)}</div>}
      </section>

      <section className="cc-panel executive-panel"><div className="cc-panel-head"><div><span className="cc-eyebrow">TOP LOSS</span><h2>เครื่องที่เสียเวลาสูงสุดเดือนนี้</h2><p>จัดอันดับจาก Loss Time และจำนวน Breakdown</p></div><button onClick={()=>go("kpi")}>ดู KPI →</button></div>
        {!topLoss.length?<Empty title="ยังไม่มี Loss Time เดือนนี้"/>:<div className="cc-loss-list">{topLoss.map((r,i)=><div className="cc-loss-row" key={`${r.machine_id||r.no}-${i}`}><span className="cc-rank">{String(i+1).padStart(2,"0")}</span><div className="cc-loss-copy"><div><b>{r.no||"-"}</b><span>{r.name||"ไม่ระบุ"}</span></div><div className="cc-loss-track"><i style={{width:`${Math.max(5,r.loss/maxLoss*100)}%`}}/></div></div><div className="cc-loss-value"><b>{r.loss.toLocaleString("th-TH")}</b><span>min · {r.count} ครั้ง</span></div></div>)}</div>}
      </section>
    </div>

    <section className="cc-panel executive-panel criticality-panel">
      <div className="cc-panel-head"><div><span className="cc-eyebrow">CRITICALITY & RISK</span><h2>Criticality A / B / C</h2><p>A = Production Stop · B = Production Impact · C = General / Support</p></div><button onClick={()=>go("admin")}>จัดการเครื่อง →</button></div>
      <div className="criticality-layout">
        <div className="criticality-summary-grid">
          <div className="criticality-summary-card A"><span>A</span><div><b>{criticality.A}</b><small>Production Stop</small></div></div>
          <div className="criticality-summary-card B"><span>B</span><div><b>{criticality.B}</b><small>Production Impact</small></div></div>
          <div className="criticality-summary-card C"><span>C</span><div><b>{criticality.C}</b><small>General / Support</small></div></div>
          {criticality.unclassified>0&&<div className="criticality-unclassified"><b>{criticality.unclassified}</b><span>เครื่องยังไม่จัดระดับ</span></div>}
        </div>
        <div className="critical-risk-list"><div className="critical-risk-title"><b>Critical A ที่ควรเฝ้าระวัง</b><span>อิง Breakdown / Loss Time เดือนนี้</span></div>{!criticalRisk.length?<div className="critical-risk-empty">ยังไม่มี Critical A ที่มี Breakdown หรือ Follow-up เดือนนี้</div>:criticalRisk.map(({m,stat,open},i)=><div className="critical-risk-row" key={m.id}><span className="critical-risk-rank">{i+1}</span><div><b>{m.machine_no}</b><small>{m.machine_name}</small></div><div className="critical-risk-metrics"><span>{stat.count} ครั้ง</span><b>{stat.loss.toLocaleString("th-TH")} min</b>{open>0&&<em>{open} follow-up</em>}</div></div>)}</div>
      </div>
    </section>

    <section className="cc-panel executive-panel"><div className="cc-panel-head"><div><span className="cc-eyebrow">DEPARTMENT PULSE</span><h2>สถานะแต่ละแผนก</h2><p>แตะการ์ดเพื่อกรอง Command Center เฉพาะแผนก</p></div></div>
      <div className="cc-dept-grid">{data.departments.map(d=>{const dr=data.repairsToday.filter(x=>x.department_id===d.id),dt=data.tasks.filter(x=>x.department_id===d.id&&!['completed','cancelled'].includes(x.status)),dp=data.profiles.filter(x=>x.department_id===d.id),dm=data.machines.filter(x=>x.department_id===d.id),da=dm.filter(x=>criticalityCode(x.criticality)==='A').length;return <button key={d.id} className={`cc-dept-card ${scope===d.id?"selected":""}`} onClick={()=>setScope(d.id)}><div><span>{d.dept_code}</span><small>{d.dept_name}</small></div><b>{dr.reduce((s,x)=>s+n(x.loss_time_min),0).toLocaleString("th-TH")} <em>min</em></b><div className="cc-dept-meta"><span>{dr.length} Breakdown</span><span>{dt.length} Tasks</span><span>{dp.length} Tech</span><span>{da} Critical A</span></div></button>})}</div>
    </section>

    <section className="cc-shortcuts executive-shortcuts"><button onClick={()=>go("repair")}><Icon name="report"/><span><b>Repair Reports</b><small>ประวัติและงานติดตาม</small></span><Icon name="chevron"/></button><button onClick={()=>go("work")}><Icon name="checklist"/><span><b>Work Board</b><small>มอบหมายและติดตามงาน</small></span><Icon name="chevron"/></button><button onClick={()=>go("kpi")}><Icon name="kpi"/><span><b>KPI Analytics</b><small>MTBF · MTTR · Availability</small></span><Icon name="chevron"/></button><button onClick={()=>go("admin")}><Icon name="admin"/><span><b>System Settings</b><small>Criticality · เครื่อง · คน · PM</small></span><Icon name="chevron"/></button></section>
  </div>;
}
