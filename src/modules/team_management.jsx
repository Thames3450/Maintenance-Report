import React, { useEffect, useMemo, useState } from "react";
import { localDateISO, requireSupabase } from "../../core.js";
import { Empty, ErrorState, Icon, Loading, Modal } from "../components/UI.jsx";

const POINTS={P1:3,P2:3,P3:2,P4:1};
const LEVEL_TEXT=["ยังทำไม่ได้","ต้องมีคนสอน","ทำได้โดยมีคนช่วย","ทำเองได้","แก้ปัญหาได้ดี","สอนคนอื่นได้"];
function n(v){const x=Number(v);return Number.isFinite(x)?x:0}
function initials(name=""){return String(name).trim().slice(0,1)||"?"}
function monthStart(){const d=localDateISO();return `${d.slice(0,7)}-01T00:00:00+07:00`}

export default function TeamManagement(){
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[scope,setScope]=useState("all"),[tab,setTab]=useState("overview");
  const [selected,setSelected]=useState(null),[skillEditor,setSkillEditor]=useState(null),[msg,setMsg]=useState("");
  const [data,setData]=useState({departments:[],profiles:[],tasks:[],repairs:[],skills:[],techSkills:[],skillReady:true});

  async function load(){
    setLoading(true);setError("");
    try{
      const sb=requireSupabase();
      const [d,p,t,r]=await Promise.all([
        sb.from("departments").select("id,dept_code,dept_name,sort_order,is_active").eq("is_active",true).order("sort_order"),
        sb.from("app_profiles").select("id,department_id,full_name,employee_code,shift,position,photo_path,role,is_active").eq("role","technician").eq("is_active",true).order("full_name"),
        sb.from("maintenance_tasks").select("id,department_id,machine_id,title,priority,status,assigned_to,due_date,completed_at,created_at").neq("status","cancelled").order("created_at",{ascending:false}).limit(1000),
        sb.from("repair_reports").select("id,department_id,technician_id,technician_name_snapshot,status,loss_time_min,started_at").is("deleted_at",null).gte("started_at",monthStart()).limit(2000)
      ]);
      for(const q of [d,p,t,r])if(q.error)throw q.error;
      let skills=[],techSkills=[],skillReady=true;
      const s=await sb.from("skill_catalog").select("id,skill_code,skill_name_en,skill_name_th,sort_order,is_active").eq("is_active",true).order("sort_order");
      if(s.error){skillReady=false}else{
        skills=s.data||[];
        const ts=await sb.from("technician_skills").select("profile_id,skill_id,skill_level,note,assessed_at");
        if(ts.error)skillReady=false;else techSkills=ts.data||[];
      }
      setData({departments:d.data||[],profiles:p.data||[],tasks:t.data||[],repairs:r.data||[],skills,techSkills,skillReady});
    }catch(e){setError(e.message||"โหลดข้อมูลทีมช่างไม่สำเร็จ")}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);

  const deptMap=useMemo(()=>Object.fromEntries(data.departments.map(x=>[x.id,x])),[data.departments]);
  const inScope=(x)=>scope==="all"||x.department_id===scope;
  const profiles=data.profiles.filter(inScope),tasks=data.tasks.filter(inScope),repairs=data.repairs.filter(inScope);
  const activeTasks=tasks.filter(t=>!["completed","cancelled"].includes(t.status));
  const skillMap=useMemo(()=>{const m=new Map();for(const x of data.techSkills)m.set(`${x.profile_id}:${x.skill_id}`,x);return m},[data.techSkills]);

  const personStats=useMemo(()=>Object.fromEntries(profiles.map(p=>{
    const pt=activeTasks.filter(t=>t.assigned_to===p.id),allTasks=tasks.filter(t=>t.assigned_to===p.id),pr=repairs.filter(r=>r.technician_id===p.id);
    const workload=pt.reduce((s,t)=>s+(POINTS[t.priority]||1),0),urgent=pt.filter(t=>["P1","P2"].includes(t.priority)).length;
    const completed=allTasks.filter(t=>t.status==="completed").length,follow=pr.filter(r=>["follow_up","no_parts"].includes(r.status)).length;
    const levels=data.skills.map(s=>n(skillMap.get(`${p.id}:${s.id}`)?.skill_level)).filter(v=>v>0);
    return [p.id,{active:pt.length,workload,urgent,completed,repairs:pr.length,follow,avgSkill:levels.length?levels.reduce((a,b)=>a+b,0)/levels.length:0}]
  })),[profiles,activeTasks,tasks,repairs,data.skills,skillMap]);

  const working=profiles.filter(p=>personStats[p.id]?.active>0).length,available=Math.max(0,profiles.length-working),urgentPeople=profiles.filter(p=>personStats[p.id]?.urgent>0).length;
  const sortedWorkload=[...profiles].sort((a,b)=>(personStats[b.id]?.workload||0)-(personStats[a.id]?.workload||0));
  const maxWork=Math.max(1,...sortedWorkload.map(p=>personStats[p.id]?.workload||0));

  async function saveSkill(e){
    e.preventDefault();setMsg("");
    try{
      const sb=requireSupabase(),payload={profile_id:skillEditor.profile.id,skill_id:skillEditor.skill.id,skill_level:Number(skillEditor.level),note:skillEditor.note.trim()||null,assessed_at:new Date().toISOString()};
      const {error}=await sb.from("technician_skills").upsert(payload,{onConflict:"profile_id,skill_id"});if(error)throw error;
      setSkillEditor(null);setMsg("บันทึก Skill เรียบร้อย");await load();
    }catch(e){setMsg(e.message||"บันทึก Skill ไม่สำเร็จ")}
  }

  if(loading)return <Loading text="กำลังโหลด Team Management…"/>;
  if(error)return <ErrorState message={error} onRetry={load}/>;
  return <div className="stack people-root">
    <section className="cc-head people-head"><div><span className="cc-eyebrow">PEOPLE & CAPABILITY</span><h1>Team Management <small>จัดการทีมช่าง</small></h1><p>ดูภาระงาน ความถนัด และการพัฒนาทีมจากข้อมูลจริง</p></div><button className="btn ghost" onClick={load}><Icon name="refresh" size={16}/>รีเฟรช</button></section>

    <div className="cc-scope-tabs people-scope"><button className={scope==="all"?"active":""} onClick={()=>setScope("all")}>ทุกแผนก</button>{data.departments.map(d=><button key={d.id} className={scope===d.id?"active":""} onClick={()=>setScope(d.id)}>{d.dept_code}</button>)}</div>

    <section className="people-kpis">
      <div className="people-kpi"><span>Team Members<small>ช่างทั้งหมด</small></span><b>{profiles.length}</b></div>
      <div className="people-kpi blue"><span>Working<small>กำลังรับงาน</small></span><b>{working}</b></div>
      <div className="people-kpi green"><span>Available<small>ยังไม่มีงานมอบหมาย</small></span><b>{available}</b></div>
      <div className="people-kpi red"><span>งานเร่งด่วน<small>คนที่รับงานเร่งด่วน</small></span><b>{urgentPeople}</b></div>
    </section>

    <div className="subnav modern-subnav">
      <button className={tab==="overview"?"active":""} onClick={()=>setTab("overview")}>Team Overview <small>ภาพรวมทีม</small></button>
      <button className={tab==="skills"?"active":""} onClick={()=>setTab("skills")}>Skill Matrix <small>ตารางทักษะ</small></button>
      <button className={tab==="workload"?"active":""} onClick={()=>setTab("workload")}>Workload <small>ภาระงาน</small></button>
    </div>
    {msg&&<div className={`notice ${msg.includes("เรียบร้อย")?"success":"danger"}`}>{msg}</div>}

    {tab==="overview"&&<section className="people-card-grid">{profiles.length?profiles.map(p=>{const s=personStats[p.id]||{};return <button className="person-card" key={p.id} onClick={()=>setSelected(p)}>
      <div className="person-card-head"><div className="person-avatar">{initials(p.full_name)}</div><div className="person-id"><h3>{p.full_name}</h3><p>{p.employee_code||"-"} · {deptMap[p.department_id]?.dept_code||"-"} · Shift {p.shift||"-"}</p></div><span className={`person-status ${s.active?"working":"available"}`}>{s.active?"กำลังทำงาน":"พร้อมรับงาน"}</span></div>
      <div className="person-metrics"><span><b>{s.active||0}</b><small>Active Jobs<br/>งานปัจจุบัน</small></span><span><b>{s.workload||0}</b><small>Workload<br/>คะแนนภาระ</small></span><span><b>{s.repair||s.repairs||0}</b><small>Repairs<br/>ซ่อมเดือนนี้</small></span><span><b>{s.avgSkill? s.avgSkill.toFixed(1):"-"}</b><small>Avg Skill<br/>ทักษะเฉลี่ย</small></span></div>
      {s.urgent>0&&<div className="person-urgent"><Icon name="warning" size={14}/>ถือ “งานเร่งด่วน” อยู่ {s.urgent} งาน</div>}
    </button>}):<Empty title="ยังไม่มีช่างในขอบเขตนี้"/>}</section>}

    {tab==="skills"&&<section className="matrix-panel">
      {!data.skillReady?<div className="migration-needed compact"><Icon name="warning" size={22}/><div><h3>ยังไม่พบฐานข้อมูล Skill Matrix</h3><p>รัน migration ของ v2.28 แล้วหน้านี้จะเปิดใช้การให้ระดับ 0–5 ได้ทันที</p></div></div>:<>
      <div className="matrix-help"><b>ระดับ 0–5</b><span>0 ยังทำไม่ได้ · 3 ทำเองได้ · 5 สอนคนอื่นได้</span></div>
      <div className="matrix-wrap"><table className="skill-matrix"><thead><tr><th>Technician <small>ช่าง</small></th>{data.skills.map(s=><th key={s.id}>{s.skill_name_en}<small>{s.skill_name_th}</small></th>)}</tr></thead><tbody>{profiles.map(p=><tr key={p.id}><th><b>{p.full_name}</b><small>{deptMap[p.department_id]?.dept_code||"-"} · {p.shift||"-"}</small></th>{data.skills.map(s=>{const row=skillMap.get(`${p.id}:${s.id}`),level=n(row?.skill_level);return <td key={s.id}><button className={`skill-level l${level}`} title={`${LEVEL_TEXT[level]}${row?.note?` · ${row.note}`:""}`} onClick={()=>setSkillEditor({profile:p,skill:s,level,note:row?.note||""})}>{level}</button></td>})}</tr>)}</tbody></table></div></>}
    </section>}

    {tab==="workload"&&<section className="workload-panel"><div className="workload-head"><div><h2>Technician Workload</h2><p>คำนวณ เร่งด่วน=3 · ตามแผน=2 · ปรับปรุง=1 เพื่อไม่ให้จำนวนงานหลอกตา</p></div></div><div className="workload-list">{sortedWorkload.map(p=>{const s=personStats[p.id]||{};return <button className="workload-row" key={p.id} onClick={()=>setSelected(p)}><div className="workload-person"><div className="mini-avatar">{initials(p.full_name)}</div><span><b>{p.full_name}</b><small>{deptMap[p.department_id]?.dept_code||"-"} · Shift {p.shift||"-"}</small></span></div><div className="workload-track"><i style={{width:`${Math.max(3,(s.workload||0)/maxWork*100)}%`}}/></div><div className="workload-score"><b>{s.workload||0}</b><small>{s.active||0} Jobs</small></div></button>})}</div></section>}

    {selected&&(()=>{const p=selected,s=personStats[p.id]||{},pt=activeTasks.filter(t=>t.assigned_to===p.id),pr=repairs.filter(r=>r.technician_id===p.id),topSkills=data.skills.map(sk=>({sk,row:skillMap.get(`${p.id}:${sk.id}`)})).filter(x=>n(x.row?.skill_level)>0).sort((a,b)=>n(b.row?.skill_level)-n(a.row?.skill_level));return <Modal title="Technician Profile · โปรไฟล์ช่าง" onClose={()=>setSelected(null)}><div className="tech-profile">
      <div className="tech-profile-hero"><div className="person-avatar big">{initials(p.full_name)}</div><div><h2>{p.full_name}</h2><p>{p.employee_code||"-"} · {deptMap[p.department_id]?.dept_code||"-"} · Shift {p.shift||"-"}</p><small>{p.position||"ช่างเทคนิค"}</small></div><span className={`person-status ${s.active?"working":"available"}`}>{s.active?"กำลังรับงาน":"พร้อมรับงาน"}</span></div>
      <div className="profile-stat-grid"><span><b>{s.active||0}</b><small>Active Jobs<br/>งานค้าง</small></span><span><b>{s.urgent||0}</b><small>เร่งด่วน<br/>Urgent</small></span><span><b>{s.repairs||0}</b><small>Repairs<br/>เดือนนี้</small></span><span><b>{s.follow||0}</b><small>Follow-up<br/>ต้องติดตาม</small></span></div>
      <section className="profile-section"><h3>Current Assignment <small>งานที่รับผิดชอบตอนนี้</small></h3>{pt.length?<div className="profile-task-list">{pt.map(t=><div key={t.id}><span className={`cc-priority ${t.priority}`}>{t.priority}</span><b>{t.title}</b><small>{t.status} · {t.due_date||"ไม่กำหนดวัน"}</small></div>)}</div>:<p className="profile-empty">ยังไม่มีงานที่มอบหมายค้าง</p>}</section>
      <section className="profile-section"><h3>Top Skills <small>ทักษะเด่น</small></h3>{data.skillReady&&topSkills.length?<div className="skill-chip-list">{topSkills.map(({sk,row})=><span key={sk.id}><b>{sk.skill_name_en}</b><i>Lv.{row.skill_level}</i><small>{sk.skill_name_th}</small></span>)}</div>:<p className="profile-empty">ยังไม่มีการประเมิน Skill</p>}</section>
    </div></Modal>})()}

    {skillEditor&&<Modal title={`${skillEditor.skill.skill_name_en} · ${skillEditor.skill.skill_name_th}`} onClose={()=>setSkillEditor(null)}><form className="editor-form skill-editor" onSubmit={saveSkill}><div className="field"><label>ช่าง</label><div className="readonly-field">{skillEditor.profile.full_name}</div></div><div className="field"><label>Skill Level · ระดับทักษะ</label><div className="level-picker">{LEVEL_TEXT.map((x,i)=><button type="button" key={i} className={Number(skillEditor.level)===i?"active":""} onClick={()=>setSkillEditor(v=>({...v,level:i}))}><b>{i}</b><small>{x}</small></button>)}</div></div><div className="field"><label>หมายเหตุ</label><textarea className="textarea" value={skillEditor.note} onChange={e=>setSkillEditor(v=>({...v,note:e.target.value}))} placeholder="เช่น ทำ PLC ได้เองแต่ยังต้องฝึก Servo Diagnosis"/></div><div className="modal-form-actions"><button type="button" className="btn ghost" onClick={()=>setSkillEditor(null)}>ยกเลิก</button><button className="btn primary">บันทึก Skill</button></div></form></Modal>}
  </div>;
}
