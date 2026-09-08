import React, { useEffect, useMemo, useState } from "react";
import { localDateISO, requireSupabase } from "../../core.js";
import { Empty, ErrorState, Icon, Loading, Modal } from "../components/UI.jsx";

const BUCKETS=[
  ["today","Today","วันนี้"],["follow_up","Follow-up","ติดตาม"],["waiting","Waiting For","รอผู้อื่น"],["improvement","Improvement","งานปรับปรุง"]
];
const PRIORITIES=[["P2","เร่งด่วน"],["P3","ตามแผน"],["P4","ปรับปรุง"]];
const PRIORITY_NAME={P1:"เร่งด่วน",P2:"เร่งด่วน",P3:"ตามแผน",P4:"ปรับปรุง"};
const blank=(bucket="today")=>({id:null,bucket,priority:"P3",title:"",details:"",department_id:"",machine_id:"",due_date:"",waiting_for:"",impact:"medium",effort:"medium",status:"open"});
function mondayISO(){const d=new Date(`${localDateISO()}T12:00:00+07:00`),day=d.getDay()||7;d.setDate(d.getDate()-day+1);return localDateISO(d)}
function labelMachine(m){return m?`${m.machine_no} · ${m.machine_name}`:"ไม่ผูกกับเครื่อง"}

export default function MyWorkspace({profile}){
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[tab,setTab]=useState("today"),[editor,setEditor]=useState(null),[msg,setMsg]=useState("");
  const [review,setReview]=useState({went_well:"",went_wrong:"",improve_next_week:"",top_priority_1:"",top_priority_2:"",top_priority_3:""});
  const [data,setData]=useState({tasks:[],departments:[],machines:[],ready:true,reviewReady:true});
  async function load(){
    setLoading(true);setError("");
    try{
      const sb=requireSupabase();
      const [d,m]=await Promise.all([
        sb.from("departments").select("id,dept_code,dept_name,sort_order,is_active").eq("is_active",true).order("sort_order"),
        sb.from("machines").select("id,department_id,machine_no,machine_name,is_active,criticality").eq("is_active",true).order("machine_no")
      ]);for(const q of [d,m])if(q.error)throw q.error;
      let tasks=[],ready=true,reviewReady=true;
      const t=await sb.from("manager_tasks").select("*").eq("owner_profile_id",profile.id).neq("status","cancelled").order("created_at",{ascending:false});
      if(t.error)ready=false;else tasks=t.data||[];
      let rv={};
      const w=await sb.from("manager_weekly_reviews").select("*").eq("owner_profile_id",profile.id).eq("week_start",mondayISO()).maybeSingle();
      if(w.error)reviewReady=false;else rv=w.data||{};
      setReview({went_well:rv.went_well||"",went_wrong:rv.went_wrong||"",improve_next_week:rv.improve_next_week||"",top_priority_1:rv.top_priority_1||"",top_priority_2:rv.top_priority_2||"",top_priority_3:rv.top_priority_3||""});
      setData({tasks,departments:d.data||[],machines:m.data||[],ready,reviewReady});
    }catch(e){setError(e.message||"โหลด My Workspace ไม่สำเร็จ")}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[profile.id]);

  const deptMap=useMemo(()=>Object.fromEntries(data.departments.map(x=>[x.id,x])),[data.departments]);
  const machineMap=useMemo(()=>Object.fromEntries(data.machines.map(x=>[x.id,x])),[data.machines]);
  const open=data.tasks.filter(t=>t.status==="open"),done=data.tasks.filter(t=>t.status==="done");
  const counts=Object.fromEntries(BUCKETS.map(([k])=>[k,open.filter(t=>t.bucket===k).length]));
  const overdue=open.filter(t=>t.due_date&&t.due_date<localDateISO()).length;
  const visible=(tab==="weekly"?[]:open.filter(t=>t.bucket===tab)).sort((a,b)=>a.priority.localeCompare(b.priority)||(a.due_date||"9999").localeCompare(b.due_date||"9999"));
  const machineOptions=editor?data.machines.filter(m=>!editor.department_id||m.department_id===editor.department_id):[];

  async function save(e){e.preventDefault();setMsg("");try{
    const sb=requireSupabase(),payload={owner_profile_id:profile.id,bucket:editor.bucket,priority:editor.priority,title:editor.title.trim(),details:editor.details.trim()||null,department_id:editor.department_id||null,machine_id:editor.machine_id||null,due_date:editor.due_date||null,waiting_for:editor.bucket==="waiting"?(editor.waiting_for.trim()||null):null,impact:editor.bucket==="improvement"?editor.impact:null,effort:editor.bucket==="improvement"?editor.effort:null,status:editor.status,updated_at:new Date().toISOString()};
    if(!payload.title)throw new Error("กรุณาระบุชื่องาน");
    const q=editor.id?sb.from("manager_tasks").update(payload).eq("id",editor.id):sb.from("manager_tasks").insert({...payload,created_at:new Date().toISOString()});const {error}=await q;if(error)throw error;setEditor(null);setMsg("บันทึกงานของฉันเรียบร้อย");await load();
  }catch(e){setMsg(e.message||"บันทึกไม่สำเร็จ")}}
  async function quick(id,status){setMsg("");try{const {error}=await requireSupabase().from("manager_tasks").update({status,completed_at:status==="done"?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq("id",id);if(error)throw error;await load()}catch(e){setMsg(e.message||"อัปเดตงานไม่สำเร็จ")}}
  async function saveReview(e){e.preventDefault();setMsg("");try{const {error}=await requireSupabase().from("manager_weekly_reviews").upsert({owner_profile_id:profile.id,week_start:mondayISO(),...review,updated_at:new Date().toISOString()},{onConflict:"owner_profile_id,week_start"});if(error)throw error;setMsg("บันทึก Weekly Review เรียบร้อย");await load()}catch(e){setMsg(e.message||"บันทึก Weekly Review ไม่สำเร็จ")}}

  if(loading)return <Loading text="กำลังโหลด My Workspace…"/>;
  if(error)return <ErrorState message={error} onRetry={load}/>;
  if(!data.ready)return <div className="stack my-work-root"><section className="cc-head"><div><span className="cc-eyebrow">PERSONAL MANAGEMENT</span><h1>My Workspace <small>งานของฉัน</small></h1></div></section><div className="migration-needed"><Icon name="warning" size={24}/><div><h3>ต้องติดตั้งฐานข้อมูล v2.28 ก่อน</h3><p>รัน migration <span className="mono">20260908_people_manager_workspace.sql</span> แล้วระบบส่วนตัวจะพร้อมใช้</p></div></div></div>;

  return <div className="stack my-work-root">
    <section className="cc-head my-work-head"><div><span className="cc-eyebrow">PERSONAL MANAGEMENT</span><h1>My Workspace <small>งานของฉัน</small></h1><p>เก็บสิ่งที่ต้องทำ ติดตาม รอ และ Improvement แยกจากงานของช่าง</p></div><div className="cc-actions"><button className="btn ghost" onClick={load}><Icon name="refresh" size={16}/>รีเฟรช</button>{tab!=="weekly"&&<button className="btn primary" onClick={()=>setEditor(blank(tab))}><Icon name="plus" size={16}/>เพิ่มงาน</button>}</div></section>

    <section className="my-kpi-grid">
      {BUCKETS.map(([k,en,th])=><button key={k} className={`my-kpi ${k} ${tab===k?"active":""}`} onClick={()=>setTab(k)}><span>{en}<small>{th}</small></span><b>{counts[k]||0}</b></button>)}
      <div className="my-kpi overdue"><span>Overdue<small>เกินกำหนด</small></span><b>{overdue}</b></div>
    </section>

    <div className="subnav modern-subnav my-subnav">{BUCKETS.map(([k,en,th])=><button key={k} className={tab===k?"active":""} onClick={()=>setTab(k)}>{en}<small>{th}</small></button>)}<button className={tab==="weekly"?"active":""} onClick={()=>setTab("weekly")}>Weekly Review<small>สรุปประจำสัปดาห์</small></button></div>
    {msg&&<div className={`notice ${msg.includes("เรียบร้อย")?"success":"danger"}`}>{msg}</div>}

    {tab!=="weekly"&&<section className="my-task-panel"><div className="my-task-panel-head"><div><h2>{BUCKETS.find(x=>x[0]===tab)?.[1]} <small>{BUCKETS.find(x=>x[0]===tab)?.[2]}</small></h2><p>{tab==="today"?"เลือกเรื่องสำคัญที่ต้องจบวันนี้":tab==="follow_up"?"สิ่งที่คุณต้องกลับไปตรวจและปิดประเด็น":tab==="waiting"?"งานที่ค้างอยู่กับ Purchasing / Supplier / Production / Manager":"Backlog สำหรับลดปัญหาและยกระดับเครื่องจักร"}</p></div></div>
      {visible.length?<div className="my-task-list">{visible.map(t=>{const dept=deptMap[t.department_id],m=machineMap[t.machine_id],isOver=t.due_date&&t.due_date<localDateISO();return <article className={`my-task-card ${t.priority} ${isOver?"is-overdue":""}`} key={t.id}>
        <button className="my-task-main" onClick={()=>setEditor({...blank(t.bucket),...t,department_id:t.department_id||"",machine_id:t.machine_id||"",waiting_for:t.waiting_for||"",details:t.details||""})}><div className="my-task-top"><span className={`cc-priority ${t.priority}`}>{PRIORITY_NAME[t.priority]||t.priority}</span><span>{dept?.dept_code||"MY"}</span></div><h3>{t.title}</h3>{m&&<p><Icon name="machine" size={14}/>{labelMachine(m)}</p>}<div className="my-task-meta"><span>{t.due_date?`${isOver?"เกินกำหนด · ":"Due · "}${t.due_date}`:"ไม่กำหนดวัน"}</span>{t.bucket==="waiting"&&t.waiting_for&&<span className="waiting-for">รอ: {t.waiting_for}</span>}{t.bucket==="improvement"&&<span>Impact {t.impact||"-"} · Effort {t.effort||"-"}</span>}</div></button><button className="my-done-btn" onClick={()=>quick(t.id,"done")}><Icon name="check" size={17}/><span>Done<small>เสร็จ</small></span></button>
      </article>})}</div>:<Empty title="ไม่มีงานในหมวดนี้" text="เพิ่มเฉพาะสิ่งที่คุณต้องติดตามเอง ไม่ต้องกรอกงานของช่างซ้ำ"/>}
      {done.filter(t=>t.bucket===tab).length>0&&<details className="done-history"><summary>Completed · เสร็จแล้ว ({done.filter(t=>t.bucket===tab).length})</summary><div>{done.filter(t=>t.bucket===tab).slice(0,20).map(t=><button key={t.id} onClick={()=>quick(t.id,"open")}><span>{t.title}</span><small>เปิดงานอีกครั้ง</small></button>)}</div></details>}
    </section>}

    {tab==="weekly"&&<section className="weekly-review-panel"><div className="weekly-review-head"><span>WEEK OF {mondayISO()}</span><h2>Weekly Manager Review <small>ทบทวนงานประจำสัปดาห์</small></h2><p>ใช้เวลา 5–10 นาที เพื่อสรุปสิ่งที่ดี ปัญหา และสิ่งที่ต้องปรับสัปดาห์หน้า</p></div>{!data.reviewReady?<div className="migration-needed compact"><Icon name="warning" size={20}/><div><h3>Weekly Review table ยังไม่พร้อม</h3></div></div>:<form onSubmit={saveReview} className="weekly-review-form"><div className="review-grid"><div className="review-box good"><label>What went well <small>อะไรที่ทำได้ดี</small></label><textarea value={review.went_well} onChange={e=>setReview(v=>({...v,went_well:e.target.value}))} placeholder="เช่น ปิดงานเร่งด่วนได้ภายในกะ / ทีมช่วยกันแก้ 850T"/></div><div className="review-box bad"><label>What went wrong <small>อะไรที่ยังมีปัญหา</small></label><textarea value={review.went_wrong} onChange={e=>setReview(v=>({...v,went_wrong:e.target.value}))} placeholder="เช่น รออะไหล่นาน / ปัญหาซ้ำ"/></div><div className="review-box improve"><label>Must improve next week <small>สัปดาห์หน้าต้องปรับอะไร</small></label><textarea value={review.improve_next_week} onChange={e=>setReview(v=>({...v,improve_next_week:e.target.value}))} placeholder="เช่น ทำ PM Critical A / ปิด RCA"/></div></div><div className="top-three"><h3>Top 3 Next Week <small>3 เรื่องสำคัญสัปดาห์หน้า</small></h3>{[1,2,3].map(i=><input key={i} className="input" value={review[`top_priority_${i}`]} onChange={e=>setReview(v=>({...v,[`top_priority_${i}`]:e.target.value}))} placeholder={`${i}. เรื่องสำคัญ`}/>)}</div><div className="weekly-actions"><button className="btn primary"><Icon name="save" size={16}/>บันทึก Weekly Review</button></div></form>}</section>}

    {editor&&<Modal title={editor.id?"Edit My Task · แก้ไขงาน":"New My Task · เพิ่มงานของฉัน"} onClose={()=>setEditor(null)}><form className="editor-form" onSubmit={save}><div className="field-grid cols-2"><div className="field"><label>หมวด</label><select className="select" value={editor.bucket} onChange={e=>setEditor(v=>({...v,bucket:e.target.value}))}>{BUCKETS.map(([k,en,th])=><option key={k} value={k}>{en} · {th}</option>)}</select></div><div className="field"><label>ระดับความสำคัญ</label><select className="select" value={editor.priority} onChange={e=>setEditor(v=>({...v,priority:e.target.value}))}>{PRIORITIES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div><div className="field full"><label>ชื่องาน</label><input className="input" required value={editor.title} onChange={e=>setEditor(v=>({...v,title:e.target.value}))} placeholder="เช่น Follow Servo quotation"/></div><div className="field"><label>แผนก (ถ้ามี)</label><select className="select" value={editor.department_id} onChange={e=>setEditor(v=>({...v,department_id:e.target.value,machine_id:""}))}><option value="">ส่วนตัว / ไม่ระบุ</option>{data.departments.map(d=><option key={d.id} value={d.id}>{d.dept_code} · {d.dept_name}</option>)}</select></div><div className="field"><label>เครื่องจักร (ถ้ามี)</label><select className="select" value={editor.machine_id} onChange={e=>setEditor(v=>({...v,machine_id:e.target.value}))}><option value="">ไม่ระบุเครื่อง</option>{machineOptions.map(m=><option key={m.id} value={m.id}>{m.machine_no} · {m.machine_name}</option>)}</select></div><div className="field"><label>Due Date · กำหนดเสร็จ</label><input className="input" type="date" value={editor.due_date||""} onChange={e=>setEditor(v=>({...v,due_date:e.target.value}))}/></div>{editor.bucket==="waiting"&&<div className="field"><label>Waiting For · รอใคร/อะไร</label><input className="input" value={editor.waiting_for||""} onChange={e=>setEditor(v=>({...v,waiting_for:e.target.value}))} placeholder="Purchasing / Supplier / Production"/></div>}{editor.bucket==="improvement"&&<><div className="field"><label>Impact · ผลกระทบ</label><select className="select" value={editor.impact} onChange={e=>setEditor(v=>({...v,impact:e.target.value}))}><option value="high">High · สูง</option><option value="medium">Medium · กลาง</option><option value="low">Low · ต่ำ</option></select></div><div className="field"><label>Effort · ความยาก</label><select className="select" value={editor.effort} onChange={e=>setEditor(v=>({...v,effort:e.target.value}))}><option value="low">Low · ง่าย</option><option value="medium">Medium · กลาง</option><option value="high">High · ยาก</option></select></div></>}<div className="field full"><label>รายละเอียด / Note</label><textarea className="textarea" value={editor.details||""} onChange={e=>setEditor(v=>({...v,details:e.target.value}))} placeholder="รายละเอียดที่คุณต้องจำหรือสิ่งที่ต้องติดตาม"/></div></div><div className="modal-form-actions"><button type="button" className="btn ghost" onClick={()=>setEditor(null)}>ยกเลิก</button><button className="btn primary">บันทึก</button></div></form></Modal>}
  </div>;
}
