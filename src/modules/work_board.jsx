import React,{useEffect,useMemo,useState} from "react";
import {localDateISO,requireSupabase} from "../../core.js";
import {Empty,ErrorState,Icon,Loading,Modal,SearchSelect} from "../components/UI.jsx";
import {dispatchMaintenanceNotification} from "../notifications.js";

const STATUSES=[["new","งานใหม่"],["assigned","มอบหมายแล้ว"],["working","กำลังทำ"],["waiting","รอติดตาม"],["completed","เสร็จแล้ว"]];
const PRIORITIES=[["P2","เร่งด่วน · Urgent"],["P3","ตามแผน · Planned"],["P4","ปรับปรุง · Improvement"]];
const PRIORITY_NAME={P1:"เร่งด่วน",P2:"เร่งด่วน",P3:"ตามแผน",P4:"ปรับปรุง"};
const TYPES=[["follow_up","ติดตามงาน · Follow-up"],["planned","งานตามแผน · Planned"],["improvement","ปรับปรุง · Improvement"],["inspection","ตรวจสอบ · Inspection"],["safety","ความปลอดภัย · Safety"],["other","อื่น ๆ · Other"]];
const SHIFTS=[["","ไม่ระบุกะ"],["A","กะ A"],["B","กะ B"],["O","กะ O"]];
const blank=()=>({id:"",department_id:"",machine_id:"",title:"",details:"",task_type:"planned",priority:"P3",status:"new",assigned_to:"",assigned_shift:"",due_date:localDateISO(),waiting_reason:""});

export default function WorkBoard({profile}){
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[msg,setMsg]=useState(""),[scope,setScope]=useState("all"),[mine,setMine]=useState(false),[editor,setEditor]=useState(null);
  const [departments,setDepartments]=useState([]),[machines,setMachines]=useState([]),[profiles,setProfiles]=useState([]),[tasks,setTasks]=useState([]),[tableReady,setTableReady]=useState(true);

  async function load(){
    setLoading(true);setError("");
    try{
      const sb=requireSupabase();
      const [d,m,p]=await Promise.all([
        sb.from("departments").select("id,dept_code,dept_name,is_active,sort_order").eq("is_active",true).order("sort_order"),
        sb.from("machines").select("id,department_id,machine_no,machine_name,is_active,criticality").eq("is_active",true).order("machine_no"),
        sb.from("app_profiles").select("id,department_id,full_name,employee_code,shift,role,is_active").eq("role","technician").eq("is_active",true).order("full_name")
      ]);
      for(const q of [d,m,p])if(q.error)throw q.error;
      const t=await sb.from("maintenance_tasks").select("*").order("created_at",{ascending:false});
      if(t.error){setTableReady(false);setTasks([])}else{setTableReady(true);setTasks(t.data||[])}
      setDepartments(d.data||[]);setMachines(m.data||[]);setProfiles(p.data||[]);
    }catch(e){setError(e.message||"โหลด Work Board ไม่สำเร็จ")}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);

  const deptMap=useMemo(()=>Object.fromEntries(departments.map(x=>[x.id,x])),[departments]);
  const machineMap=useMemo(()=>Object.fromEntries(machines.map(x=>[x.id,x])),[machines]);
  const profileMap=useMemo(()=>Object.fromEntries(profiles.map(x=>[x.id,x])),[profiles]);
  const filtered=tasks.filter(t=>(scope==="all"||t.department_id===scope)&&(!mine||t.owner_profile_id===profile.id)&&t.status!=="cancelled");
  const machineOptions=editor?machines.filter(m=>!editor.department_id||m.department_id===editor.department_id).map(m=>({value:m.id,label:m.machine_no||"-",sub:m.machine_name||""})):[];
  const techOptions=editor?profiles.filter(p=>(!editor.department_id||p.department_id===editor.department_id)&&(!editor.assigned_shift||p.shift===editor.assigned_shift)).map(p=>({value:p.id,label:p.full_name,sub:`${p.employee_code||"-"} · Shift ${p.shift||"-"}`})):[];

  async function save(e){
    e.preventDefault();setMsg("");
    try{
      const sb=requireSupabase(),existing=editor.id?tasks.find(x=>x.id===editor.id):null;
      const selectedTech=profiles.find(p=>p.id===editor.assigned_to);
      const shift=selectedTech?.shift||editor.assigned_shift||null;
      const payload={department_id:editor.department_id||null,machine_id:editor.machine_id||null,title:editor.title.trim(),details:editor.details.trim()||null,task_type:editor.task_type,priority:editor.priority,status:editor.assigned_to&&editor.status==="new"?"assigned":editor.status,assigned_to:editor.assigned_to||null,assigned_shift:shift,due_date:editor.due_date||null,waiting_reason:editor.status==="waiting"?(editor.waiting_reason.trim()||null):null,owner_profile_id:profile.id,created_by:profile.id};
      if(!payload.title)throw new Error("กรุณาระบุชื่องาน");
      if(!payload.department_id)throw new Error("กรุณาเลือกแผนก เพื่อให้ระบบแจ้งเตือนได้ถูกทีม");
      let saved;
      if(editor.id){const {data,error}=await sb.from("maintenance_tasks").update(payload).eq("id",editor.id).select("*").single();if(error)throw error;saved=data}
      else{const {data,error}=await sb.from("maintenance_tasks").insert(payload).select("*").single();if(error)throw error;saved=data}
      const assignmentChanged=!existing||existing.assigned_to!==saved.assigned_to||existing.assigned_shift!==saved.assigned_shift||existing.department_id!==saved.department_id||existing.priority!==saved.priority;
      if(assignmentChanged&&(saved.assigned_to||saved.assigned_shift))dispatchMaintenanceNotification("task_assigned",saved.id).catch(()=>{});
      setEditor(null);setMsg("บันทึกงานเรียบร้อย");await load();
    }catch(e){setMsg(e.message||"บันทึกงานไม่สำเร็จ")}
  }
  async function quickStatus(id,status){
    try{const {error}=await requireSupabase().from("maintenance_tasks").update({status}).eq("id",id);if(error)throw error;await load()}catch(e){setMsg(e.message||"เปลี่ยนสถานะไม่สำเร็จ")}
  }

  if(loading)return <Loading text="กำลังโหลด Work Board…"/>;
  if(error)return <ErrorState message={error} onRetry={load}/>;
  if(!tableReady)return <div className="stack work-board-root"><section className="cc-head"><div><span className="cc-eyebrow">TEAM WORK BOARD</span><h1>จัดลำดับและมอบหมายงาน</h1></div></section><div className="migration-needed"><Icon name="warning" size={24}/><div><h3>ฐานข้อมูล Work Board ยังไม่พร้อม</h3><p>ตรวจสอบตาราง <span className="mono">maintenance_tasks</span> ใน Supabase</p></div></div></div>;

  return <div className="stack work-board-root">
    <section className="cc-head"><div><span className="cc-eyebrow">TEAM WORK BOARD</span><h1>จัดลำดับและมอบหมายงาน</h1><p>งานแจ้งเตือนจะยึด แผนก → กะ → ผู้รับผิดชอบ โดยไม่ยิงข้ามทีม</p></div><div className="cc-actions"><button className="btn ghost" onClick={load}><Icon name="refresh" size={16}/>รีเฟรช</button><button className="btn primary" onClick={()=>setEditor(blank())}><Icon name="plus" size={16}/>เพิ่มงาน</button></div></section>
    <div className="wb-toolbar"><div className="cc-scope-tabs compact"><button className={scope==="all"?"active":""} onClick={()=>setScope("all")}>ทุกแผนก</button>{departments.map(d=><button key={d.id} className={scope===d.id?"active":""} onClick={()=>setScope(d.id)}>{d.dept_code}</button>)}</div><label className="wb-mine"><input type="checkbox" checked={mine} onChange={e=>setMine(e.target.checked)}/><span/>งานติดตามของฉัน</label></div>
    {msg&&<div className={`notice ${msg.includes("เรียบร้อย")?"success":"danger"}`}>{msg}</div>}
    <div className="wb-summary">{PRIORITIES.map(([p,label])=><div key={p} className={`wb-summary-card ${p}`}><span>{PRIORITY_NAME[p]}</span><b>{filtered.filter(t=>t.priority===p&&t.status!=="completed").length}</b><small>{label}</small></div>)}</div>
    <div className="wb-board">{STATUSES.map(([status,label])=>{const list=filtered.filter(t=>t.status===status);return <section className={`wb-column status-${status}`} key={status}><div className="wb-column-head"><div><span className="wb-status-dot"/><h2>{label}</h2></div><b>{list.length}</b></div><div className="wb-column-list">{!list.length?<div className="wb-empty">ไม่มีงาน</div>:list.map(t=>{const m=machineMap[t.machine_id],tech=profileMap[t.assigned_to],dept=deptMap[t.department_id];return <article className={`wb-task ${t.priority}`} key={t.id} onClick={()=>setEditor({...blank(),...t,department_id:t.department_id||"",machine_id:t.machine_id||"",assigned_to:t.assigned_to||"",assigned_shift:t.assigned_shift||tech?.shift||"",waiting_reason:t.waiting_reason||"",details:t.details||""})}><div className="wb-task-top"><span className={`cc-priority ${t.priority}`}>{PRIORITY_NAME[t.priority]||t.priority}</span><span>{dept?.dept_code||"-"}</span></div><h3>{t.title}</h3>{m&&<p className="wb-machine"><Icon name="machine" size={14}/>{m.machine_no} · {m.machine_name}</p>}<div className="wb-task-meta"><span>{tech?.full_name||"ยังไม่มอบหมาย"}</span><span>{t.assigned_shift?`Shift ${t.assigned_shift}`:"ไม่ระบุกะ"}</span><span>{t.due_date||"ไม่กำหนดวัน"}</span></div>{t.status==="waiting"&&t.waiting_reason&&<div className="wb-wait">{t.waiting_reason}</div>}<div className="wb-task-actions" onClick={e=>e.stopPropagation()}>{status==="new"&&<button onClick={()=>quickStatus(t.id,t.assigned_to?"assigned":"working")}>เริ่มงาน</button>}{status==="assigned"&&<button onClick={()=>quickStatus(t.id,"working")}>กำลังทำ</button>}{status==="working"&&<><button onClick={()=>quickStatus(t.id,"waiting")}>รอติดตาม</button><button className="done" onClick={()=>quickStatus(t.id,"completed")}>เสร็จ</button></>}{status==="waiting"&&<><button onClick={()=>quickStatus(t.id,"working")}>ทำต่อ</button><button className="done" onClick={()=>quickStatus(t.id,"completed")}>เสร็จ</button></>}{status==="completed"&&<button onClick={()=>quickStatus(t.id,"working")}>เปิดงานอีกครั้ง</button>}</div></article>})}</div></section>})}</div>

    {editor&&<Modal title={editor.id?"แก้ไขงาน":"เพิ่มงานใหม่"} onClose={()=>setEditor(null)}><form className="editor-form wb-editor" onSubmit={save}>
      <div className="field-grid cols-2">
        <div className="field"><label>แผนก <small>Department</small></label><select className="select" required value={editor.department_id} onChange={e=>setEditor(x=>({...x,department_id:e.target.value,machine_id:"",assigned_to:"",assigned_shift:""}))}><option value="">เลือกแผนก</option>{departments.map(d=><option key={d.id} value={d.id}>{d.dept_code} · {d.dept_name}</option>)}</select></div>
        <div className="field"><label>เครื่องจักร <small>Machine</small></label><SearchSelect value={editor.machine_id} onChange={v=>setEditor(x=>({...x,machine_id:v}))} options={[{value:"",label:"ไม่ระบุเครื่อง",sub:"งานทั่วไปของแผนก"},...machineOptions]} placeholder="เลือกเครื่อง" searchPlaceholder="พิมพ์เลขเครื่องหรือชื่อเครื่อง…"/></div>
        <div className="field full"><label>ชื่องาน</label><input className="input" required value={editor.title} onChange={e=>setEditor(x=>({...x,title:e.target.value}))} placeholder="เช่น ตรวจสอบเสียงผิดปกติของ Gear Motor"/></div>
        <div className="field"><label>ระดับงาน</label><select className="select" value={editor.priority} onChange={e=>setEditor(x=>({...x,priority:e.target.value}))}>{PRIORITIES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
        <div className="field"><label>ประเภทงาน</label><select className="select" value={editor.task_type} onChange={e=>setEditor(x=>({...x,task_type:e.target.value}))}>{TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
        <div className="field"><label>กะที่รับผิดชอบ <small>Shift</small></label><select className="select" value={editor.assigned_shift||""} onChange={e=>setEditor(x=>({...x,assigned_shift:e.target.value,assigned_to:""}))}>{SHIFTS.map(([v,l])=><option key={v||"none"} value={v}>{l}</option>)}</select><small className="field-help">ถ้ายังไม่เลือกชื่อ ระบบจะส่งแจ้งเตือนเฉพาะช่างในแผนกและกะนี้</small></div>
        <div className="field"><label>ผู้รับผิดชอบ <small>Assignee</small></label><SearchSelect value={editor.assigned_to} onChange={v=>{const t=profiles.find(p=>p.id===v);setEditor(x=>({...x,assigned_to:v,assigned_shift:t?.shift||x.assigned_shift,status:x.status==="new"&&v?"assigned":x.status}))}} options={[{value:"",label:"ยังไม่ระบุรายคน",sub:editor.assigned_shift?`แจ้งทีม Shift ${editor.assigned_shift}`:"เลือกกะก่อนเพื่อแจ้งเป็นทีม"},...techOptions]} placeholder="เลือกช่าง" searchPlaceholder="ค้นหาชื่อหรือรหัสพนักงาน…"/></div>
        <div className="field"><label>กำหนดเสร็จ <small>Due Date</small></label><input className="input" type="date" value={editor.due_date||""} onChange={e=>setEditor(x=>({...x,due_date:e.target.value}))}/></div>
        <div className="field"><label>สถานะ</label><select className="select" value={editor.status} onChange={e=>setEditor(x=>({...x,status:e.target.value}))}>{STATUSES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
        {editor.status==="waiting"&&<div className="field full"><label>กำลังรออะไร</label><input className="input" value={editor.waiting_reason||""} onChange={e=>setEditor(x=>({...x,waiting_reason:e.target.value}))} placeholder="เช่น รออะไหล่ / รอ Production หยุดเครื่อง"/></div>}
        <div className="field full"><label>รายละเอียด</label><textarea className="textarea" value={editor.details||""} onChange={e=>setEditor(x=>({...x,details:e.target.value}))} placeholder="รายละเอียดงานหรือจุดที่ต้องตรวจสอบ"/></div>
      </div>
      <div className="wb-notify-rule"><Icon name="bell" size={17}/><div><b>การแจ้งเตือน</b><span>{editor.assigned_to?`ส่งตรง ${profileMap[editor.assigned_to]?.full_name||"ผู้รับผิดชอบ"}`:editor.department_id&&editor.assigned_shift?`ส่งเฉพาะ ${deptMap[editor.department_id]?.dept_code||"แผนก"} · Shift ${editor.assigned_shift}`:"ยังไม่ส่งจนกว่าจะเลือกกะหรือผู้รับผิดชอบ"}</span></div></div>
      <div className="modal-form-actions"><button type="button" className="btn ghost" onClick={()=>setEditor(null)}>ยกเลิก</button><button className="btn primary">บันทึกงาน</button></div>
    </form></Modal>}
  </div>;
}
