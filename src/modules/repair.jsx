import React, { useEffect, useMemo, useState } from "react";
import {
  requireSupabase, localDateISO, localDayStartUTC, localNextDayStartUTC,
  formatThaiDate, formatThaiDateTime, statusLabel, severityLabel,
  uploadRepairImage, signedImageUrl, rpc, clean
} from "../../core.js";
import { Avatar, Badge, CardTitle, Empty, ErrorState, Icon, Loading, Modal, SearchSelect } from "../components/UI.jsx";

const STATUS_OPTIONS=[
  ["operational","ใช้งานได้ปกติ"],["no_parts","ไม่มีอะไหล่"],["follow_up","ต้องติดตามต่อ"]
];
const SEVERITY_OPTIONS=[["low","เล็กน้อย"],["medium","ปานกลาง"],["high","รุนแรง"]];
const STEP_LABELS=["กลุ่มเครื่อง","หมายเลขเครื่อง","จุดเสีย / อาการ","วิเคราะห์และแก้ไข","เวลา / รูปภาพ","ทบทวนก่อนส่ง"];
const VACUUM_PROBLEM_SYSTEMS=[
  {key:"vacuum",label:"Vacuum",sub:"ระบบดูด"},
  {key:"heating",label:"Heater",sub:"ฮีตเตอร์ / อุณหภูมิ"},
  {key:"clamp_forming",label:"Clamp / Forming",sub:"แคลมป์ / Forming Box"},
  {key:"loading_transfer",label:"Loading / Transfer",sub:"โหลดดิ้ง / จับยึด / ส่งชิ้นงาน"},
  {key:"pneumatic_hydraulic",label:"Air / Hydraulic",sub:"ลม / ไฮดรอลิก"},
  {key:"electrical_control",label:"Electrical / Control",sub:"ไฟฟ้า / PLC / Servo"},
  {key:"water_cooling",label:"Water / Cooling",sub:"น้ำ / Chiller"},
  {key:"safety",label:"Safety",sub:"Interlock / E-Stop"},
  {key:"mechanical",label:"Mechanical",sub:"เครื่องกล / ชุดขับ"}
];

function blankForm(){
  return {
    repair_date:localDateISO(), group_id:"", machine_id:"", area_point_id:"", area_point_text:"",
    problem_id:"", problem_system:"", symptom:"", problem_type:"", cause_id:"", cause:"", action_id:"", action_taken:"",
    severity:"medium", status:"", start_time:new Date().toTimeString().slice(0,5), end_time:"",
    spare_parts:"", remark:""
  };
}
function localISO(date,time){
  if(!date||!time)return null;
  const d=new Date(`${date}T${time}:00+07:00`);
  return Number.isNaN(d.getTime())?null:d.toISOString();
}
function lossPreview(f){
  if(!f.start_time||!f.end_time)return 0;
  const a=new Date(`${f.repair_date}T${f.start_time}:00+07:00`);
  const b=new Date(`${f.repair_date}T${f.end_time}:00+07:00`);
  if(b<a)b.setDate(b.getDate()+1);
  return Math.max(0,Math.round((b-a)/60000));
}
function normalizeText(v){return clean(v).toLowerCase()}

function loadImageElement(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const image=new Image();
    image.onload=()=>resolve({source:image,width:image.naturalWidth,height:image.naturalHeight,cleanup:()=>URL.revokeObjectURL(url)});
    image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("อ่านไฟล์รูปภาพไม่ได้"))};
    image.src=url;
  });
}

async function optimizeRepairImage(file){
  if(!file?.type?.startsWith("image/"))throw new Error("รองรับเฉพาะไฟล์รูปภาพ");
  if(file.size<=600*1024)return file;
  if(typeof document==="undefined")return file;
  let source=null,width=0,height=0,cleanup=()=>{};
  try{
    if(typeof createImageBitmap==="function"){
      try{
        const bitmap=await createImageBitmap(file,{imageOrientation:"from-image"});
        source=bitmap;width=bitmap.width;height=bitmap.height;cleanup=()=>bitmap.close?.();
      }catch{}
    }
    if(!source){
      const loaded=await loadImageElement(file);
      source=loaded.source;width=loaded.width;height=loaded.height;cleanup=loaded.cleanup;
    }
    const maxSide=1600;
    const ratio=Math.min(1,maxSide/Math.max(width,height));
    const outW=Math.max(1,Math.round(width*ratio));
    const outH=Math.max(1,Math.round(height*ratio));
    const canvas=document.createElement("canvas");
    canvas.width=outW;canvas.height=outH;
    const ctx=canvas.getContext("2d",{alpha:false});
    if(!ctx)return file;
    ctx.drawImage(source,0,0,outW,outH);
    let blob=null;
    for(const quality of [0.78,0.70,0.62]){
      blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
      if(!blob||blob.size<=650*1024)break;
    }
    if(!blob||blob.size>=file.size)return file;
    const base=(file.name||"repair-photo").replace(/\.[^.]+$/,'');
    return new File([blob],`${base}.jpg`,{type:"image/jpeg",lastModified:file.lastModified||Date.now()});
  }catch{return file}
  finally{try{cleanup()}catch{}}
}

function RepairPhotoPicker({type,label,file,onChange,missing=false,disabled=false}){
  const [preview,setPreview]=useState("");
  const [processing,setProcessing]=useState(false);
  useEffect(()=>{
    if(!file){setPreview("");return}
    const url=URL.createObjectURL(file);setPreview(url);
    return ()=>URL.revokeObjectURL(url);
  },[file]);
  async function handleNativeFile(e){
    const input=e.currentTarget;
    const next=input.files?.[0]||null;
    input.value="";
    if(!next)return;
    setProcessing(true);
    try{onChange(await optimizeRepairImage(next))}
    finally{setProcessing(false)}
  }
  return <div className={`upload-box modern required one-tap-picker ${file?"has-file":""} ${missing?"missing":""} ${processing?"is-processing":""}`} aria-busy={processing}>
    {file?<><img className="upload-preview" src={preview} alt={label}/><button type="button" className="upload-remove" onClick={e=>{e.stopPropagation();onChange(null)}} disabled={disabled||processing}><Icon name="close" size={14}/> ลบรูป</button><div className="upload-caption">{label} · แนบแล้ว</div></>:<div className="upload-picker-button" aria-hidden="true"><span className="upload-placeholder"><Icon name="image"/><b>{label} <span className="req">*</span></b><span>แตะครั้งเดียวเพื่อถ่ายหรือเลือกรูป</span><small>จำเป็นต้องแนบ</small></span></div>}
    {processing&&<div className="photo-preparing"><span className="save-progress-spinner"/><b>กำลังเตรียมรูป…</b></div>}
    <input className="native-photo-input" type="file" accept="image/*" disabled={disabled||processing} aria-label={`${file?"เปลี่ยน":"แนบ"}รูป${label}`} onClick={e=>{e.currentTarget.value=""}} onChange={handleNativeFile}/>
  </div>
}

function WizardSteps({step,onStep}){
  return <div className="wizard-steps" aria-label="ขั้นตอนรายงานซ่อม">
    {STEP_LABELS.map((label,i)=>{
      const n=i+1,done=n<step,active=n===step;
      return <button type="button" key={label} className={`wizard-step ${active?"active":""} ${done?"done":""}`} onClick={()=>done&&onStep(n)} disabled={!done&&!active}>
        <span className="wizard-step-no">{done?<Icon name="check" size={16}/>:n}</span>
        <span className="wizard-step-label">{label}</span>
      </button>;
    })}
  </div>
}

function ChoiceCard({selected,onClick,title,sub,mono=false,icon="machine",disabled=false,imageUrl="",tag=""}){
  return <button type="button" disabled={disabled} onClick={onClick} className={`select-card ${selected?"selected":""}`}>
    <span className={`select-card-media ${imageUrl?"has-image":""}`}>{imageUrl?<img src={imageUrl} alt={title}/>:<span className="select-card-icon"><Icon name={selected?"check":icon} size={24}/></span>}</span>
    <span className="select-card-copy">{tag&&<small className="select-card-tag">{tag}</small>}<b className={mono?"mono":""}>{title}</b>{sub&&<small>{sub}</small>}</span>
    <span className="select-card-mark">{selected?"เลือกแล้ว":"เลือก"}</span>
  </button>
}

function SearchBox({value,onChange,placeholder="ค้นหา…"}){
  return <div className="search-box"><Icon name="search" size={18}/><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></div>
}

function ValidationCard({issues,onJump}){
  if(!issues?.length)return null;
  return <div className="validation-card" role="alert">
    <div className="validation-card-head"><span className="validation-card-icon"><Icon name="alert" size={20}/></span><div><b>ข้อมูลยังไม่ครบ</b><p>ตรวจสอบรายการด้านล่างก่อนดำเนินการต่อ</p></div><span className="validation-count mono">{issues.length}</span></div>
    <div className="validation-list">{issues.map((item,i)=><button type="button" key={`${item.step}-${i}-${item.label}`} onClick={()=>onJump?.(item.step)}><span className="validation-list-icon"><Icon name="warning" size={16}/></span><span><b>{item.label}</b>{item.detail&&<small>{item.detail}</small>}</span><span className="validation-go">ไปขั้นตอน {item.step} →</span></button>)}</div>
  </div>
}

function FloatingValidationAlert({issues,onJump,onDismiss}){
  if(!issues?.length)return null;
  const first=issues[0];
  return <div className="floating-validation-wrap" role="alert" aria-live="assertive">
    <div className="floating-validation-alert">
      <span className="floating-validation-icon"><Icon name="alert" size={22}/></span>
      <div className="floating-validation-copy"><div className="floating-validation-title"><b>ข้อมูลยังไม่ครบ</b><span className="floating-validation-count mono">{issues.length}</span></div><p>{first.label}</p>{first.detail&&<small>{first.detail}</small>}</div>
      <div className="floating-validation-actions"><button type="button" className="floating-validation-fix" onClick={()=>onJump?.(first.step)}>ไปแก้</button><button type="button" className="floating-validation-close" aria-label="ปิดแจ้งเตือน" onClick={onDismiss}><Icon name="close" size={16}/></button></div>
    </div>
    {issues.length>1&&<div className="floating-validation-more">ยังเหลืออีก {issues.length-1} รายการ · กด “ไปแก้” เพื่อแก้ทีละขั้นตอน</div>}
  </div>
}

function Wizard({profile,onSaved}){
  const [step,setStep]=useState(1);
  const [form,setForm]=useState(blankForm);
  const [department,setDepartment]=useState(null);
  const [groups,setGroups]=useState([]);
  const [machines,setMachines]=useState([]);
  const [points,setPoints]=useState([]);
  const [problems,setProblems]=useState([]);
  const [causes,setCauses]=useState([]);
  const [actions,setActions]=useState([]);
  const [machineProblemMap,setMachineProblemMap]=useState([]),[machineCauseMap,setMachineCauseMap]=useState([]),[machineActionMap,setMachineActionMap]=useState([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [machinePhotoUrls,setMachinePhotoUrls]=useState({});
  const [files,setFiles]=useState({Before:null,Evidence:null,After:null});
  const [busy,setBusy]=useState(false),[saveStage,setSaveStage]=useState(""),[message,setMessage]=useState(""),[validationIssues,setValidationIssues]=useState([]);

  const selectedGroup=useMemo(()=>groups.find(x=>x.id===form.group_id),[groups,form.group_id]);
  const selectedMachine=useMemo(()=>machines.find(x=>x.id===form.machine_id),[machines,form.machine_id]);
  const selectedPoint=useMemo(()=>points.find(x=>x.id===form.area_point_id),[points,form.area_point_id]);
  const selectedProblem=useMemo(()=>problems.find(x=>x.id===form.problem_id),[problems,form.problem_id]);
  const selectedCause=useMemo(()=>causes.find(x=>x.id===form.cause_id),[causes,form.cause_id]);
  const selectedAction=useMemo(()=>actions.find(x=>x.id===form.action_id),[actions,form.action_id]);
  const loss=lossPreview(form);

  const freeMachineProblem=Boolean(department?.free_text_machine_problem);
  const freeCauseAction=Boolean(department?.free_text_cause_action);

  async function load(){
    setLoading(true);setError("");
    try{
      const sb=requireSupabase();
      const [d,g,m,p,pr,c,a,lpm,lcm,lam]=await Promise.all([
        sb.from("departments").select("id,dept_code,dept_name,free_text_entry,free_text_machine_problem,free_text_cause_action,require_image,required_image_types").eq("id",profile.department_id).single(),
        sb.from("machine_groups").select("id,department_id,group_code,group_name,sort_order,is_active").eq("is_active",true).order("sort_order").order("group_name"),
        sb.from("machines").select("id,department_id,machine_group_id,machine_no,machine_name,production_line,line_id,is_active,photo_path").eq("is_active",true).order("machine_no"),
        sb.from("area_points").select("id,machine_id,point_code,point_name,is_active").eq("is_active",true).order("point_name"),
        sb.from("problems").select("id,problem_code,problem_name,breakdown_type,department_code,system_group,symptom_sort_order,is_active").eq("is_active",true).order("problem_name"),
        sb.from("causes").select("id,cause_code,cause_name,category,department_code,is_active").eq("is_active",true).order("cause_name"),
        sb.from("actions").select("id,action_code,action_name,department_code,is_active").eq("is_active",true).order("action_name"),
        sb.from("machine_problem_map").select("machine_id,problem_id"),
        sb.from("machine_cause_map").select("machine_id,cause_id"),
        sb.from("machine_action_map").select("machine_id,action_id")
      ]);
      for(const x of [d,g,m,p,pr,c,a,lpm,lcm,lam])if(x.error)throw x.error;
      setDepartment(d.data);setGroups(g.data||[]);setMachines(m.data||[]);setPoints(p.data||[]);
      setProblems(pr.data||[]);setCauses(c.data||[]);setActions(a.data||[]);
      setMachineProblemMap(lpm.data||[]);setMachineCauseMap(lcm.data||[]);setMachineActionMap(lam.data||[]);
      const imagePaths=[...new Set((m.data||[]).map(x=>x.photo_path).filter(Boolean))],imageUrls={};
      await Promise.all(imagePaths.map(async path=>{imageUrls[path]=await signedImageUrl(path,1200)}));
      setMachinePhotoUrls(imageUrls);
    }catch(e){setError(e.message||"โหลด Master Data ไม่สำเร็จ")}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);

  useEffect(()=>{
    const raw=sessionStorage.getItem("mvr-repair-prefill");
    if(!raw||!machines.length)return;
    try{
      const x=JSON.parse(raw),machine=machines.find(m=>m.id===x.machine_id);
      if(machine){setForm(f=>({...f,group_id:machine.machine_group_id||"",machine_id:machine.id,symptom:x.symptom||"",problem_type:x.problem_type||"",cause:x.cause||"",remark:x.remark||""}));setStep(3)}
      sessionStorage.removeItem("mvr-repair-prefill");
    }catch{}
  },[machines.length]);

  function patch(k,v){setMessage("");setForm(f=>({...f,[k]:v}))}
  function chooseGroup(id){setValidationIssues([]);setForm(f=>({...f,group_id:id,machine_id:"",area_point_id:"",problem_id:"",problem_system:"",symptom:"",cause_id:"",action_id:""}));setQuery("");setStep(2)}
  function chooseMachine(id){setValidationIssues([]);setForm(f=>({...f,machine_id:id,area_point_id:"",problem_id:"",problem_system:"",symptom:"",cause_id:"",action_id:""}));setQuery("");setStep(3)}

  const visibleGroups=useMemo(()=>groups.filter(g=>!query||normalizeText(`${g.group_name} ${g.group_code}`).includes(normalizeText(query))),[groups,query]);
  const groupMachines=useMemo(()=>machines.filter(m=>m.machine_group_id===form.group_id&&(!query||normalizeText(`${m.machine_no} ${m.machine_name} ${m.production_line}`).includes(normalizeText(query)))),[machines,form.group_id,query]);
  const groupCoverImages=useMemo(()=>Object.fromEntries(groups.map(g=>{const machine=machines.find(m=>m.machine_group_id===g.id&&m.photo_path&&machinePhotoUrls[m.photo_path]);return [g.id,machine?machinePhotoUrls[machine.photo_path]:""]})),[groups,machines,machinePhotoUrls]);
  const machinePoints=useMemo(()=>points.filter(p=>p.machine_id===form.machine_id),[points,form.machine_id]);
  function mappedList(all,mapRows,key){
    if(!selectedMachine?.id)return [];
    const ids=mapRows.filter(x=>x.machine_id===selectedMachine.id).map(x=>x[key]);
    return all.filter(x=>ids.includes(x.id));
  }
  const machineProblems=useMemo(()=>mappedList(problems,machineProblemMap,"problem_id"),[problems,machineProblemMap,selectedMachine?.id]);
  const isVacuumFormingMachine=Boolean(department?.dept_code==="MVR"&&/^(IVF|DVF)/i.test(selectedMachine?.machine_no||""));
  const orderedMachineProblems=useMemo(()=>[...machineProblems].sort((a,b)=>{
    const sa=Number(a.symptom_sort_order??999),sb=Number(b.symptom_sort_order??999);
    return sa-sb||String(a.problem_name||"").localeCompare(String(b.problem_name||""),"th");
  }),[machineProblems]);
  const vacuumSystemOptions=useMemo(()=>VACUUM_PROBLEM_SYSTEMS.map(x=>({
    ...x,count:machineProblems.filter(p=>p.system_group===x.key).length
  })).filter(x=>x.count>0),[machineProblems]);
  const visibleVacuumProblems=useMemo(()=>orderedMachineProblems.filter(p=>p.system_group===form.problem_system),[orderedMachineProblems,form.problem_system]);
  const machineCauses=useMemo(()=>mappedList(causes,machineCauseMap,"cause_id"),[causes,machineCauseMap,selectedMachine?.id]);
  const machineActions=useMemo(()=>mappedList(actions,machineActionMap,"action_id"),[actions,machineActionMap,selectedMachine?.id]);

  function issuesForStep(n){
    const issues=[];
    if(n===1&&!form.group_id)issues.push({step:1,label:"ยังไม่ได้เลือกกลุ่มเครื่อง",detail:"เลือกกลุ่มเครื่องจักรก่อน"});
    if(n===2&&!form.machine_id)issues.push({step:2,label:"ยังไม่ได้เลือกหมายเลขเครื่อง",detail:"เลือกเครื่องจริงที่จะบันทึกรายงาน"});
    if(n===3){
      if(!freeMachineProblem&&!machinePoints.length)issues.push({step:3,label:"เครื่องนี้ยังไม่มีจุดเสีย",detail:"Admin ยังไม่ได้กำหนดจุดเสียให้เครื่องนี้"});
      else if(!freeMachineProblem&&!form.area_point_id)issues.push({step:3,label:"ยังไม่ได้เลือกจุดที่เสีย",detail:"เลือกจุดเสียจากตัวเลือกของเครื่อง"});
      if(!freeMachineProblem&&!machineProblems.length)issues.push({step:3,label:"เครื่องนี้ยังไม่มีอาการเสีย",detail:"Admin ยังไม่ได้กำหนด Problem ให้เครื่องนี้"});
      else if(!freeMachineProblem&&isVacuumFormingMachine&&!form.problem_system)issues.push({step:3,label:"ยังไม่ได้เลือกระบบที่มีปัญหา",detail:"เลือก Vacuum / Heater / Clamp / ระบบอื่นก่อนเลือกอาการ"});
      else if(!freeMachineProblem&&!form.problem_id)issues.push({step:3,label:"ยังไม่ได้เลือกอาการเสีย",detail:"เลือกอาการเสียจากตัวเลือกของเครื่อง"});
      if(freeMachineProblem&&!clean(form.symptom))issues.push({step:3,label:"ยังไม่ได้กรอกอาการเสีย",detail:"กรอกอาการที่พบให้ชัดเจน"});
    }
    if(n===4){
      if(!freeCauseAction&&!machineCauses.length)issues.push({step:4,label:"เครื่องนี้ยังไม่มีสาเหตุ",detail:"Admin ยังไม่ได้กำหนด Cause ให้เครื่องนี้"});
      else if(!freeCauseAction&&!form.cause_id)issues.push({step:4,label:"ยังไม่ได้เลือกสาเหตุ",detail:"เลือกสาเหตุจากตัวเลือกของเครื่อง"});
      if(!freeCauseAction&&!machineActions.length)issues.push({step:4,label:"เครื่องนี้ยังไม่มีวิธีแก้ไข",detail:"Admin ยังไม่ได้กำหนด Action ให้เครื่องนี้"});
      else if(!freeCauseAction&&!form.action_id)issues.push({step:4,label:"ยังไม่ได้เลือกวิธีแก้ไข",detail:"เลือกวิธีแก้ไขจากตัวเลือกของเครื่อง"});
      if(freeCauseAction&&!clean(form.cause))issues.push({step:4,label:"ยังไม่ได้กรอกสาเหตุ",detail:"กรอกสาเหตุที่วิเคราะห์ได้"});
      if(freeCauseAction&&!clean(form.action_taken))issues.push({step:4,label:"ยังไม่ได้กรอกวิธีแก้ไข",detail:"กรอกวิธีการแก้ไขที่ทำจริง"});
    }
    if(n===5){
      if(!form.start_time)issues.push({step:5,label:"ยังไม่ได้ระบุเวลาเริ่มซ่อม",detail:"กรอกเวลาเริ่มงานซ่อม"});
      if(!form.end_time)issues.push({step:5,label:"ยังไม่ได้ระบุเวลาซ่อมเสร็จ",detail:"ต้องระบุเวลาจบเพื่อคำนวณ Loss Time"});
      if(!form.status)issues.push({step:5,label:"ยังไม่ได้เลือกผลหลังซ่อม",detail:"เลือก ใช้งานได้ปกติ / ไม่มีอะไหล่ / ต้องติดตามต่อ"});
      if(!files.Before)issues.push({step:5,label:"ยังไม่ได้แนบรูปก่อนซ่อม",detail:"รูปก่อนซ่อมเป็นรูปบังคับ"});
      if(!files.Evidence)issues.push({step:5,label:"ยังไม่ได้แนบรูปจุดเสีย",detail:"รูปจุดเสียเป็นรูปบังคับ"});
      if(!files.After)issues.push({step:5,label:"ยังไม่ได้แนบรูปหลังซ่อม",detail:"รูปหลังซ่อมเป็นรูปบังคับ"});
    }
    return issues;
  }
  function allIssues(){return [1,2,3,4,5].flatMap(issuesForStep)}
  useEffect(()=>{
    if(!validationIssues.length)return;
    const steps=[...new Set(validationIssues.map(x=>x.step))];
    const refreshed=steps.flatMap(issuesForStep);
    const a=validationIssues.map(x=>`${x.step}:${x.label}`).join("|");
    const b=refreshed.map(x=>`${x.step}:${x.label}`).join("|");
    if(a!==b)setValidationIssues(refreshed);
  },[form,files,machinePoints.length,machineProblems.length,machineCauses.length,machineActions.length,freeMachineProblem,freeCauseAction]);
  useEffect(()=>{if(validationIssues.length&&typeof navigator!=="undefined"&&navigator.vibrate)navigator.vibrate([80,45,80])},[validationIssues.length]);
  function next(){const issues=issuesForStep(step);if(issues.length){setValidationIssues(issues);setMessage("");return}setValidationIssues([]);setMessage("");setQuery("");setStep(s=>Math.min(6,s+1));window.scrollTo({top:0,behavior:"smooth"})}
  function back(){setValidationIssues([]);setMessage("");setStep(s=>Math.max(1,s-1));window.scrollTo({top:0,behavior:"smooth"})}
  function requiredImagesOK(){return Boolean(files.Before&&files.Evidence&&files.After)}

  async function submit(){
    setMessage("");
    const issues=allIssues();if(issues.length){setValidationIssues(issues);return}
    setValidationIssues([]);setBusy(true);setSaveStage("กำลังเตรียมรูปภาพ…");
    const uploaded=[];
    try{
      const sb=requireSupabase();
      const {data:sessionData,error:sessionError}=await sb.auth.getSession();
      if(sessionError)throw sessionError;
      const user=sessionData?.session?.user;if(!user)throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      const reportId=crypto.randomUUID();
      const photoEntries=Object.entries(files).filter(([,file])=>Boolean(file));
      const prepared=await Promise.all(photoEntries.map(async([type,file])=>[type,await optimizeRepairImage(file)]));
      setSaveStage(`กำลังอัปโหลดรูป ${prepared.length} รูปพร้อมกัน…`);
      const uploadJobs=prepared.map(async([type,file])=>{
        let lastError;
        for(let attempt=1;attempt<=2;attempt++){
          try{
            const path=await uploadRepairImage({userId:user.id,reportId,file});
            return {image_type:type,file_name:file.name,file_path:path};
          }catch(error){lastError=error;if(attempt<2)await new Promise(r=>setTimeout(r,350))}
        }
        throw lastError||new Error(`อัปโหลดรูป ${type} ไม่สำเร็จ`);
      });
      const uploadResults=await Promise.allSettled(uploadJobs);
      uploaded.push(...uploadResults.filter(x=>x.status==="fulfilled").map(x=>x.value));
      const failedUpload=uploadResults.find(x=>x.status==="rejected");
      if(failedUpload)throw failedUpload.reason||new Error("อัปโหลดรูปภาพไม่สำเร็จ กรุณาลองใหม่");
      const started=localISO(form.repair_date,form.start_time);
      let finished=form.end_time?localISO(form.repair_date,form.end_time):null;
      if(started&&finished&&new Date(finished)<new Date(started)){const d=new Date(finished);d.setDate(d.getDate()+1);finished=d.toISOString()}
      const payload={
        id:reportId,machine_id:form.machine_id,machine_group_id:form.group_id,
        area_point_id:form.area_point_id||null,area_point_snapshot:freeMachineProblem?clean(form.area_point_text)||null:selectedPoint?.point_name||null,
        problem_id:form.problem_id||null,symptom:form.problem_id?(selectedProblem?.problem_name||""):clean(form.symptom),
        problem_type:form.problem_id?(selectedProblem?.breakdown_type||null):null,
        cause_id:form.cause_id||null,cause:form.cause_id?(selectedCause?.cause_name||""):clean(form.cause),
        action_id:form.action_id||null,action_taken:form.action_id?(selectedAction?.action_name||""):clean(form.action_taken),
        severity:form.severity,status:form.status,spare_parts:clean(form.spare_parts)||null,
        started_at:started,finished_at:finished||null,remark:clean(form.remark)||null
      };
      setSaveStage("กำลังบันทึกรายงานลงฐานข้อมูล…");
      await rpc("mvr_create_repair_report",{p_report:payload,p_images:uploaded});
      setSaveStage("บันทึกสำเร็จ");
      setForm(blankForm());setFiles({Before:null,Evidence:null,After:null});setValidationIssues([]);setStep(1);setMessage("บันทึกรายงานซ่อมเรียบร้อย");
      onSaved?.();
    }catch(e){
      if(uploaded.length){try{await requireSupabase().storage.from("maintenance-media").remove(uploaded.map(x=>x.file_path))}catch{}}
      setMessage(e.message||"บันทึกรายงานซ่อมไม่สำเร็จ");
    }finally{setBusy(false);setTimeout(()=>setSaveStage(""),700)}
  }

  if(loading)return <Loading text="กำลังเตรียมฟอร์มรายงานซ่อม…"/>;
  if(error)return <ErrorState message={error} onRetry={load}/>;

  return <div className="stack repair-wizard-wrap">
    <FloatingValidationAlert issues={validationIssues} onDismiss={()=>setValidationIssues([])} onJump={n=>{setStep(n);setQuery("");window.scrollTo({top:0,behavior:"smooth"})}}/>
    <div className="wizard-profile card flat">
      <div className="wizard-profile-left"><Avatar name={profile.full_name} size={44}/><div><b>{profile.full_name}</b><span><span className="mono">{profile.employee_code}</span> · {profile.departments?.dept_code||"-"}</span></div></div>
      <div className="wizard-profile-right"><span>วันที่รายงาน</span><b className="mono">{form.repair_date}</b></div>
    </div>
    <WizardSteps step={step} onStep={n=>{setValidationIssues([]);setStep(n)}}/>
    {message&&<div className={`notice ${message.includes("เรียบร้อย")?"success":"danger"}`}><Icon name={message.includes("เรียบร้อย")?"check":"alert"} size={18}/><span>{message}</span></div>}
    <ValidationCard issues={validationIssues} onJump={n=>{setValidationIssues([]);setStep(n);window.scrollTo({top:0,behavior:"smooth"})}}/>

    <section className="wizard-panel">
      {step===1&&<>
        <CardTitle icon="machine" title="เลือกกลุ่มเครื่องจักร" sub="ระบบแสดงเฉพาะกลุ่มเครื่องในแผนกของคุณ"/>
        <SearchBox value={query} onChange={setQuery} placeholder="ค้นหากลุ่มเครื่อง เช่น Inner Liner / Door Liner"/>
        {!visibleGroups.length?<Empty title="ยังไม่มีกลุ่มเครื่อง" text="ติดต่อผู้ดูแลระบบเพื่อเพิ่ม Machine Group"/>:<div className="selection-grid">{visibleGroups.map(g=><ChoiceCard key={g.id} selected={form.group_id===g.id} onClick={()=>chooseGroup(g.id)} title={g.group_name} sub={`${machines.filter(m=>m.machine_group_id===g.id).length} เครื่อง`} icon="machine" imageUrl={groupCoverImages[g.id]||""} tag={g.group_code||"กลุ่มเครื่อง"}/>)}</div>}
      </>}
      {step===2&&<>
        <CardTitle icon="machine" title={`เลือกหมายเลขเครื่อง${selectedGroup?` · ${selectedGroup.group_name}`:""}`} sub="เลือกเครื่องจริงที่จะบันทึกรายงาน"/>
        <SearchBox value={query} onChange={setQuery} placeholder="ค้นหา Machine No. หรือชื่อเครื่อง"/>
        {!groupMachines.length?<Empty title="ไม่พบเครื่องจักรในกลุ่มนี้"/>:<div className="selection-grid machine-selection-grid">{groupMachines.map(m=><ChoiceCard key={m.id} selected={form.machine_id===m.id} onClick={()=>chooseMachine(m.id)} title={m.machine_no} sub={`${m.machine_name}${m.production_line?` · ${m.production_line}`:""}`} mono icon="machine" imageUrl={machinePhotoUrls[m.photo_path]||""} tag={selectedGroup?.group_name||"เครื่องจักร"}/>)}</div>}
      </>}
      {step===3&&<>
        <CardTitle icon="alert" title="เลือกจุดเสียและอาการ" sub={`${selectedMachine?.machine_no||"-"} · ${selectedMachine?.machine_name||""}`}/>
        <div className="wizard-context-banner">
          <div className="context-chip"><span>กลุ่มเครื่อง</span><b>{selectedGroup?.group_name||"-"}</b></div>
          <div className="context-chip"><span>หมายเลขเครื่อง</span><b className="mono">{selectedMachine?.machine_no||"-"}</b></div>
          <div className="context-chip"><span>ไลน์ผลิต</span><b>{selectedMachine?.production_line||"-"}</b></div>
        </div>
        {!freeMachineProblem?<div className="analysis-select-grid compact-select-grid">
          <section className="choice-panel soft">
            <div className="choice-panel-head compact">
              <div><h4>จุดที่เสีย <span className="req">*</span></h4><p>เลือกตำแหน่งหรือจุดที่พบปัญหาบนเครื่องจักร</p></div>
              <span className="choice-count mono">{machinePoints.length} จุด</span>
            </div>
            {!machinePoints.length?<Empty title="เครื่องนี้ยังไม่มีจุดเสียใน Master Data" text="ให้ Admin เพิ่ม Area Point ก่อน"/>:<div className="field"><SearchSelect className="professional-select" value={form.area_point_id} onChange={v=>patch("area_point_id",v)} placeholder="เลือกจุดที่เสีย" searchPlaceholder="พิมพ์ค้นหาจุดที่เสีย…" options={machinePoints.map(p=>({value:p.id,label:p.point_name,sub:p.point_code||selectedMachine?.machine_no||""}))}/></div>}
            {(selectedPoint||form.area_point_id)&&<div className="selected-preview-card"><span>จุดที่เลือก</span><b>{selectedPoint?.point_name||"-"}</b>{selectedPoint?.point_code&&<small className="mono">{selectedPoint.point_code}</small>}</div>}
          </section>
          <section className="choice-panel soft">
            <div className="choice-panel-head compact">
              <div><h4>อาการเสีย <span className="req">*</span></h4><p>เลือกอาการที่ใกล้เคียงกับเหตุการณ์จริงมากที่สุด</p></div>
              <span className="choice-count mono">{machineProblems.length} รายการ</span>
            </div>
            {!machineProblems.length?<Empty title="ยังไม่มีอาการเสียสำหรับเครื่องนี้" text="Admin ยังไม่ได้กำหนด Problem ให้เครื่องนี้ จึงไม่มีตัวเลือก"/>:isVacuumFormingMachine?<>
              <div className="problem-system-label"><b>1. เลือกระบบที่มีปัญหา</b><span>รายการถูกจัดกลุ่มใหม่เพื่อลดคำซ้ำและหาได้เร็วบนมือถือ</span></div>
              <div className="problem-system-grid">{vacuumSystemOptions.map(x=><button type="button" key={x.key} className={`problem-system-card ${form.problem_system===x.key?"active":""}`} onClick={()=>setForm(f=>({...f,problem_system:x.key,problem_id:"",symptom:""}))}><b>{x.label}</b><span>{x.sub}</span><small>{x.count} อาการ</small></button>)}</div>
              <div className="problem-system-label second"><b>2. เลือกอาการเสีย</b><span>{form.problem_system?`แสดงเฉพาะ ${VACUUM_PROBLEM_SYSTEMS.find(x=>x.key===form.problem_system)?.label||"ระบบที่เลือก"}`:"เลือกระบบด้านบนก่อน"}</span></div>
              <div className="field"><SearchSelect className="professional-select" value={form.problem_id} onChange={v=>setForm(f=>({...f,problem_id:v,symptom:""}))} disabled={!form.problem_system} placeholder={form.problem_system?"เลือกอาการเสีย":"เลือกระบบที่มีปัญหาก่อน"} searchPlaceholder="พิมพ์ค้นหาอาการในระบบนี้…" options={visibleVacuumProblems.map(p=>({value:p.id,label:p.problem_name,sub:p.breakdown_type||""}))}/></div>
              <div className="controlled-master-note"><b>หาอาการไม่เจอ?</b><span>แจ้ง Engineer / Admin เพื่อเพิ่ม Master ให้ถูกระบบ ช่างยังไม่สามารถเพิ่มอาการเองได้</span></div>
            </>:<><div className="field"><SearchSelect className="professional-select" value={form.problem_id} onChange={v=>setForm(f=>({...f,problem_id:v,symptom:""}))} placeholder="เลือกอาการเสีย" searchPlaceholder="พิมพ์ค้นหาอาการเสีย…" options={orderedMachineProblems.filter(p=>p.problem_code!=="VFM999").map(p=>({value:p.id,label:p.problem_name,sub:p.breakdown_type||""}))}/></div><div className="controlled-master-note"><b>หาอาการไม่เจอ?</b><span>แจ้ง Engineer / Admin เพื่อเพิ่มรายการมาตรฐานให้เครื่องนี้ ช่างยังไม่สามารถเพิ่มอาการเองได้</span></div></>}
            {(selectedProblem||form.problem_id)&&<div className="selected-preview-card accent"><span>อาการที่เลือก</span><b>{selectedProblem?.problem_name||"-"}</b>{isVacuumFormingMachine&&form.problem_system&&<small>{VACUUM_PROBLEM_SYSTEMS.find(x=>x.key===form.problem_system)?.label||selectedProblem?.breakdown_type||""}</small>}{!isVacuumFormingMachine&&selectedProblem?.breakdown_type&&<small>{selectedProblem.breakdown_type}</small>}</div>}
          </section>
        </div>:<div className="field-grid cols-2"><div className="field"><label>จุดที่เสีย</label><input className="input" value={form.area_point_text} onChange={e=>patch("area_point_text",e.target.value)} placeholder="เช่น Loading / Heater / Clamp"/></div><div className="field full"><label>อาการเสีย <span className="req">*</span></label><textarea className="textarea" value={form.symptom} onChange={e=>patch("symptom",e.target.value)} placeholder="อธิบายอาการที่พบ"/></div></div>}
      </>}
      {step===4&&<>
        <CardTitle icon="repair" title="วิเคราะห์สาเหตุและการแก้ไข" sub="ข้อมูลส่วนนี้ใช้ต่อในประวัติซ่อม, KPI, Pareto และการติดตามงาน"/>
        <div className="analysis-layout">
          <section className="analysis-block emphasis">
            <div className="choice-panel-head compact">
              <div><h4>ระดับความรุนแรง <span className="req">*</span></h4><p>เลือกระดับผลกระทบของงานซ่อมครั้งนี้ให้ตรงกับสถานการณ์จริง</p></div>
              <span className={`severity-indicator ${form.severity}`}>{severityLabel(form.severity)}</span>
            </div>
            <div className="severity modern enhanced">{SEVERITY_OPTIONS.map(([v,l])=><button type="button" key={v} className={`choice ${v} ${form.severity===v?"active":""}`} onClick={()=>patch("severity",v)}><span className="severity-dot"/><b>{l}</b><small>{v==="low"?"กระทบน้อย" : v==="medium"?"กระทบการผลิตบางส่วน" : "หยุดเครื่อง / ผลกระทบสูง"}</small></button>)}</div>
          </section>
          {!freeCauseAction?<div className="analysis-select-grid"><section className="choice-panel soft"><div className="choice-panel-head compact"><div><h4>สาเหตุ <span className="req">*</span></h4><p>เลือกสาเหตุที่ Admin กำหนดไว้สำหรับเครื่องนี้</p></div></div>{!machineCauses.length?<Empty title="ยังไม่มีสาเหตุสำหรับเครื่องนี้" text="Admin ยังไม่ได้กำหนด Cause ให้เครื่องนี้ จึงไม่มีตัวเลือกและไม่สามารถพิมพ์เองได้"/>:<div className="field"><SearchSelect className="professional-select" value={form.cause_id} onChange={v=>patch("cause_id",v)} placeholder="เลือกสาเหตุ" searchPlaceholder="พิมพ์ค้นหาสาเหตุ…" options={machineCauses.map(c=>({value:c.id,label:c.cause_name,sub:c.category||c.cause_code||""}))}/></div>}</section><section className="choice-panel soft"><div className="choice-panel-head compact"><div><h4>วิธีแก้ไข <span className="req">*</span></h4><p>เลือกวิธีแก้ไขที่ Admin กำหนดไว้สำหรับเครื่องนี้</p></div></div>{!machineActions.length?<Empty title="ยังไม่มีวิธีแก้ไขสำหรับเครื่องนี้" text="Admin ยังไม่ได้กำหนด Action ให้เครื่องนี้ จึงไม่มีตัวเลือกและไม่สามารถพิมพ์เองได้"/>:<div className="field"><SearchSelect className="professional-select" value={form.action_id} onChange={v=>patch("action_id",v)} placeholder="เลือกวิธีแก้ไข" searchPlaceholder="พิมพ์ค้นหาวิธีแก้ไข…" options={machineActions.map(a=>({value:a.id,label:a.action_name,sub:a.action_code||""}))}/></div>}</section></div>:<div className="field-grid cols-2" style={{marginTop:18}}><div className="field"><label>สาเหตุ <span className="req">*</span></label><textarea className="textarea" value={form.cause} onChange={e=>patch("cause",e.target.value)} placeholder="สาเหตุที่วิเคราะห์ได้"/></div><div className="field"><label>วิธีแก้ไข <span className="req">*</span></label><textarea className="textarea" value={form.action_taken} onChange={e=>patch("action_taken",e.target.value)} placeholder="วิธีการแก้ไขที่ดำเนินการ"/></div></div>}
          <div className="analysis-note"><Icon name="warning" size={17}/><span>เลือกสาเหตุและวิธีแก้ไขให้ตรงกับงานจริง เพื่อให้ข้อมูลสามารถนำไปใช้ต่อใน KPI และ Pareto ได้อย่างถูกต้อง</span></div>
        </div>
      </>}
      {step===5&&<>
        <CardTitle icon="clock" title="เวลา ผลหลังซ่อม และรูปภาพการซ่อม" sub="กรอกเวลา เลือกผลหลังซ่อม และแนบรูปบังคับครบ 3 รูปก่อนเข้าสู่หน้าทบทวน"/>
        <div className="field-grid cols-4"><div className="field"><label>วันที่ซ่อม</label><input className="input" type="date" value={form.repair_date} onChange={e=>patch("repair_date",e.target.value)}/></div><div className="field"><label>เวลาเริ่ม <span className="req">*</span></label><input className="input mono" type="time" value={form.start_time} onChange={e=>patch("start_time",e.target.value)}/></div><div className="field"><label>เวลาซ่อมเสร็จ</label><input className="input mono" type="time" value={form.end_time} onChange={e=>patch("end_time",e.target.value)}/></div><div className="field"><label>Loss Time</label><div className={`computed-box ${loss>=60?"warn":""}`}><b className="mono">{loss}</b><span>นาที</span></div></div></div>
        <div className="field-grid cols-3" style={{marginTop:12}}><div className="field"><label>ผลหลังซ่อม <span className="req">*</span></label><SearchSelect value={form.status} onChange={v=>patch("status",v)} placeholder="เลือกผลหลังซ่อม" searchable={false} options={STATUS_OPTIONS.map(([value,label])=>({value,label}))}/></div><div className="field"><label>อะไหล่ที่ใช้</label><input className="input" value={form.spare_parts} onChange={e=>patch("spare_parts",e.target.value)} placeholder="เช่น Heater / Sensor / O-Ring x2"/></div><div className="field"><label>หมายเหตุ</label><input className="input" value={form.remark} onChange={e=>patch("remark",e.target.value)} placeholder="ติดตามต่อ / รออะไหล่ / ข้อมูลเพิ่มเติม"/></div></div>

        <div className="upload-section-head"><div><div className="wizard-question">รูปภาพการซ่อม <span className="req">*</span></div><p>ต้องแนบครบทั้ง 3 รูปทุกครั้งก่อนส่งรายงาน</p></div><span className={`upload-complete-badge ${requiredImagesOK()?"done":""}`}><Icon name={requiredImagesOK()?"check":"warning"} size={15}/>{Object.values(files).filter(Boolean).length}/3 รูป</span></div>
        <div className="upload-grid">{[["Before","ก่อนซ่อม"],["Evidence","จุดเสีย"],["After","หลังซ่อม"]].map(([type,label])=><RepairPhotoPicker key={type} type={type} label={label} file={files[type]} missing={validationIssues.some(x=>x.step===5&&x.label.includes(label))} disabled={busy} onChange={file=>{setFiles(x=>({...x,[type]:file}));setMessage("")}}/>)}</div>
        <div className="mandatory-photo-card"><span className="mandatory-photo-icon"><Icon name="warning" size={18}/></span><div><b>รูปภาพเป็นข้อมูลบังคับ</b><p>ต้องมีรูปก่อนซ่อม, รูปจุดเสีย และรูปหลังซ่อมครบทุกครั้ง ระบบจะบอกชัดเจนถ้ายังแนบไม่ครบ</p></div></div>
      </>}
      {step===6&&<>
        <CardTitle icon="check" title="ทบทวนข้อมูลก่อนส่ง" sub="ตรวจสอบความถูกต้องอีกครั้งก่อนบันทึกรายงานซ่อม"/>
        <div className="review-card premium">
          <div className="review-title"><Icon name="check" size={20}/><b>สรุปก่อนส่ง</b></div>
          <div className="review-grid two-col">
            <div><span>ช่าง</span><b>{profile.full_name}</b></div><div><span>กลุ่มเครื่อง</span><b>{selectedGroup?.group_name||"-"}</b></div>
            <div><span>เครื่อง</span><b className="mono">{selectedMachine?.machine_no||"-"}</b><small>{selectedMachine?.machine_name||"-"}</small></div><div><span>ไลน์ผลิต</span><b>{selectedMachine?.production_line||"-"}</b></div>
            <div><span>จุดเสีย</span><b>{selectedPoint?.point_name||form.area_point_text||"-"}</b></div><div><span>อาการ</span><b>{selectedProblem?.problem_name||form.symptom||"-"}</b></div>
            <div><span>ความรุนแรง</span><b>{severityLabel(form.severity)}</b></div><div><span>ผลหลังซ่อม</span><b>{statusLabel(form.status)}</b></div>
            <div><span>สาเหตุ</span><b>{selectedCause?.cause_name||form.cause||"-"}</b></div><div><span>วิธีแก้ไข</span><b>{selectedAction?.action_name||form.action_taken||"-"}</b></div>
            <div><span>เวลาเริ่ม/จบ</span><b className="mono">{form.start_time||"-"} - {form.end_time||"-"}</b></div><div><span>Loss Time</span><b className="mono">{loss} นาที</b></div>
            <div className="full"><span>หมายเหตุ</span><b>{form.remark||"-"}</b></div>
          </div>
          <div className="review-photos"><div className="review-photos-head"><b>รูปประกอบ</b><span>{Object.values(files).filter(Boolean).length} รูป</span></div><div className="review-photos-grid">{[["Before","ก่อนซ่อม"],["Evidence","จุดเสีย"],["After","หลังซ่อม"]].map(([type,label])=>files[type]?<div key={type} className="review-photo-item"><img src={URL.createObjectURL(files[type])} alt={label}/><span>{label}</span></div>:<div key={type} className="review-photo-item empty"><Icon name="image" size={22}/><span>{label}</span><small>ยังไม่ได้แนบ</small></div>)}</div></div>
        </div>
      </>}
    </section>

    {busy&&<div className="save-progress-card" role="status" aria-live="polite"><span className="save-progress-spinner"/><div><b>{saveStage||"กำลังบันทึก…"}</b><small>กรุณาอย่าปิดหน้านี้จนกว่าจะบันทึกเสร็จ</small></div></div>}

    <div className="wizard-actions">
      {step>1?<button type="button" className="btn ghost" onClick={back}><span>←</span> ย้อนกลับ</button>:<button type="button" className="btn ghost" onClick={()=>{setForm(blankForm());setFiles({Before:null,Evidence:null,After:null});setValidationIssues([]);setQuery("")}}>ล้าง</button>}
      {step<6?<button type="button" className="btn primary" onClick={next}>ถัดไป <span>→</span></button>:<button type="button" className="btn primary" disabled={busy} onClick={submit}><Icon name="save" size={17}/>{busy?(saveStage||"กำลังบันทึก…"):"บันทึกรายงานซ่อม"}</button>}
    </div>
  </div>;
}

function thaiTime(value){
  if(!value)return "-";
  try{return new Date(value).toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Asia/Bangkok"})}catch{return "-"}
}

function ReportDetail({row,profile,onClose,onChanged}){
  const admin=profile.role==="admin";
  const canManage=admin||row.technician_id===profile.id;
  const toBangkokInput=(iso)=>{
    if(!iso)return "";
    const d=new Date(iso);if(Number.isNaN(d.getTime()))return "";
    const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(d).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  };
  const toISO=(value)=>{if(!value)return null;const d=new Date(`${value}:00+07:00`);return Number.isNaN(d.getTime())?null:d.toISOString()};
  const initialEdit=()=>({
    machine_id:row.machine_id||"",technician_id:row.technician_id||"",
    area_point_id:row.area_point_id||"",area_point_text:row.area_point_snapshot||"",
    problem_id:row.problem_id||"",symptom:row.symptom||"",
    cause_id:row.cause_id||"",cause:row.cause||"",
    action_id:row.action_id||"",action_taken:row.action_taken||"",
    severity:row.severity,status:row.status,spare_parts:row.spare_parts||"",remark:row.remark||"",
    started_at:toBangkokInput(row.started_at),finished_at:toBangkokInput(row.finished_at)
  });

  const [images,setImages]=useState([]),[loading,setLoading]=useState(true),[lightbox,setLightbox]=useState(null);
  const [editOpen,setEditOpen]=useState(false),[edit,setEdit]=useState(initialEdit),[busy,setBusy]=useState(false),[msg,setMsg]=useState("");
  const [deleteOpen,setDeleteOpen]=useState(false),[editLoading,setEditLoading]=useState(false);
  const [master,setMaster]=useState({loaded:false,departments:[],machines:[],techs:[],points:[],problems:[],causes:[],actions:[],problemMap:[],causeMap:[],actionMap:[]});

  useEffect(()=>{(async()=>{try{const sb=requireSupabase();const {data,error}=await sb.from("repair_images").select("id,image_type,file_name,file_path,public_url,bucket_name").eq("repair_report_id",row.id).order("created_at");if(error)throw error;const out=[];for(const x of data||[]){const direct=typeof x.public_url==="string"&&/^https?:\/\//i.test(x.public_url)?x.public_url:"";out.push({...x,url:direct||await signedImageUrl(x.file_path,1200)})}setImages(out)}catch(e){setMsg(e.message)}finally{setLoading(false)}})()},[row.id]);

  useEffect(()=>{
    if(!canManage||!editOpen||master.loaded)return;
    (async()=>{setEditLoading(true);setMsg("");try{
      const sb=requireSupabase();
      const [d,m,t,p,pr,c,a,mp,mc,ma]=await Promise.all([
        sb.from("departments").select("id,dept_code,dept_name,free_text_machine_problem,free_text_cause_action,is_active").order("sort_order").order("dept_code"),
        sb.from("machines").select("id,department_id,machine_group_id,machine_no,machine_name,production_line,is_active").order("machine_no"),
        admin?sb.from("app_profiles").select("id,employee_code,full_name,department_id,shift,position,is_active,role").eq("role","technician").order("employee_code"):Promise.resolve({data:[profile],error:null}),
        sb.from("area_points").select("id,machine_id,point_code,point_name,is_active").order("point_name"),
        sb.from("problems").select("id,problem_code,problem_name,breakdown_type,department_code,is_active").order("problem_name"),
        sb.from("causes").select("id,cause_code,cause_name,category,department_code,is_active").order("cause_name"),
        sb.from("actions").select("id,action_code,action_name,department_code,is_active").order("action_name"),
        sb.from("machine_problem_map").select("machine_id,problem_id"),
        sb.from("machine_cause_map").select("machine_id,cause_id"),
        sb.from("machine_action_map").select("machine_id,action_id")
      ]);
      for(const x of [d,m,t,p,pr,c,a,mp,mc,ma])if(x.error)throw x.error;
      setMaster({loaded:true,departments:d.data||[],machines:m.data||[],techs:t.data||[],points:p.data||[],problems:pr.data||[],causes:c.data||[],actions:a.data||[],problemMap:mp.data||[],causeMap:mc.data||[],actionMap:ma.data||[]});
    }catch(e){setMsg(e.message||"โหลดข้อมูลสำหรับแก้ไขไม่สำเร็จ")}finally{setEditLoading(false)}})();
  },[admin,canManage,editOpen,master.loaded,profile]);

  const selectedEditMachine=master.machines.find(x=>x.id===edit.machine_id);
  const selectedEditDept=master.departments.find(x=>x.id===selectedEditMachine?.department_id);
  const freeMachineProblem=Boolean(selectedEditDept?.free_text_machine_problem);
  const freeCauseAction=Boolean(selectedEditDept?.free_text_cause_action);
  const machinePoints=master.points.filter(x=>x.machine_id===edit.machine_id&&x.is_active!==false);
  const mapped=(all,mapRows,key)=>{const ids=mapRows.filter(x=>x.machine_id===edit.machine_id).map(x=>x[key]);return all.filter(x=>ids.includes(x.id)&&x.is_active!==false)};
  const machineProblems=mapped(master.problems,master.problemMap,"problem_id").filter(p=>admin||p.problem_code!=="VFM999");
  const machineCauses=mapped(master.causes,master.causeMap,"cause_id");
  const machineActions=mapped(master.actions,master.actionMap,"action_id");
  const selectedPoint=master.points.find(x=>x.id===edit.area_point_id);
  const selectedProblem=master.problems.find(x=>x.id===edit.problem_id);
  const customEditProblem=selectedProblem?.problem_code==="VFM999";
  const selectedCause=master.causes.find(x=>x.id===edit.cause_id);
  const selectedAction=master.actions.find(x=>x.id===edit.action_id);
  const technicianOptions=(admin?master.techs:master.techs.filter(t=>t.id===profile.id)).filter(t=>!selectedEditMachine||t.department_id===selectedEditMachine.department_id||t.id===edit.technician_id).map(t=>({value:t.id,label:t.full_name,sub:`${t.employee_code}${t.shift?` · กะ ${t.shift}`:""}${t.is_active?"":" · Inactive"}`}));
  const machineOptions=master.machines.filter(m=>admin||m.department_id===profile.department_id||m.id===row.machine_id).map(m=>{const d=master.departments.find(x=>x.id===m.department_id);return {value:m.id,label:m.machine_no,sub:`${m.machine_name}${d?` · ${d.dept_code}`:""}${m.is_active?"":" · Inactive"}`}});

  function onMachineChange(v){setEdit(x=>({...x,machine_id:v,area_point_id:"",problem_id:"",cause_id:"",action_id:"",area_point_text:"",symptom:"",cause:"",action_taken:"",technician_id:admin?((master.techs.find(t=>t.id===x.technician_id)?.department_id===master.machines.find(m=>m.id===v)?.department_id)?x.technician_id:""):profile.id}))}

  function validateEdit(){
    if(!edit.machine_id)return "เลือกเครื่องจักร";
    if(!edit.started_at||!edit.finished_at)return "ระบุวันที่และเวลาเริ่ม/จบให้ครบ";
    const s=toISO(edit.started_at),f=toISO(edit.finished_at);if(!s||!f)return "รูปแบบวันที่หรือเวลาไม่ถูกต้อง";if(new Date(f)<new Date(s))return "เวลาซ่อมเสร็จต้องไม่ก่อนเวลาเริ่ม";
    if(freeMachineProblem){if(!clean(edit.symptom))return "กรอกอาการเสีย"}
    else {if(edit.machine_id!==row.machine_id){if(!edit.area_point_id)return "เลือกจุดที่เสียของเครื่องใหม่";if(!edit.problem_id)return "เลือกอาการเสียของเครื่องใหม่"}if(admin&&customEditProblem&&!clean(edit.symptom))return "กรอกอาการเสียที่พบจริง"}
    if(freeCauseAction){if(!clean(edit.cause))return "กรอกสาเหตุ";if(!clean(edit.action_taken))return "กรอกวิธีแก้ไข"}
    else if(edit.machine_id!==row.machine_id){if(!edit.cause_id)return "เลือกสาเหตุของเครื่องใหม่";if(!edit.action_id)return "เลือกวิธีแก้ไขของเครื่องใหม่"}
    return "";
  }

  async function save(){
    const invalid=validateEdit();if(invalid){setMsg(invalid);return}
    setBusy(true);setMsg("");
    try{
      const started=toISO(edit.started_at),finished=toISO(edit.finished_at);
      const payload={
        machine_id:edit.machine_id,technician_id:admin?(edit.technician_id||null):profile.id,
        area_point_id:freeMachineProblem?null:(edit.area_point_id||row.area_point_id||null),
        area_point_snapshot:freeMachineProblem?(clean(edit.area_point_text)||null):(edit.area_point_id?(selectedPoint?.point_name||null):(row.area_point_snapshot||null)),
        problem_id:freeMachineProblem?null:(edit.problem_id||row.problem_id||null),
        symptom:freeMachineProblem?clean(edit.symptom):(edit.problem_id?(customEditProblem?clean(edit.symptom):(selectedProblem?.problem_name||edit.symptom)):row.symptom),
        problem_type:freeMachineProblem?null:(edit.problem_id?(selectedProblem?.breakdown_type||null):row.problem_type||null),
        cause_id:freeCauseAction?null:(edit.cause_id||row.cause_id||null),
        cause:freeCauseAction?clean(edit.cause):(edit.cause_id?(selectedCause?.cause_name||edit.cause):row.cause),
        action_id:freeCauseAction?null:(edit.action_id||row.action_id||null),
        action_taken:freeCauseAction?clean(edit.action_taken):(edit.action_id?(selectedAction?.action_name||edit.action_taken):row.action_taken),
        severity:edit.severity,status:edit.status,spare_parts:clean(edit.spare_parts)||null,remark:clean(edit.remark)||null,
        started_at:started,finished_at:finished,time_missing:false
      };
      const {error}=await requireSupabase().from("repair_reports").update(payload).eq("id",row.id);if(error)throw error;
      setMsg("บันทึกการแก้ไขแล้ว");setEditOpen(false);onChanged?.();
    }catch(e){setMsg(e.message||"บันทึกไม่สำเร็จ")}finally{setBusy(false)}
  }

  async function hardDelete(){
    setBusy(true);setMsg("");
    try{
      const sb=requireSupabase();
      const currentPaths=images.filter(x=>x.bucket_name==="maintenance-media"&&x.file_path).map(x=>x.file_path);
      if(currentPaths.length){try{await sb.storage.from("maintenance-media").remove(currentPaths)}catch{}}
      await rpc("mvr_hard_delete_repair",{p_report_id:row.id});
      setDeleteOpen(false);onChanged?.();onClose();
    }catch(e){setMsg(e.message||"ลบรายงานไม่สำเร็จ")}finally{setBusy(false)}
  }

  const repairDate=formatThaiDate(row.started_at);
  const timeRange=row.time_missing?"ไม่ระบุเวลา":`${thaiTime(row.started_at)} - ${thaiTime(row.finished_at)}`;
  const reportNo=row.record_no||row.id?.slice(0,8)?.toUpperCase()||"-";

  return <Modal title="รายละเอียดงานซ่อม" onClose={onClose}><div className="stack repair-detail-modal">
    <div className="detail-heading premium-detail-heading">
      <div><span className="detail-kicker">REPAIR HISTORY</span><b>รายละเอียดงานซ่อม</b><span className="mono">{reportNo}</span></div>
      <div className="detail-heading-actions"><Badge value={row.status}/>{canManage&&<button type="button" className={`btn ${editOpen?"ghost":"primary"} detail-edit-toggle`} onClick={()=>{setEditOpen(v=>!v);setMsg("");if(!editOpen)setEdit({...initialEdit(),technician_id:admin?(row.technician_id||""):profile.id})}}><Icon name="edit" size={16}/>{editOpen?"กลับไปดูรายละเอียด":"แก้ไขรายงาน"}</button>}</div>
    </div>
    {msg&&<div className={`notice ${msg.includes("แล้ว")?"success":"danger"}`}>{msg}</div>}

    {!editOpen&&<>
      <section className="history-time-overview">
        <div className="history-time-card date"><span className="history-time-icon"><Icon name="calendar" size={21}/></span><div><small>วันที่ซ่อม</small><b>{repairDate}</b></div></div>
        <div className="history-time-card time"><span className="history-time-icon"><Icon name="clock" size={21}/></span><div><small>เวลาเริ่ม - จบ</small><b className="mono">{timeRange}</b></div></div>
        <div className={`history-time-card loss ${(row.loss_time_min||0)>=60?"high":""}`}><span className="history-time-icon"><Icon name="history" size={21}/></span><div><small>Downtime</small><b className="mono">{row.loss_time_min||0} นาที</b></div></div>
      </section>
      <section className="detail-section-card"><div className="detail-section-head"><div><span>01</span><div><b>ข้อมูลเครื่องและผู้ซ่อม</b><small>ข้อมูลหลักของงานซ่อมรายการนี้</small></div></div></div><div className="detail-info-grid">
        <div className="detail-info-item highlight"><span>เครื่องจักร</span><b className="mono">{row.machine_no_snapshot||"-"}</b><small>{row.machine_name_snapshot||"-"}</small></div>
        <div className="detail-info-item"><span>ไลน์ผลิต</span><b>{row.production_line_snapshot||"-"}</b></div>
        <div className="detail-info-item"><span>ช่างผู้ซ่อม</span><b>{row.technician_name_snapshot||"-"}</b><small>{row.technician_code_snapshot||"-"}{row.shift?` · กะ ${row.shift}`:""}</small></div>
        <div className="detail-info-item"><span>ระดับความรุนแรง</span><b>{severityLabel(row.severity)}</b></div><div className="detail-info-item"><span>ผลหลังซ่อม</span><b>{statusLabel(row.status)}</b></div><div className="detail-info-item"><span>อะไหล่ที่ใช้</span><b>{row.spare_parts||"ไม่ระบุ"}</b></div>
      </div></section>
      <section className="detail-section-card"><div className="detail-section-head"><div><span>02</span><div><b>ปัญหาและการวิเคราะห์</b><small>อาการ จุดเสีย สาเหตุ และแนวทางแก้ไข</small></div></div></div><div className="detail-problem-grid">
        <div className="detail-story-card problem"><span>จุดที่เสีย</span><b>{row.area_point_snapshot||"-"}</b></div><div className="detail-story-card problem"><span>อาการที่เสีย</span><b>{row.symptom||"-"}</b>{row.problem_type&&<small>{row.problem_type}</small>}</div><div className="detail-story-card cause"><span>สาเหตุ</span><b>{row.cause||"-"}</b></div><div className="detail-story-card action"><span>การแก้ไข</span><b>{row.action_taken||"-"}</b></div><div className="detail-story-card note full"><span>หมายเหตุ</span><b>{row.remark||"-"}</b></div>
      </div></section>
      <section className="detail-photos detail-section-card"><div className="detail-section-title"><div><b>รูปภาพการซ่อม</b><small>แตะรูปเพื่อขยายดู</small></div><span>{images.length} รูป</span></div>{loading?<Loading text="กำลังเปิดรูป…"/>:!images.length?<Empty title="ไม่มีรูปแนบ" text="รายงานนี้ไม่มีรูปภาพการซ่อม"/>:!images.some(x=>x.url)?<Empty title="เปิดรูปไม่ได้" text="ระบบหารูปไม่เจอ หรือไฟล์เดิมอาจอยู่คนละรูปแบบพาธ"/>:<div className="image-gallery modern-gallery">{images.filter(x=>x.url).map(x=><button type="button" className="gallery-card" key={x.id} onClick={()=>setLightbox({url:x.url,label:x.image_type||x.file_name||"รูปซ่อม"})}><img src={x.url} alt={x.image_type||x.file_name||"รูปซ่อม"}/><span>{x.image_type||"รูปซ่อม"}</span></button>)}</div>}</section>
    </>}

    {canManage&&editOpen&&<div className="admin-edit-box admin-edit-mode full-edit-mode">
      <div className="admin-edit-mode-head"><CardTitle icon="edit" title="แก้ไขรายงานทั้งหมด" sub={admin?"Admin สามารถแก้เครื่อง ช่าง เวลา ปัญหา สาเหตุ วิธีแก้ และผลซ่อมได้":"แก้ไขรายงานของคุณได้ทั้งหมด โดยชื่อช่างจะคงเป็นบัญชีของคุณ"}/><button type="button" className="btn ghost small" onClick={()=>{setEditOpen(false);setMsg("")}}>ยกเลิก</button></div>
      {editLoading?<Loading text="กำลังโหลดข้อมูลสำหรับแก้ไข…"/>:<>
        <div className="edit-section-block"><div className="edit-section-title"><span>01</span><div><b>เครื่องจักรและช่างผู้ซ่อม</b><small>เลือกเครื่องใหม่ได้ ระบบจะอัปเดตแผนก ไลน์ และ Snapshot ให้อัตโนมัติ</small></div></div><div className="field-grid cols-2"><div className="field"><label>เครื่องจักร <span className="req">*</span></label><SearchSelect value={edit.machine_id} onChange={onMachineChange} placeholder="เลือกเครื่องจักร" searchPlaceholder="ค้นหา Machine No. / ชื่อเครื่อง…" options={machineOptions}/></div><div className="field"><label>ช่างผู้ซ่อม</label>{admin?<SearchSelect value={edit.technician_id} onChange={v=>setEdit(x=>({...x,technician_id:v}))} placeholder={row.technician_id?"เลือกช่างผู้ซ่อม":`ช่างเดิม: ${row.technician_name_snapshot||"ไม่ระบุ"}`} searchPlaceholder="ค้นหารหัสหรือชื่อช่าง…" options={technicianOptions}/>:<div className="input read-only-tech"><b>{profile.full_name}</b><span className="mono">{profile.employee_code}{profile.shift?` · กะ ${profile.shift}`:""}</span></div>}</div></div></div>

        <div className="edit-section-block"><div className="edit-section-title"><span>02</span><div><b>วันที่ เวลา และผลซ่อม</b><small>Downtime จะคำนวณใหม่อัตโนมัติจากเวลาเริ่มและเวลาจบ</small></div></div><div className="field-grid cols-2"><div className="field"><label>วันที่/เวลาเริ่ม <span className="req">*</span></label><input className="input" type="datetime-local" value={edit.started_at} onChange={e=>setEdit(x=>({...x,started_at:e.target.value}))}/></div><div className="field"><label>วันที่/เวลาซ่อมเสร็จ <span className="req">*</span></label><input className="input" type="datetime-local" value={edit.finished_at} onChange={e=>setEdit(x=>({...x,finished_at:e.target.value}))}/></div><div className="field"><label>ผลหลังซ่อม</label><SearchSelect value={edit.status} onChange={v=>setEdit(x=>({...x,status:v}))} searchable={false} options={STATUS_OPTIONS.map(([value,label])=>({value,label}))}/></div><div className="field"><label>ความรุนแรง</label><SearchSelect value={edit.severity} onChange={v=>setEdit(x=>({...x,severity:v}))} searchable={false} options={SEVERITY_OPTIONS.map(([value,label])=>({value,label}))}/></div></div></div>

        <div className="edit-section-block"><div className="edit-section-title"><span>03</span><div><b>จุดเสียและอาการ</b><small>{selectedEditDept?`โหมดแผนก ${selectedEditDept.dept_code}: ${freeMachineProblem?"กรอกเอง":"ใช้ตัวเลือกตามเครื่อง"}`:"เลือกเครื่องจักรก่อน"}</small></div></div>{!edit.machine_id?<div className="notice warning">เลือกเครื่องจักรก่อนเพื่อโหลดจุดเสียและอาการ</div>:freeMachineProblem?<div className="field-grid cols-2"><div className="field"><label>จุดที่เสีย</label><input className="input" value={edit.area_point_text} onChange={e=>setEdit(x=>({...x,area_point_text:e.target.value}))} placeholder="กรอกจุดที่เสีย"/></div><div className="field full"><label>อาการเสีย <span className="req">*</span></label><textarea className="textarea" value={edit.symptom} onChange={e=>setEdit(x=>({...x,symptom:e.target.value}))} placeholder="กรอกอาการเสีย"/></div></div>:<div className="field-grid cols-2"><div className="field"><label>จุดที่เสีย</label><SearchSelect value={edit.area_point_id} onChange={v=>setEdit(x=>({...x,area_point_id:v}))} placeholder={row.area_point_id?"เลือกจุดที่เสีย":"คงข้อมูลเดิมได้ หรือเลือกใหม่"} options={machinePoints.map(p=>({value:p.id,label:p.point_name,sub:p.point_code||""}))}/></div><div className="field"><label>อาการเสีย</label><SearchSelect value={edit.problem_id} onChange={v=>setEdit(x=>({...x,problem_id:v,symptom:""}))} placeholder={row.problem_id?"เลือกอาการเสีย":"คงข้อมูลเดิมได้ หรือเลือกใหม่"} options={machineProblems.map(p=>({value:p.id,label:p.problem_name,sub:p.breakdown_type||""}))}/>{admin&&customEditProblem&&<textarea className="textarea" style={{marginTop:10}} value={edit.symptom} onChange={e=>setEdit(x=>({...x,symptom:e.target.value}))} placeholder="กรอกอาการเสียที่พบจริง"/>}</div></div>}</div>

        <div className="edit-section-block"><div className="edit-section-title"><span>04</span><div><b>สาเหตุและวิธีแก้ไข</b><small>{selectedEditDept?`โหมดแผนก ${selectedEditDept.dept_code}: ${freeCauseAction?"กรอกเอง":"ใช้ตัวเลือกตามเครื่อง"}`:"เลือกเครื่องจักรก่อน"}</small></div></div>{!edit.machine_id?<div className="notice warning">เลือกเครื่องจักรก่อนเพื่อโหลด Cause / Action</div>:freeCauseAction?<div className="field-grid cols-2"><div className="field full"><label>สาเหตุ <span className="req">*</span></label><textarea className="textarea" value={edit.cause} onChange={e=>setEdit(x=>({...x,cause:e.target.value}))}/></div><div className="field full"><label>วิธีแก้ไข <span className="req">*</span></label><textarea className="textarea" value={edit.action_taken} onChange={e=>setEdit(x=>({...x,action_taken:e.target.value}))}/></div></div>:<div className="field-grid cols-2"><div className="field"><label>สาเหตุ</label><SearchSelect value={edit.cause_id} onChange={v=>setEdit(x=>({...x,cause_id:v}))} placeholder={row.cause_id?"เลือกสาเหตุ":"คงข้อมูลเดิมได้ หรือเลือกใหม่"} options={machineCauses.map(c=>({value:c.id,label:c.cause_name,sub:c.category||""}))}/></div><div className="field"><label>วิธีแก้ไข</label><SearchSelect value={edit.action_id} onChange={v=>setEdit(x=>({...x,action_id:v}))} placeholder={row.action_id?"เลือกวิธีแก้ไข":"คงข้อมูลเดิมได้ หรือเลือกใหม่"} options={machineActions.map(a=>({value:a.id,label:a.action_name,sub:a.action_code||""}))}/></div></div>}</div>

        <div className="edit-section-block"><div className="edit-section-title"><span>05</span><div><b>อะไหล่และหมายเหตุ</b><small>แก้ข้อความประกอบของรายงาน</small></div></div><div className="field-grid cols-2"><div className="field"><label>อะไหล่ที่ใช้</label><input className="input" value={edit.spare_parts} onChange={e=>setEdit(x=>({...x,spare_parts:e.target.value}))} placeholder="เช่น Heater / Sensor / O-Ring"/></div><div className="field full"><label>หมายเหตุ</label><textarea className="textarea" value={edit.remark} onChange={e=>setEdit(x=>({...x,remark:e.target.value}))}/></div></div></div>

        <div className="edit-mode-actions full-edit-actions"><button className="btn ghost" type="button" onClick={()=>{setEditOpen(false);setMsg("")}}>ยกเลิก</button><button className="btn primary" disabled={busy} onClick={save}><Icon name="save" size={16}/>{busy?"กำลังบันทึก…":"บันทึกการแก้ไขทั้งหมด"}</button></div>
        <div className="danger-zone"><div><span className="danger-zone-icon"><Icon name="warning" size={20}/></span><div><b>ลบรายงานถาวร</b><p>{admin?"ลบออกจากประวัติและฐานข้อมูล ไม่สามารถกู้คืนได้":"ลบรายงานของคุณออกจากประวัติและฐานข้อมูลถาวร ไม่สามารถกู้คืนได้"}</p></div></div><button type="button" className="btn danger" disabled={busy} onClick={()=>setDeleteOpen(true)}>ลบรายงานถาวร</button></div>
      </>}
    </div>}

    {lightbox&&<div className="image-viewer-backdrop" onClick={()=>setLightbox(null)}><div className="image-viewer" onClick={e=>e.stopPropagation()}><button type="button" className="image-viewer-close" onClick={()=>setLightbox(null)}><Icon name="close" size={18}/></button><img src={lightbox.url} alt={lightbox.label}/><div className="image-viewer-caption">{lightbox.label}</div></div></div>}
    {deleteOpen&&<div className="hard-delete-backdrop" role="dialog" aria-modal="true" onClick={()=>!busy&&setDeleteOpen(false)}><div className="hard-delete-card" onClick={e=>e.stopPropagation()}><div className="hard-delete-icon"><Icon name="warning" size={26}/></div><div className="hard-delete-copy"><span className="hard-delete-kicker">DELETE PERMANENTLY</span><h3>ต้องการลบรายงานนี้จริงหรือไม่?</h3><p>{admin?"การลบนี้จะนำรายงานออกจากประวัติและฐานข้อมูลทันที และไม่สามารถกู้คืนได้":"คุณกำลังลบรายงานของตัวเองออกจากประวัติและฐานข้อมูลถาวร และไม่สามารถกู้คืนได้"}</p></div><div className="hard-delete-summary"><div><span>เลขที่รายงาน</span><b className="mono">{reportNo}</b></div><div><span>เครื่องจักร</span><b className="mono">{row.machine_no_snapshot||"-"}</b><small>{row.machine_name_snapshot||"-"}</small></div><div><span>ช่างผู้ซ่อม</span><b>{row.technician_name_snapshot||"-"}</b><small>{row.technician_code_snapshot||"-"}</small></div></div><div className="hard-delete-actions"><button type="button" className="btn ghost" disabled={busy} onClick={()=>setDeleteOpen(false)}>ยกเลิก</button><button type="button" className="btn danger confirm-delete" disabled={busy} onClick={hardDelete}>{busy?"กำลังลบ…":"ยืนยันลบถาวร"}</button></div></div></div>}
  </div></Modal>;
}

function History({profile,refreshToken=0}){
  const admin=profile.role==="admin";
  const [rows,setRows]=useState([]),[machines,setMachines]=useState([]),[techs,setTechs]=useState([]),[departments,setDepartments]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[selected,setSelected]=useState(null);
  const [filters,setFilters]=useState({q:"",machine_id:"",technician_id:"",department_id:"",status:"",from:"",to:"",mine:false,show_deleted:false});
  const [filtersOpen,setFiltersOpen]=useState(()=>typeof window==="undefined"?true:window.innerWidth>=1024);
  const [page,setPage]=useState(0),[total,setTotal]=useState(0);const pageSize=50;
  async function load(){setLoading(true);setError("");try{const sb=requireSupabase();const [m,t,d]=await Promise.all([
    sb.from("machines").select("id,machine_no,machine_name,department_id").order("machine_no"),
    admin?sb.from("app_profiles").select("id,full_name,employee_code,department_id,photo_path").eq("role","technician").order("full_name"):Promise.resolve({data:[],error:null}),
    admin?sb.from("departments").select("id,dept_code,dept_name").order("sort_order"):Promise.resolve({data:[],error:null})
  ]);for(const x of [m,t,d])if(x.error)throw x.error;setMachines(m.data||[]);setTechs(t.data||[]);setDepartments(d.data||[]);
    let q=sb.from("repair_reports").select("id,department_id,machine_id,technician_id,technician_name_snapshot,technician_code_snapshot,technician_photo_path_snapshot,record_no,shift,time_missing,machine_group_id,area_point_id,problem_id,cause_id,action_id,area_point_snapshot,symptom,problem_type,severity,cause,action_taken,spare_parts,status,started_at,finished_at,loss_time_min,remark,machine_no_snapshot,machine_name_snapshot,production_line_snapshot,deleted_at,delete_reason,created_at",{count:"exact"}).order("started_at",{ascending:false}).range(page*pageSize,page*pageSize+pageSize-1);
    if(filters.machine_id)q=q.eq("machine_id",filters.machine_id);if(filters.technician_id)q=q.eq("technician_id",filters.technician_id);if(filters.department_id)q=q.eq("department_id",filters.department_id);if(filters.status)q=q.eq("status",filters.status);if(filters.mine)q=q.eq("technician_id",profile.id);if(filters.from)q=q.gte("started_at",localDayStartUTC(filters.from));if(filters.to)q=q.lt("started_at",localNextDayStartUTC(filters.to));if(admin&&filters.show_deleted)q=q.not("deleted_at","is",null);else q=q.is("deleted_at",null);if(filters.q){const term=filters.q.replaceAll(","," ");q=q.or(`symptom.ilike.%${term}%,cause.ilike.%${term}%,action_taken.ilike.%${term}%,machine_name_snapshot.ilike.%${term}%,machine_no_snapshot.ilike.%${term}%,area_point_snapshot.ilike.%${term}%,technician_name_snapshot.ilike.%${term}%,technician_code_snapshot.ilike.%${term}%,record_no.ilike.%${term}%`)}
    const {data,error,count}=await q;if(error)throw error;const list=data||[];setTotal(count||0);
    const techPhotoById=Object.fromEntries((t.data||[]).filter(x=>x.photo_path).map(x=>[x.id,x.photo_path]));
    const resolvedPhotoPath=r=>r.technician_photo_path_snapshot||techPhotoById[r.technician_id]||(r.technician_id===profile.id?profile.photo_path||"":"");
    const paths=[...new Set(list.map(resolvedPhotoPath).filter(Boolean))],urls={};
    await Promise.all(paths.map(async p=>{urls[p]=await signedImageUrl(p)}));
    setRows(list.map(r=>{const path=resolvedPhotoPath(r);return {...r,technician_photo_path_resolved:path,technician_photo_url:urls[path]||""}}));}
  catch(e){setError(e.message||"โหลดประวัติไม่สำเร็จ")}finally{setLoading(false)}}
  useEffect(()=>{setPage(0)},[filters.q,filters.machine_id,filters.technician_id,filters.department_id,filters.status,filters.from,filters.to,filters.mine,filters.show_deleted]);
  useEffect(()=>{load()},[refreshToken,page,filters.q,filters.machine_id,filters.technician_id,filters.department_id,filters.status,filters.from,filters.to,filters.mine,filters.show_deleted]);
  const machineOptions=machines.map(m=>({value:m.id,label:m.machine_name,sub:m.machine_no}));
  const statusOptions=STATUS_OPTIONS.map(([value,label])=>({value,label}));
  const deptOptions=departments.map(d=>({value:d.id,label:d.dept_code,sub:d.dept_name}));
  const techOptions=techs.map(t=>({value:t.id,label:t.full_name,sub:t.employee_code}));
  const activeFilterCount=[filters.q,filters.machine_id,filters.technician_id,filters.department_id,filters.status,filters.from,filters.to].filter(Boolean).length + (filters.mine?1:0) + (filters.show_deleted?1:0);
  const clear=()=>setFilters({q:"",machine_id:"",technician_id:"",department_id:"",status:"",from:"",to:"",mine:false,show_deleted:false});
  return <div className="stack history-page">
    <div className="history-toolbar card flat"><div className="history-toolbar-head"><div><h2>{admin?"รายงานซ่อมทั้งหมด":"ประวัติการกรอก"}</h2><p>{admin?"ค้นหา ตรวจสอบ และดูรายละเอียดงานซ่อมทุกแผนก":"ค้นหาและดูรายละเอียดงานที่บันทึกย้อนหลัง"}</p></div><div className="history-toolbar-actions"><button className="btn ghost filter-toggle-btn" onClick={()=>setFiltersOpen(v=>!v)}><Icon name="filter" size={17}/>{filtersOpen?"ซ่อนตัวกรอง":"แสดงตัวกรอง"}{activeFilterCount>0&&<span className="filter-count-badge mono">{activeFilterCount}</span>}</button><button className="btn ghost refresh-btn" onClick={load}><Icon name="refresh" size={18}/>รีเฟรช</button></div></div>
      <div className="history-toolbar-summary"><span className="history-count"><b className="mono">{total}</b> รายการ</span></div>
      {filtersOpen&&<><div className="history-filter-grid"><div className="search-box history-search"><Icon name="search" size={18}/><input value={filters.q} onChange={e=>setFilters(f=>({...f,q:e.target.value}))} placeholder="ค้นหา: เครื่องจักร / อาการ / จุดที่เสีย / สาเหตุ…"/></div><SearchSelect value={filters.machine_id} onChange={v=>setFilters(f=>({...f,machine_id:v}))} placeholder="ทุกเครื่อง" options={machineOptions}/><SearchSelect value={filters.status} onChange={v=>setFilters(f=>({...f,status:v}))} placeholder="ทุกสถานะ" searchable={false} options={statusOptions}/>{admin&&<><SearchSelect value={filters.department_id} onChange={v=>setFilters(f=>({...f,department_id:v}))} placeholder="ทุกแผนก" options={deptOptions}/><SearchSelect value={filters.technician_id} onChange={v=>setFilters(f=>({...f,technician_id:v}))} placeholder="ทุกช่าง" options={techOptions}/></>}<div className="date-field"><span>ตั้งแต่วันที่</span><input className="input" type="date" value={filters.from} onChange={e=>setFilters(f=>({...f,from:e.target.value}))}/></div><div className="date-field"><span>ถึงวันที่</span><input className="input" type="date" value={filters.to} onChange={e=>setFilters(f=>({...f,to:e.target.value}))}/></div><button className="btn ghost clear-filter" onClick={clear}>ล้างตัวกรอง</button></div>
      <div className="toolbar-options">{!admin&&<label className="inline-check"><input type="checkbox" checked={filters.mine} onChange={e=>setFilters(f=>({...f,mine:e.target.checked}))}/> เฉพาะงานของฉัน</label>}</div></>}
    </div>
    {loading?<Loading/>:error?<ErrorState message={error} onRetry={load}/>:!rows.length?<Empty title="ไม่พบรายงานซ่อม" text="ลองเปลี่ยนคำค้นหาหรือช่วงวันที่"/>:<>
      <div className="history-table-wrap premium-table-shell"><div className="history-table-caption"><div><span className="table-caption-dot"/><b>รายการงานซ่อม</b><small>แสดง {rows.length} รายการในหน้านี้</small></div><span className="history-count"><b className="mono">{total}</b> รายการทั้งหมด</span></div><table className="history-table premium"><thead><tr><th>วันที่ / เวลา</th><th>เครื่องจักร</th><th>จุดที่เสีย / อาการ</th><th>Downtime</th><th>ช่างผู้ซ่อม</th><th>สถานะ</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id} className={r.deleted_at?"deleted":""}><td><div className="table-date-cell"><span className="table-date-icon"><Icon name="calendar" size={17}/></span><div><b>{formatThaiDate(r.started_at)}</b><small><span className="mono table-time-range">{r.time_missing?"ไม่ระบุเวลา":`${thaiTime(r.started_at)} - ${thaiTime(r.finished_at)}`}</span><span className="mono table-report-id">{r.record_no||r.id.slice(0,8)}</span></small></div></div></td><td><div className="table-machine-cell"><span className="table-machine-icon"><Icon name="machine" size={18}/></span><div><b className="mono">{r.machine_no_snapshot}</b><small>{r.machine_name_snapshot}</small>{r.production_line_snapshot&&<span className="table-line-chip">{r.production_line_snapshot}</span>}</div></div></td><td><div className="table-problem-cell"><b>{r.area_point_snapshot||"-"}</b><span>{r.symptom||"-"}</span><small>{r.problem_type||""}</small></div></td><td><div className="table-loss-stack"><span className={`loss-pill mono ${(r.loss_time_min||0)>=60?"high":""}`}>{r.loss_time_min||0} นาที</span><small>{(r.loss_time_min||0)>=60?"Downtime สูง":"Downtime"}</small></div></td><td><div className="table-tech premium"><Avatar name={r.technician_name_snapshot} pathUrl={r.technician_photo_url} size={38}/><span><b>{r.technician_name_snapshot}</b><small>{r.technician_code_snapshot?`${r.technician_code_snapshot}${r.shift?` · กะ ${r.shift}`:""}`:(profile.role==="admin"?"Technician":"งานของแผนก")}</small></span></div></td><td><div className="table-status-stack"><Badge value={r.status}/><span className={`severity-mini ${r.severity}`}>{severityLabel(r.severity)}</span></div></td><td><button className="table-detail-btn" onClick={()=>setSelected(r)}><span>รายละเอียด</span><Icon name="chevron" size={15}/></button></td></tr>)}</tbody></table></div>
      <div className="report-card-list mobile-history-cards">{rows.map(r=><button type="button" className={`report-card luxury ${r.deleted_at?"deleted":""}`} key={r.id} onClick={()=>setSelected(r)}><div className="report-card-timebar"><span><Icon name="calendar" size={14}/>{formatThaiDate(r.started_at)}</span><span><Icon name="clock" size={14}/><b className="mono">{r.time_missing?"ไม่ระบุเวลา":`${thaiTime(r.started_at)} - ${thaiTime(r.finished_at)}`}</b></span></div><div className="report-card-top"><div className="report-card-tech"><Avatar name={r.technician_name_snapshot} pathUrl={r.technician_photo_url} size={44}/><div><b>{r.technician_name_snapshot}</b><small>{r.technician_code_snapshot?`${r.technician_code_snapshot}${r.shift?` · กะ ${r.shift}`:""}`:"Technician"}</small></div></div><Badge value={r.status}/></div><div className="report-card-machine"><b className="mono">{r.machine_no_snapshot}</b><span>{r.machine_name_snapshot}</span></div><div className="report-card-problem"><b>{r.area_point_snapshot||"-"}</b><span>{r.symptom}</span></div><div className="report-card-chip-row"><span className="loss-pill mono">{r.loss_time_min||0} นาที</span><Badge value={r.severity}>{severityLabel(r.severity)}</Badge><span className="soft-chip">{r.production_line_snapshot||"ไม่ระบุไลน์"}</span></div><div className="report-card-footer"><span className="report-card-id mono">{r.id?.slice(0,8) || "-"}</span><span className="report-card-link">ดูรายละเอียด →</span></div></button>)}</div>
      <div className="pagination"><button className="btn ghost small" disabled={page===0||loading} onClick={()=>setPage(p=>Math.max(0,p-1))}>← ก่อนหน้า</button><span className="mono">{page*pageSize+1}-{Math.min(total,(page+1)*pageSize)} / {total}</span><button className="btn ghost small" disabled={(page+1)*pageSize>=total||loading} onClick={()=>setPage(p=>p+1)}>ถัดไป →</button></div>
    </>}
    {selected&&<ReportDetail row={selected} profile={profile} onClose={()=>setSelected(null)} onChanged={()=>{load();setSelected(null)}}/>}
  </div>;
}

export default function RepairModule({profile,viewMode,go}){
  const admin=profile.role==="admin";const mode=admin?"history":viewMode||"wizard";
  return <div className="stack repair-module"><section className={`hero repair-hero ${mode==="history"?"history-hero":""}`}><div className="hero-kicker">{admin?"REPAIR REPORT CONTROL":"TECHNICIAN PORTAL"}</div><h1>{admin?"รายงานซ่อม":mode==="history"?"ประวัติการกรอก":"กรอกรายงานซ่อมบำรุง"}</h1><p>{admin?"ตรวจสอบ ค้นหา แก้ไข และติดตามประวัติงานซ่อมทุกแผนก":mode==="history"?"ค้นหาและติดตามประวัติงานซ่อมของแผนก":"กรอกทีละขั้น ใช้งานง่าย และลดข้อมูลผิดพลาดบนมือถือ"}</p><div className="hero-meta"><span className="hero-chip">{profile.full_name}</span><span className="hero-chip mono">{profile.departments?.dept_code||"ALL"}</span>{profile.shift&&<span className="hero-chip mono">Shift {profile.shift}</span>}</div></section>
    {mode==="wizard"&&!admin?<Wizard profile={profile} onSaved={()=>go?.("history")}/>:<History profile={profile}/>} 
  </div>;
}
