import React, { useEffect, useMemo, useState } from "react";
import { formatThaiDate, formatThaiDateTime, requireSupabase, safeFileName, signedImageUrl } from "../../core.js";
import { Empty, ErrorState, Icon, Loading, Modal, SearchSelect } from "../components/UI.jsx";
import { dispatchMaintenanceNotification } from "../notifications.js";

const STATUS=[
  ["new","แจ้งใหม่","New"],
  ["review","รอตรวจสอบ","Review"],
  ["ready","รอรวบรวม","Ready"],
  ["sent","ส่งจัดซื้อแล้ว","Sent"],
  ["follow_up","รอติดตาม","Follow-up"],
  ["closed","ปิดรายการ","Closed"]
];
const URGENCY=[
  ["urgent","เร่งด่วน","Urgent"],
  ["planned","ตามแผน","Planned"],
  ["improvement","ปรับปรุง","Improvement"]
];
const SOURCES=[
  ["technician","ช่างแจ้ง","Technician"],
  ["engineer","Engineer แจ้ง","Engineer"],
  ["breakdown","จาก Breakdown","Breakdown"],
  ["pm","จาก PM","PM"],
  ["inspection","จาก Inspection","Inspection"],
  ["other","อื่น ๆ","Other"]
];
const IMAGE_TYPES=[
  ["part","รูปอะไหล่"],
  ["nameplate","รูป Nameplate / Part No."],
  ["installation","รูปจุดติดตั้ง"]
];
const UNITS=["pcs","set","box","roll","m","mm","L","kg","pair","pack","tube","bottle"];

const statusLabel=v=>STATUS.find(x=>x[0]===v)?.[1]||v||"-";
const urgencyLabel=v=>URGENCY.find(x=>x[0]===v)?.[1]||v||"-";
const sourceLabel=v=>SOURCES.find(x=>x[0]===v)?.[1]||v||"-";
const daysSince=v=>{if(!v)return 0;const ms=Date.now()-new Date(v).getTime();return Math.max(0,Math.floor(ms/86400000))};
const machineText=m=>m?`${m.machine_no||"-"} · ${m.machine_name||"ไม่ระบุ"}`:"ไม่ระบุเครื่อง";
const blank=(profile)=>({
  id:"",department_id:profile?.department_id||"",machine_id:"",source_type:profile?.role==="admin"?"engineer":"technician",
  part_name:"",part_no:"",specification:"",quantity:"1",unit:"pcs",urgency:"planned",reason:"",remark:"",
  status:"new",admin_note:"",follow_up_note:"",files:{part:null,nameplate:null,installation:null}
});

function csvCell(v){
  const s=String(v??"").replace(/\r?\n/g," ").replace(/"/g,'""');
  return `"${s}"`;
}
function downloadCsv(filename,rows){
  const csv="\ufeff"+rows.map(r=>r.map(csvCell).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
}

function RequestForm({profile,departments,machines,value,onChange,onSave,onClose,busy=false,isEdit=false}){
  const admin=profile.role==="admin";
  const dept=value.department_id||profile.department_id||"";
  const machineOptions=machines.filter(m=>!dept||m.department_id===dept).map(m=>({value:m.id,label:m.machine_no||"-",sub:m.machine_name||""}));
  const deptOptions=departments.map(d=>({value:d.id,label:d.dept_code,sub:d.dept_name}));
  function set(k,v){onChange(x=>({...x,[k]:v}))}
  return <form className="spare-form" onSubmit={onSave}>
    <div className="spare-form-banner"><span className={`spare-urgency-dot ${value.urgency}`}/><div><b>{isEdit?"ตรวจสอบ / แก้ไขรายการ":"แจ้งความต้องการอะไหล่"}</b><small>ไม่มีช่อง “ต้องการใช้วันที่” · ระบบเก็บวันที่แจ้งให้อัตโนมัติ</small></div></div>
    <div className="field-grid cols-2">
      <div className="field"><label>แผนก <small>Department</small></label>{admin?<SearchSelect value={value.department_id} onChange={v=>onChange(x=>({...x,department_id:v,machine_id:""}))} options={deptOptions} placeholder="เลือกแผนก" searchPlaceholder="ค้นหาแผนก…"/>:<div className="spare-readonly">{profile.departments?.dept_code||"-"}<small>{profile.departments?.dept_name||""}</small></div>}</div>
      <div className="field"><label>เครื่องจักร <small>Machine</small></label><SearchSelect value={value.machine_id} onChange={v=>set("machine_id",v)} options={[{value:"",label:"ไม่ระบุเครื่อง",sub:"ใช้กับอะไหล่ส่วนกลางหรือยังไม่ทราบเครื่อง"},...machineOptions]} placeholder="เลือกเครื่อง" searchPlaceholder="พิมพ์เลขเครื่องหรือชื่อเครื่อง…"/></div>
      {admin&&<div className="field"><label>ที่มาของรายการ <small>Source</small></label><select className="select" value={value.source_type} onChange={e=>set("source_type",e.target.value)}>{SOURCES.map(([v,th,en])=><option key={v} value={v}>{th} · {en}</option>)}</select></div>}
      <div className="field"><label>ระดับ <small>Priority</small></label><select className="select" value={value.urgency} onChange={e=>set("urgency",e.target.value)}>{URGENCY.map(([v,th,en])=><option key={v} value={v}>{th} · {en}</option>)}</select></div>
      <div className="field full"><label>ชื่ออะไหล่ <small>Part Name</small></label><input className="input" required value={value.part_name} onChange={e=>set("part_name",e.target.value)} placeholder="เช่น Hydraulic Seal / Heater Tube / Proximity Sensor"/></div>
      <div className="field"><label>Part No. <small>ถ้าทราบ</small></label><input className="input mono" value={value.part_no} onChange={e=>set("part_no",e.target.value)} placeholder="ไม่บังคับ"/></div>
      <div className="field"><label>Specification <small>สเปก / ขนาด</small></label><input className="input" value={value.specification} onChange={e=>set("specification",e.target.value)} placeholder="เช่น 50×65×8 mm / 24VDC"/></div>
      <div className="field"><label>จำนวน <small>Quantity</small></label><input className="input mono" type="number" min="0.001" step="0.001" required value={value.quantity} onChange={e=>set("quantity",e.target.value)}/></div>
      <div className="field"><label>หน่วย <small>Unit</small></label><input className="input" list="spare-units" required value={value.unit} onChange={e=>set("unit",e.target.value)} placeholder="pcs"/><datalist id="spare-units">{UNITS.map(x=><option key={x} value={x}/>)}</datalist></div>
      <div className="field full"><label>เหตุผล / ปัญหา <small>Reason</small></label><textarea className="textarea" required value={value.reason} onChange={e=>set("reason",e.target.value)} placeholder="เช่น Seal รั่ว ต้องเปลี่ยน / พบจาก PM / เตรียมสำหรับ Improvement"/></div>
      <div className="field full"><label>หมายเหตุ <small>Remark</small></label><textarea className="textarea compact" value={value.remark} onChange={e=>set("remark",e.target.value)} placeholder="ข้อมูลเพิ่มเติม (ถ้ามี)"/></div>
      {admin&&isEdit&&<><div className="field"><label>สถานะ <small>Status</small></label><select className="select" value={value.status} onChange={e=>set("status",e.target.value)}>{STATUS.map(([v,th,en])=><option key={v} value={v}>{th} · {en}</option>)}</select></div><div className="field"><label>Admin Note <small>บันทึกของผู้รวบรวม</small></label><input className="input" value={value.admin_note||""} onChange={e=>set("admin_note",e.target.value)} placeholder="เช่น ตรวจสเปกแล้ว / ขอข้อมูลเพิ่ม"/></div>{value.status==="follow_up"&&<div className="field full"><label>สิ่งที่ต้องติดตาม</label><textarea className="textarea compact" value={value.follow_up_note||""} onChange={e=>set("follow_up_note",e.target.value)} placeholder="เช่น จัดซื้อขอ Part No. เพิ่ม"/></div>}</>}
    </div>
    {!isEdit&&<div className="spare-photo-section"><div className="spare-photo-head"><div><b>รูปประกอบ <small>Photos</small></b><p>ไม่บังคับ แต่แนะนำให้แนบเพื่อให้รวบรวมข้อมูลได้แม่นขึ้น</p></div></div><div className="spare-photo-grid">{IMAGE_TYPES.map(([type,label])=><label className={`spare-photo-input ${value.files?.[type]?"has-file":""}`} key={type}><Icon name="image" size={20}/><span><b>{label}</b><small>{value.files?.[type]?.name||"แตะเพื่อเลือกรูป"}</small></span><input type="file" accept="image/*" onChange={e=>onChange(x=>({...x,files:{...x.files,[type]:e.target.files?.[0]||null}}))}/></label>)}</div></div>}
    <div className="modal-form-actions"><button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button><button className="btn primary" disabled={busy}>{busy?"กำลังบันทึก…":isEdit?"บันทึกการตรวจสอบ":"ส่งรายการ"}</button></div>
  </form>;
}

export default function SpareRequests({profile}){
  const admin=profile.role==="admin";
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[msg,setMsg]=useState(""),[departments,setDepartments]=useState([]),[machines,setMachines]=useState([]),[requests,setRequests]=useState([]),[batches,setBatches]=useState([]),[tableReady,setTableReady]=useState(true);
  const [scope,setScope]=useState("all"),[status,setStatus]=useState("active"),[query,setQuery]=useState(""),[tab,setTab]=useState("requests"),[editor,setEditor]=useState(null),[busy,setBusy]=useState(false),[selected,setSelected]=useState(new Set()),[batchNote,setBatchNote]=useState(""),[detail,setDetail]=useState(null),[detailImages,setDetailImages]=useState([]),[detailLoading,setDetailLoading]=useState(false);

  async function load(){
    setLoading(true);setError("");
    try{
      const sb=requireSupabase();
      const [d,m]=await Promise.all([
        sb.from("departments").select("id,dept_code,dept_name,is_active,sort_order").eq("is_active",true).order("sort_order"),
        sb.from("machines").select("id,department_id,machine_no,machine_name,is_active").eq("is_active",true).order("machine_no")
      ]);
      for(const q of [d,m])if(q.error)throw q.error;
      const rq=await sb.from("spare_requests").select("*").order("created_at",{ascending:false}).limit(1000);
      if(rq.error){setTableReady(false);setRequests([]);setBatches([])}else{
        setTableReady(true);setRequests(rq.data||[]);
        if(admin){const bq=await sb.from("spare_request_batches").select("*").order("created_at",{ascending:false}).limit(200);if(bq.error)throw bq.error;setBatches(bq.data||[])}
      }
      setDepartments(d.data||[]);setMachines(m.data||[]);
    }catch(e){setError(e.message||"โหลดรายการอะไหล่ไม่สำเร็จ")}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);

  const deptMap=useMemo(()=>Object.fromEntries(departments.map(x=>[x.id,x])),[departments]);
  const machineMap=useMemo(()=>Object.fromEntries(machines.map(x=>[x.id,x])),[machines]);
  const batchMap=useMemo(()=>Object.fromEntries(batches.map(x=>[x.id,x])),[batches]);
  const counts=useMemo(()=>Object.fromEntries(STATUS.map(([s])=>[s,requests.filter(r=>(!admin||scope==="all"||r.department_id===scope)&&r.status===s).length])),[requests,scope,admin]);
  const activeCount=useMemo(()=>requests.filter(r=>(!admin||scope==="all"||r.department_id===scope)&&r.status!=="closed").length,[requests,scope,admin]);
  const visible=useMemo(()=>requests.filter(r=>{
    if(admin&&scope!=="all"&&r.department_id!==scope)return false;
    if(status==="active"&&r.status==="closed")return false;
    if(status!=="all"&&status!=="active"&&r.status!==status)return false;
    const q=query.trim().toLowerCase();if(!q)return true;
    const m=machineMap[r.machine_id],d=deptMap[r.department_id];
    return `${r.part_name} ${r.part_no||""} ${r.specification||""} ${r.requested_reason||""} ${r.requester_name_snapshot||""} ${m?.machine_no||""} ${m?.machine_name||""} ${d?.dept_code||""}`.toLowerCase().includes(q);
  }),[requests,admin,scope,status,query,machineMap,deptMap]);

  async function uploadFiles(requestId,files){
    const sb=requireSupabase(),rows=[];
    for(const [type,file] of Object.entries(files||{})){
      if(!file)continue;
      if(!file.type?.startsWith("image/"))throw new Error("รูปประกอบรองรับเฉพาะไฟล์รูปภาพ");
      if(file.size>8*1024*1024)throw new Error("รูปภาพแต่ละไฟล์ต้องไม่เกิน 8 MB");
      const path=`spare/${profile.auth_user_id}/${requestId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const {error}=await sb.storage.from("maintenance-media").upload(path,file,{upsert:false,contentType:file.type});if(error)throw error;
      rows.push({request_id:requestId,image_type:type,file_name:file.name,file_path:path,uploaded_by:profile.id});
    }
    if(rows.length){const {error}=await sb.from("spare_request_images").insert(rows);if(error)throw error}
  }

  async function saveNew(e){e.preventDefault();if(!editor)return;setBusy(true);setMsg("");
    try{
      const sb=requireSupabase(),part=editor.part_name.trim(),reason=editor.reason.trim(),dept=admin?editor.department_id:profile.department_id;
      if(!dept)throw new Error("กรุณาเลือกแผนก");if(!part)throw new Error("กรุณาระบุชื่ออะไหล่");if(!reason)throw new Error("กรุณาระบุเหตุผล / ปัญหา");
      const payload={department_id:dept,machine_id:editor.machine_id||null,requester_profile_id:profile.id,requester_name_snapshot:profile.full_name,requester_code_snapshot:profile.employee_code||null,requester_shift_snapshot:profile.shift||null,requester_role_snapshot:profile.role,source_type:admin?editor.source_type:"technician",requested_part_name:part,requested_part_no:editor.part_no.trim()||null,requested_specification:editor.specification.trim()||null,requested_reason:reason,part_name:part,part_no:editor.part_no.trim()||null,specification:editor.specification.trim()||null,quantity:Number(editor.quantity),unit:editor.unit.trim()||"pcs",urgency:editor.urgency,remark:editor.remark.trim()||null,status:"new"};
      if(!Number.isFinite(payload.quantity)||payload.quantity<=0)throw new Error("จำนวนต้องมากกว่า 0");
      const {data,error}=await sb.from("spare_requests").insert(payload).select("id").single();if(error)throw error;
      try{await uploadFiles(data.id,editor.files)}catch(imgErr){setMsg(`บันทึกรายการแล้ว แต่รูปบางส่วนอัปโหลดไม่สำเร็จ: ${imgErr.message}`);dispatchMaintenanceNotification("spare_request_created",data.id).catch(()=>{});setEditor(null);await load();return}
      dispatchMaintenanceNotification("spare_request_created",data.id).catch(()=>{});
      setEditor(null);setMsg("ส่งรายการอะไหล่เรียบร้อย");await load();
    }catch(e){setMsg(e.message||"บันทึกรายการไม่สำเร็จ")}finally{setBusy(false)}
  }

  async function saveAdminEdit(e){e.preventDefault();setBusy(true);setMsg("");
    try{
      const payload={department_id:editor.department_id,machine_id:editor.machine_id||null,source_type:editor.source_type,part_name:editor.part_name.trim(),part_no:editor.part_no.trim()||null,specification:editor.specification.trim()||null,quantity:Number(editor.quantity),unit:editor.unit.trim()||"pcs",urgency:editor.urgency,remark:editor.remark.trim()||null,status:editor.status,admin_note:editor.admin_note?.trim()||null,follow_up_note:editor.status==="follow_up"?(editor.follow_up_note?.trim()||null):null,reviewed_by:profile.id};
      if(!payload.part_name)throw new Error("กรุณาระบุชื่ออะไหล่");if(!Number.isFinite(payload.quantity)||payload.quantity<=0)throw new Error("จำนวนต้องมากกว่า 0");
      const {error}=await requireSupabase().from("spare_requests").update(payload).eq("id",editor.id);if(error)throw error;
      if(["sent","follow_up","closed"].includes(payload.status))dispatchMaintenanceNotification("spare_request_status",editor.id).catch(()=>{});
      setEditor(null);setMsg("บันทึกการตรวจสอบเรียบร้อย");await load();
    }catch(e){setMsg(e.message||"บันทึกไม่สำเร็จ")}finally{setBusy(false)}
  }

  async function quickStatus(id,next){
    setMsg("");try{const {error}=await requireSupabase().from("spare_requests").update({status:next,reviewed_by:profile.id}).eq("id",id);if(error)throw error;if(["sent","follow_up","closed"].includes(next))dispatchMaintenanceNotification("spare_request_status",id).catch(()=>{});await load()}catch(e){setMsg(e.message||"อัปเดตสถานะไม่สำเร็จ")}
  }
  function toggleSelected(id){setSelected(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n})}
  async function createBatch(){
    if(!selected.size)return;setBusy(true);setMsg("");
    try{const {data,error}=await requireSupabase().rpc("create_spare_request_batch",{p_request_ids:[...selected],p_note:batchNote.trim()||null});if(error)throw error;setSelected(new Set());setBatchNote("");setMsg("สร้างรอบรวบรวมเรียบร้อย");await load();setTab("batches");return data}catch(e){setMsg(e.message||"สร้างรอบรวบรวมไม่สำเร็จ")}finally{setBusy(false)}
  }
  async function markBatchSent(id){
    if(!confirm("ยืนยันว่าได้ส่งไฟล์รอบนี้ให้ฝ่ายจัดซื้อแล้ว?"))return;setMsg("");
    try{const {error}=await requireSupabase().rpc("mark_spare_request_batch_sent",{p_batch_id:id});if(error)throw error;dispatchMaintenanceNotification("spare_batch_sent",id).catch(()=>{});setMsg("ทำเครื่องหมายส่งจัดซื้อแล้วเรียบร้อย");await load()}catch(e){setMsg(e.message||"อัปเดตรอบส่งไม่สำเร็จ")}
  }
  function exportBatch(batch){
    const items=requests.filter(r=>r.batch_id===batch.id);const header=["No.","Department","Machine","Part Name","Part No.","Specification","Qty","Unit","Level","Reason","Requester","Shift","Source","Request Date","Remark","Admin Note"];
    const rows=items.map((r,i)=>{const d=deptMap[r.department_id],m=machineMap[r.machine_id];return [i+1,d?.dept_code||"-",m?.machine_no||"-",r.part_name,r.part_no||"",r.specification||"",r.quantity,r.unit,urgencyLabel(r.urgency),r.requested_reason,r.requester_name_snapshot,r.requester_shift_snapshot||"-",sourceLabel(r.source_type),formatThaiDate(r.created_at),r.remark||"",r.admin_note||""]});
    downloadCsv(`${batch.batch_no}.csv`,[header,...rows]);
  }

  async function openDetail(r){
    setDetail(r);setDetailImages([]);setDetailLoading(true);
    try{const {data,error}=await requireSupabase().from("spare_request_images").select("id,image_type,file_name,file_path,created_at").eq("request_id",r.id).order("created_at");if(error)throw error;const rows=[];for(const x of data||[])rows.push({...x,url:await signedImageUrl(x.file_path,1200)});setDetailImages(rows)}catch(e){setMsg(e.message||"โหลดรูปไม่สำเร็จ")}finally{setDetailLoading(false)}
  }

  if(loading)return <Loading text="กำลังโหลด Spare Requests…"/>;
  if(error)return <ErrorState message={error} onRetry={load}/>;
  if(!tableReady)return <div className="stack spare-root"><section className="cc-head"><div><span className="cc-eyebrow">SPARE REQUEST COLLECTION</span><h1>Spare Requests <small>รวบรวมความต้องการอะไหล่</small></h1></div></section><div className="migration-needed"><Icon name="warning" size={24}/><div><h3>ฐานข้อมูล Spare Request ยังไม่พร้อม</h3><p>ติดตั้ง migration <span className="mono">20260908_spare_request_collection.sql</span> ก่อนใช้งาน</p></div></div></div>;

  return <div className={`stack spare-root ${admin?"spare-admin":"spare-tech"}`}>
    <section className="cc-head spare-head"><div><span className="cc-eyebrow">SPARE REQUEST COLLECTION</span><h1>Spare Requests <small>{admin?"รวบรวมและส่งฝ่ายจัดซื้อ":"แจ้งความต้องการอะไหล่"}</small></h1><p>{admin?"รับเรื่องจากช่างหรือสร้างรายการเอง ตรวจข้อมูล รวมเป็นรอบ และ Export ส่งฝ่ายจัดซื้อ":"แจ้งอะไหล่ที่ต้องการและติดตามสถานะของรายการที่คุณแจ้ง"}</p></div><div className="cc-actions"><button className="btn ghost" onClick={load}><Icon name="refresh" size={16}/>รีเฟรช</button><button className="btn primary" onClick={()=>setEditor(blank(profile))}><Icon name="plus" size={16}/>{admin?"เพิ่มรายการ":"แจ้งอะไหล่"}</button></div></section>

    {admin&&<div className="spare-admin-tabs"><button className={tab==="requests"?"active":""} onClick={()=>setTab("requests")}>Requests <small>รายการทั้งหมด</small></button><button className={tab==="batches"?"active":""} onClick={()=>setTab("batches")}>Purchase Batches <small>รอบรวบรวมส่งจัดซื้อ</small></button></div>}
    {msg&&<div className={`notice ${/เรียบร้อย|ส่งรายการแล้ว/.test(msg)?"success":"danger"}`}>{msg}</div>}

    {(!admin||tab==="requests")&&<>
      {admin&&<div className="cc-scope-tabs executive-scope spare-scope"><button className={scope==="all"?"active":""} onClick={()=>setScope("all")}>ทุกแผนก</button>{departments.map(d=><button key={d.id} className={scope===d.id?"active":""} onClick={()=>setScope(d.id)}>{d.dept_code}</button>)}</div>}
      <section className="spare-kpis">
        <button className={status==="active"?"active":""} onClick={()=>setStatus("active")}><span>กำลังดำเนินการ<small>Active</small></span><b>{activeCount}</b></button>
        {STATUS.map(([s,th,en])=><button key={s} className={`${s} ${status===s?"active":""}`} onClick={()=>setStatus(s)}><span>{th}<small>{en}</small></span><b>{counts[s]||0}</b></button>)}
      </section>
      <section className="spare-toolbar"><div className="spare-search"><Icon name="search" size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ค้นหาอะไหล่ / Part No. / เครื่อง / ผู้แจ้ง…"/></div><button className={status==="all"?"active":""} onClick={()=>setStatus("all")}>ทั้งหมด</button></section>

      {admin&&selected.size>0&&<section className="spare-batch-builder"><div><span className="cc-eyebrow">READY TO COLLECT</span><b>เลือกแล้ว {selected.size} รายการ</b><small>สร้างรอบรวบรวมก่อน Export ส่งฝ่ายจัดซื้อ</small></div><input className="input" value={batchNote} onChange={e=>setBatchNote(e.target.value)} placeholder="หมายเหตุรอบนี้ (ถ้ามี)"/><button className="btn primary" disabled={busy} onClick={createBatch}><Icon name="checklist" size={16}/>สร้างรอบรวบรวม</button></section>}

      {!visible.length?<Empty title={admin?"ไม่พบรายการในตัวกรองนี้":"ยังไม่มีคำขออะไหล่"} text={admin?"เปลี่ยนแผนก สถานะ หรือคำค้นหา":"กด “แจ้งอะไหล่” เพื่อสร้างรายการแรกของคุณ"}/>:<section className="spare-list">{visible.map(r=>{const d=deptMap[r.department_id],m=machineMap[r.machine_id],batch=batchMap[r.batch_id],wait=daysSince(r.status_changed_at),selectable=admin&&r.status==="ready"&&!r.batch_id;return <article className={`spare-card ${r.urgency} status-${r.status}`} key={r.id}>
        <div className="spare-card-rail"/>
        {selectable&&<label className="spare-select"><input type="checkbox" checked={selected.has(r.id)} onChange={()=>toggleSelected(r.id)}/><span/></label>}
        <div className="spare-card-main"><div className="spare-card-top"><div className="spare-tags"><span className={`spare-urgency ${r.urgency}`}>{urgencyLabel(r.urgency)}</span><span className={`spare-status ${r.status}`}>{statusLabel(r.status)}</span><span className="spare-dept">{d?.dept_code||"-"}</span></div><small>{formatThaiDateTime(r.created_at)}</small></div>
          <h3>{r.part_name}</h3><div className="spare-part-meta"><span className="mono">{r.part_no||"Part No. ไม่ระบุ"}</span>{r.specification&&<span>{r.specification}</span>}<b>{Number(r.quantity).toLocaleString("th-TH",{maximumFractionDigits:3})} {r.unit}</b></div>
          <div className="spare-machine"><Icon name="machine" size={15}/><span>{machineText(m)}</span></div><p className="spare-reason">{r.requested_reason}</p>
          <div className="spare-requester"><span><Icon name="user" size={14}/>{r.requester_name_snapshot}</span><span>{r.requester_shift_snapshot?`Shift ${r.requester_shift_snapshot}`:"ไม่ระบุกะ"}</span><span>{sourceLabel(r.source_type)}</span>{r.status!=="closed"&&<span className={wait>=5?"wait-long":""}>สถานะนี้ {wait} วัน</span>}</div>
          {batch&&<div className="spare-batch-chip">Batch · {batch.batch_no} · {batch.status==="sent"?"ส่งแล้ว":"Draft"}</div>}{r.follow_up_note&&<div className="spare-follow-note"><Icon name="warning" size={15}/>{r.follow_up_note}</div>}
        </div>
        <div className="spare-card-actions"><button onClick={()=>openDetail(r)}>รายละเอียด</button>{admin&&<button onClick={()=>setEditor({...blank(profile),...r,reason:r.requested_reason||"",department_id:r.department_id||"",machine_id:r.machine_id||"",part_no:r.part_no||"",specification:r.specification||"",remark:r.remark||"",admin_note:r.admin_note||"",follow_up_note:r.follow_up_note||"",quantity:String(r.quantity),files:{}})}>ตรวจ / แก้ไข</button>}{admin&&r.status==="new"&&<button className="primary-mini" onClick={()=>quickStatus(r.id,"review")}>รับตรวจ</button>}{admin&&r.status==="review"&&<button className="primary-mini" onClick={()=>quickStatus(r.id,"ready")}>ข้อมูลครบ</button>}{admin&&r.status==="sent"&&<button onClick={()=>quickStatus(r.id,"follow_up")}>ติดตามต่อ</button>}{admin&&["sent","follow_up"].includes(r.status)&&<button className="done-mini" onClick={()=>quickStatus(r.id,"closed")}>ปิดรายการ</button>}</div>
      </article>})}</section>}
    </>}

    {admin&&tab==="batches"&&<section className="spare-batches"><div className="spare-batches-head"><div><span className="cc-eyebrow">PURCHASE FILE COLLECTION</span><h2>รอบรวบรวมส่งฝ่ายจัดซื้อ</h2><p>สร้างจากรายการสถานะ “รอรวบรวม” แล้ว Export เป็น UTF-8 CSV ที่เปิดด้วย Excel ได้</p></div></div>{!batches.length?<Empty title="ยังไม่มีรอบรวบรวม" text="กลับไปแท็บ Requests เลือกรายการที่ข้อมูลครบ แล้วกดสร้างรอบรวบรวม"/>:<div className="spare-batch-list">{batches.map(b=>{const items=requests.filter(r=>r.batch_id===b.id),deptCodes=[...new Set(items.map(r=>deptMap[r.department_id]?.dept_code).filter(Boolean))];return <article className={`spare-batch-card ${b.status}`} key={b.id}><div className="spare-batch-head"><div><span className={`spare-batch-status ${b.status}`}>{b.status==="sent"?"ส่งจัดซื้อแล้ว":"Draft · รอส่ง"}</span><h3>{b.batch_no}</h3><p>{formatThaiDate(b.batch_date)} · {items.length} รายการ · {deptCodes.join(" / ")||"-"}</p></div><div className="spare-batch-actions"><button className="btn ghost" onClick={()=>exportBatch(b)}><Icon name="download" size={16}/>Export Excel/CSV</button>{b.status==="draft"&&<button className="btn primary" onClick={()=>markBatchSent(b.id)}><Icon name="send" size={16}/>ส่งจัดซื้อแล้ว</button>}</div></div>{b.note&&<div className="spare-batch-note">{b.note}</div>}<div className="spare-batch-items">{items.slice(0,8).map((r,i)=><div key={r.id}><span>{i+1}</span><b>{deptMap[r.department_id]?.dept_code||"-"}</b><p>{r.part_name}</p><small>{Number(r.quantity).toLocaleString("th-TH",{maximumFractionDigits:3})} {r.unit}</small></div>)}{items.length>8&&<div className="spare-batch-more">+{items.length-8} รายการ</div>}</div></article>})}</div>}</section>}

    {editor&&<Modal title={editor.id?"Spare Request · ตรวจสอบรายการ":"New Spare Request · แจ้งความต้องการอะไหล่"} onClose={()=>setEditor(null)}><RequestForm profile={profile} departments={departments} machines={machines} value={editor} onChange={setEditor} onSave={editor.id&&admin?saveAdminEdit:saveNew} onClose={()=>setEditor(null)} busy={busy} isEdit={Boolean(editor.id)}/></Modal>}

    {detail&&<Modal title="Spare Request · รายละเอียด" onClose={()=>{setDetail(null);setDetailImages([])}}><div className="spare-detail"><div className="spare-detail-title"><div><span className={`spare-urgency ${detail.urgency}`}>{urgencyLabel(detail.urgency)}</span><span className={`spare-status ${detail.status}`}>{statusLabel(detail.status)}</span></div><h2>{detail.part_name}</h2><p>{machineText(machineMap[detail.machine_id])} · {deptMap[detail.department_id]?.dept_code||"-"}</p></div><div className="spare-detail-grid"><div><small>Part No.</small><b className="mono">{detail.part_no||"-"}</b></div><div><small>Specification</small><b>{detail.specification||"-"}</b></div><div><small>จำนวน</small><b>{Number(detail.quantity).toLocaleString("th-TH",{maximumFractionDigits:3})} {detail.unit}</b></div><div><small>ผู้แจ้ง</small><b>{detail.requester_name_snapshot}</b><span>{detail.requester_shift_snapshot?`Shift ${detail.requester_shift_snapshot}`:"ไม่ระบุกะ"}</span></div><div className="full"><small>เหตุผล / ปัญหา</small><b>{detail.requested_reason}</b></div>{detail.remark&&<div className="full"><small>หมายเหตุ</small><b>{detail.remark}</b></div>}{detail.admin_note&&<div className="full admin"><small>Admin Note</small><b>{detail.admin_note}</b></div>}{detail.follow_up_note&&<div className="full warn"><small>ต้องติดตาม</small><b>{detail.follow_up_note}</b></div>}</div><div className="spare-detail-photos"><h3>รูปประกอบ <small>Photos</small></h3>{detailLoading?<Loading text="กำลังโหลดรูป…"/>:!detailImages.length?<p className="spare-no-photo">รายการนี้ไม่ได้แนบรูป</p>:<div className="spare-detail-photo-grid">{detailImages.map(x=><a key={x.id} href={x.url} target="_blank" rel="noreferrer"><img src={x.url} alt={x.file_name||x.image_type}/><span>{IMAGE_TYPES.find(i=>i[0]===x.image_type)?.[1]||"รูปประกอบ"}</span></a>)}</div>}</div></div></Modal>}
  </div>;
}
