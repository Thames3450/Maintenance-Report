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

function blankForm(){
  return {
    repair_date:localDateISO(), group_id:"", machine_id:"", area_point_id:"", area_point_text:"",
    problem_id:"", symptom:"", problem_type:"", cause_id:"", cause:"", action_id:"", action_taken:"",
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
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[validationIssues,setValidationIssues]=useState([]);

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
        sb.from("problems").select("id,problem_code,problem_name,breakdown_type,department_code,is_active").eq("is_active",true).order("problem_name"),
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
  function chooseGroup(id){setValidationIssues([]);setForm(f=>({...f,group_id:id,machine_id:"",area_point_id:"",problem_id:"",cause_id:"",action_id:""}));setQuery("");setStep(2)}
  function chooseMachine(id){setValidationIssues([]);setForm(f=>({...f,machine_id:id,area_point_id:"",problem_id:"",cause_id:"",action_id:""}));setQuery("");setStep(3)}

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
    setValidationIssues([]);setBusy(true);
    const uploaded=[];
    try{
      const sb=requireSupabase();
      const {data:auth}=await sb.auth.getUser();if(!auth?.user)throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      const reportId=crypto.randomUUID();
      for(const [type,file] of Object.entries(files)){
        if(!file)continue;
        const path=await uploadRepairImage({userId:auth.user.id,reportId,file});
        uploaded.push({image_type:type,file_name:file.name,file_path:path});
      }
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
      await rpc("mvr_create_repair_report",{p_report:payload,p_images:uploaded});
      setForm(blankForm());setFiles({Before:null,Evidence:null,After:null});setValidationIssues([]);setStep(1);setMessage("บันทึกรายงานซ่อมเรียบร้อย");
      onSaved?.();
    }catch(e){
      if(uploaded.length){try{await requireSupabase().storage.from("maintenance-media").remove(uploaded.map(x=>x.file_path))}catch{}}
      setMessage(e.message||"บันทึกรายงานซ่อมไม่สำเร็จ");
    }finally{setBusy(false)}
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
            {!machineProblems.length?<Empty title="ยังไม่มีอาการเสียสำหรับเครื่องนี้" text="Admin ยังไม่ได้กำหนด Problem ให้เครื่องนี้ จึงไม่มีตัวเลือกและไม่สามารถพิมพ์เองได้"/>:<div className="field"><SearchSelect className="professional-select" value={form.problem_id} onChange={v=>patch("problem_id",v)} placeholder="เลือกอาการเสีย" searchPlaceholder="พิมพ์ค้นหาอาการเสีย…" options={machineProblems.map(p=>({value:p.id,label:p.problem_name,sub:p.breakdown_type||""}))}/></div>}
            {(selectedProblem||form.problem_id)&&<div className="selected-preview-card accent"><span>อาการที่เลือก</span><b>{selectedProblem?.problem_name||"-"}</b>{selectedProblem?.breakdown_type&&<small>{selectedProblem.breakdown_type}</small>}</div>}
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
        <div className="upload-grid">{[["Before","ก่อนซ่อม"],["Evidence","จุดเสีย"],["After","หลังซ่อม"]].map(([type,label])=>{const f=files[type];const url=f?URL.createObjectURL(f):"";const missing=validationIssues.some(x=>x.step===5&&x.label.includes(label));return <label className={`upload-box modern required ${f?"has-file":""} ${missing?"missing":""}`} key={type}>{f?<><img className="upload-preview" src={url} alt={label}/><button type="button" className="upload-remove" onClick={e=>{e.preventDefault();e.stopPropagation();setFiles(x=>({...x,[type]:null}))}}><Icon name="close" size={14}/> ลบรูป</button><div className="upload-caption">{label} · แนบแล้ว</div></>:<div className="upload-placeholder"><Icon name="image"/><b>{label} <span className="req">*</span></b><span>แตะเพื่อถ่ายหรือเลือกรูป</span><small>จำเป็นต้องแนบ</small></div>}<input type="file" accept="image/*" capture="environment" onChange={e=>{setFiles(x=>({...x,[type]:e.target.files?.[0]||null}))}}/></label>})}</div>
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

    <div className="wizard-actions">
      {step>1?<button type="button" className="btn ghost" onClick={back}><span>←</span> ย้อนกลับ</button>:<button type="button" className="btn ghost" onClick={()=>{setForm(blankForm());setFiles({Before:null,Evidence:null,After:null});setValidationIssues([]);setQuery("")}}>ล้าง</button>}
      {step<6?<button type="button" className="btn primary" onClick={next}>ถัดไป <span>→</span></button>:<button type="button" className="btn primary" disabled={busy} onClick={submit}><Icon name="save" size={17}/>{busy?"กำลังบันทึก…":"บันทึกรายงานซ่อม"}</button>}
    </div>
  </div>;
}

function thaiTime(value){
  if(!value)return "-";
  try{return new Date(value).toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Asia/Bangkok"})}catch{return "-"}
}

function ReportDetail({row,profile,onClose,onChanged}){
  const admin=profile.role==="admin";
  const [images,setImages]=useState([]),[loading,setLoading]=useState(true),[lightbox,setLightbox]=useState(null),[edit,setEdit]=useState({status:row.status,severity:row.severity,remark:row.remark||"",cause:row.cause||"",action_taken:row.action_taken||"",finished_at:row.finished_at?new Date(row.finished_at).toISOString().slice(0,16):""}),[busy,setBusy]=useState(false),[msg,setMsg]=useState("");
  useEffect(()=>{(async()=>{try{const sb=requireSupabase();const {data,error}=await sb.from("repair_images").select("id,image_type,file_name,file_path,public_url").eq("repair_report_id",row.id).order("created_at");if(error)throw error;const out=[];for(const x of data||[]){const direct=typeof x.public_url==="string"&&/^https?:\/\//i.test(x.public_url)?x.public_url:"";out.push({...x,url:direct||await signedImageUrl(x.file_path,1200)})}setImages(out)}catch(e){setMsg(e.message)}finally{setLoading(false)}})()},[row.id]);
  async function save(){setBusy(true);setMsg("");try{const payload={status:edit.status,severity:edit.severity,remark:clean(edit.remark)||null,cause:clean(edit.cause),action_taken:clean(edit.action_taken)};if(edit.finished_at)payload.finished_at=new Date(`${edit.finished_at}:00+07:00`).toISOString();const {error}=await requireSupabase().from("repair_reports").update(payload).eq("id",row.id);if(error)throw error;setMsg("บันทึกการแก้ไขแล้ว");onChanged?.()}catch(e){setMsg(e.message||"บันทึกไม่สำเร็จ")}finally{setBusy(false)}}
  async function softDelete(){const reason=prompt("เหตุผลที่ลบรายงาน (Soft Delete)","");if(reason===null)return;setBusy(true);try{await rpc("mvr_soft_delete_repair",{p_report_id:row.id,p_reason:reason});onChanged?.();onClose()}catch(e){setMsg(e.message)}finally{setBusy(false)}}
  async function restore(){setBusy(true);try{await rpc("mvr_restore_repair",{p_report_id:row.id});onChanged?.();onClose()}catch(e){setMsg(e.message)}finally{setBusy(false)}}
  const detailItems=[
    ["วันที่ซ่อม",formatThaiDate(row.started_at)],["เครื่องจักร",`${row.machine_name_snapshot||"-"} | ${row.machine_no_snapshot||"-"}`],
    ["ไลน์ผลิต",row.production_line_snapshot||"-"],["จุดที่เสีย",row.area_point_snapshot||"-"],
    ["อาการที่เสีย",row.symptom||"-"],row.problem_type?["ประเภทงานเสีย",row.problem_type]:null,
    ["ระดับความรุนแรง",severityLabel(row.severity)],["Downtime",`${row.loss_time_min||0} นาที`],
    ["ผลหลังซ่อม",statusLabel(row.status)],["ช่างผู้ซ่อม",`${row.technician_name_snapshot||"-"}${row.technician_code_snapshot?` (${row.technician_code_snapshot})`:""}`],
    ["กะ",row.shift||"-"],["เลขที่รายงาน",row.record_no||row.id?.slice(0,8)?.toUpperCase()||"-"],
    ["อะไหล่ที่ใช้",row.spare_parts||"ไม่ระบุ"],["เวลาเริ่ม / จบ",row.time_missing?"ไม่ระบุเวลา":`${thaiTime(row.started_at)} - ${thaiTime(row.finished_at)}`]
  ].filter(Boolean);
  return <Modal title="รายละเอียดงานซ่อม" onClose={onClose}><div className="stack repair-detail-modal">
    <div className="detail-heading"><div><b>รายละเอียดงานซ่อม</b><span className="mono">{row.id?.slice(0,8)?.toUpperCase()||"REPAIR"}</span></div><Badge value={row.status}/></div>
    {msg&&<div className={`notice ${msg.includes("แล้ว")?"success":"danger"}`}>{msg}</div>}
    <div className="detail-grid">{detailItems.map(([label,value])=><div className={`detail-cell ${["อาการที่เสีย","ประเภทงานเสีย"].includes(label)?"wide-mobile":""}`} key={label}><span>{label}</span><b className={label.includes("Downtime")||label.includes("เวลา")?"mono":""}>{value}</b></div>)}</div>
    <div className="detail-wide"><span>สาเหตุ</span><b>{row.cause||"-"}</b></div>
    <div className="detail-wide"><span>การแก้ไข</span><b>{row.action_taken||"-"}</b></div>
    <div className="detail-wide"><span>หมายเหตุ</span><b>{row.remark||"-"}</b></div>
    <div className="detail-photos"><div className="detail-section-title"><b>รูปภาพการซ่อม</b><span>{images.length} รูป</span></div>{loading?<Loading text="กำลังเปิดรูป…"/>:!images.length?<Empty title="ไม่มีรูปแนบ" text="รายงานนี้ไม่มีรูปภาพการซ่อม"/>:!images.some(x=>x.url)?<Empty title="เปิดรูปไม่ได้" text="ระบบหารูปไม่เจอ หรือไฟล์เดิมอาจอยู่คนละรูปแบบพาธ"/>:<div className="image-gallery modern-gallery">{images.filter(x=>x.url).map(x=><button type="button" className="gallery-card" key={x.id} onClick={()=>setLightbox({url:x.url,label:x.image_type||x.file_name||"รูปซ่อม"})}><img src={x.url} alt={x.image_type||x.file_name||"รูปซ่อม"}/><span>{x.image_type||"รูปซ่อม"}</span></button>)}</div>}</div>
    {admin&&<div className="admin-edit-box"><CardTitle icon="edit" title="แก้ไขรายงาน" sub="ใช้เฉพาะกรณีตรวจสอบแล้วพบข้อมูลผิด"/><div className="field-grid cols-2"><div className="field"><label>สถานะ</label><SearchSelect value={edit.status} onChange={v=>setEdit(x=>({...x,status:v}))} searchable={false} options={STATUS_OPTIONS.map(([value,label])=>({value,label}))}/></div><div className="field"><label>ความรุนแรง</label><SearchSelect value={edit.severity} onChange={v=>setEdit(x=>({...x,severity:v}))} searchable={false} options={SEVERITY_OPTIONS.map(([value,label])=>({value,label}))}/></div><div className="field"><label>เวลาซ่อมเสร็จ</label><input className="input" type="datetime-local" value={edit.finished_at} onChange={e=>setEdit(x=>({...x,finished_at:e.target.value}))}/></div><div className="field full"><label>สาเหตุ</label><textarea className="textarea" value={edit.cause} onChange={e=>setEdit(x=>({...x,cause:e.target.value}))}/></div><div className="field full"><label>วิธีแก้ไข</label><textarea className="textarea" value={edit.action_taken} onChange={e=>setEdit(x=>({...x,action_taken:e.target.value}))}/></div><div className="field full"><label>หมายเหตุ</label><textarea className="textarea" value={edit.remark} onChange={e=>setEdit(x=>({...x,remark:e.target.value}))}/></div></div><div className="form-actions"><button className="btn primary" disabled={busy} onClick={save}>บันทึกการแก้ไข</button>{row.deleted_at?<button className="btn success" disabled={busy} onClick={restore}>คืนค่ารายงาน</button>:<button className="btn danger" disabled={busy} onClick={softDelete}>ลบแบบ Soft Delete</button>}</div></div>}
    {lightbox&&<div className="image-viewer-backdrop" onClick={()=>setLightbox(null)}><div className="image-viewer" onClick={e=>e.stopPropagation()}><button type="button" className="image-viewer-close" onClick={()=>setLightbox(null)}><Icon name="close" size={18}/></button><img src={lightbox.url} alt={lightbox.label}/><div className="image-viewer-caption">{lightbox.label}</div></div></div>}
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
    admin?sb.from("app_profiles").select("id,full_name,employee_code,department_id").eq("role","technician").order("full_name"):Promise.resolve({data:[],error:null}),
    admin?sb.from("departments").select("id,dept_code,dept_name").order("sort_order"):Promise.resolve({data:[],error:null})
  ]);for(const x of [m,t,d])if(x.error)throw x.error;setMachines(m.data||[]);setTechs(t.data||[]);setDepartments(d.data||[]);
    let q=sb.from("repair_reports").select("id,department_id,machine_id,technician_id,technician_name_snapshot,technician_code_snapshot,technician_photo_path_snapshot,record_no,shift,time_missing,machine_group_id,area_point_snapshot,symptom,problem_type,severity,cause,action_taken,spare_parts,status,started_at,finished_at,loss_time_min,remark,machine_no_snapshot,machine_name_snapshot,production_line_snapshot,deleted_at,delete_reason,created_at",{count:"exact"}).order("started_at",{ascending:false}).range(page*pageSize,page*pageSize+pageSize-1);
    if(filters.machine_id)q=q.eq("machine_id",filters.machine_id);if(filters.technician_id)q=q.eq("technician_id",filters.technician_id);if(filters.department_id)q=q.eq("department_id",filters.department_id);if(filters.status)q=q.eq("status",filters.status);if(filters.mine)q=q.eq("technician_id",profile.id);if(filters.from)q=q.gte("started_at",localDayStartUTC(filters.from));if(filters.to)q=q.lt("started_at",localNextDayStartUTC(filters.to));if(admin&&filters.show_deleted)q=q.not("deleted_at","is",null);else q=q.is("deleted_at",null);if(filters.q){const term=filters.q.replaceAll(","," ");q=q.or(`symptom.ilike.%${term}%,cause.ilike.%${term}%,action_taken.ilike.%${term}%,machine_name_snapshot.ilike.%${term}%,machine_no_snapshot.ilike.%${term}%,area_point_snapshot.ilike.%${term}%,technician_name_snapshot.ilike.%${term}%,technician_code_snapshot.ilike.%${term}%,record_no.ilike.%${term}%`)}
    const {data,error,count}=await q;if(error)throw error;const list=data||[];setTotal(count||0);const paths=[...new Set(list.map(r=>r.technician_photo_path_snapshot).filter(Boolean))],urls={};await Promise.all(paths.map(async p=>{urls[p]=await signedImageUrl(p)}));setRows(list.map(r=>({...r,technician_photo_url:urls[r.technician_photo_path_snapshot]||""})));}
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
      <div className="toolbar-options">{!admin&&<label className="inline-check"><input type="checkbox" checked={filters.mine} onChange={e=>setFilters(f=>({...f,mine:e.target.checked}))}/> เฉพาะงานของฉัน</label>}{admin&&<label className="inline-check"><input type="checkbox" checked={filters.show_deleted} onChange={e=>setFilters(f=>({...f,show_deleted:e.target.checked}))}/> แสดง Soft Deleted เท่านั้น</label>}</div></>}
    </div>
    {loading?<Loading/>:error?<ErrorState message={error} onRetry={load}/>:!rows.length?<Empty title="ไม่พบรายงานซ่อม" text="ลองเปลี่ยนคำค้นหาหรือช่วงวันที่"/>:<>
      <div className="history-table-wrap premium-table-shell"><div className="history-table-caption"><div><span className="table-caption-dot"/><b>รายการงานซ่อม</b><small>แสดง {rows.length} รายการในหน้านี้</small></div><span className="history-count"><b className="mono">{total}</b> รายการทั้งหมด</span></div><table className="history-table premium"><thead><tr><th>วันที่ / เวลา</th><th>เครื่องจักร</th><th>จุดที่เสีย / อาการ</th><th>Downtime</th><th>ช่างผู้ซ่อม</th><th>สถานะ</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id} className={r.deleted_at?"deleted":""}><td><div className="table-date-cell"><span className="table-date-icon"><Icon name="calendar" size={17}/></span><div><b>{formatThaiDate(r.started_at)}</b><small><span className="mono">{r.time_missing?"ไม่ระบุเวลา":thaiTime(r.started_at)}</span> · <span className="mono table-report-id">{r.record_no||r.id.slice(0,8)}</span></small></div></div></td><td><div className="table-machine-cell"><span className="table-machine-icon"><Icon name="machine" size={18}/></span><div><b className="mono">{r.machine_no_snapshot}</b><small>{r.machine_name_snapshot}</small>{r.production_line_snapshot&&<span className="table-line-chip">{r.production_line_snapshot}</span>}</div></div></td><td><div className="table-problem-cell"><b>{r.area_point_snapshot||"-"}</b><span>{r.symptom||"-"}</span><small>{r.problem_type||""}</small></div></td><td><div className="table-loss-stack"><span className={`loss-pill mono ${(r.loss_time_min||0)>=60?"high":""}`}>{r.loss_time_min||0} นาที</span><small>{(r.loss_time_min||0)>=60?"Downtime สูง":"Downtime"}</small></div></td><td><div className="table-tech premium"><Avatar name={r.technician_name_snapshot} pathUrl={r.technician_photo_url} size={38}/><span><b>{r.technician_name_snapshot}</b><small>{r.technician_code_snapshot?`${r.technician_code_snapshot}${r.shift?` · กะ ${r.shift}`:""}`:(profile.role==="admin"?"Technician":"งานของแผนก")}</small></span></div></td><td><div className="table-status-stack"><Badge value={r.status}/><span className={`severity-mini ${r.severity}`}>{severityLabel(r.severity)}</span></div></td><td><button className="table-detail-btn" onClick={()=>setSelected(r)}><span>รายละเอียด</span><Icon name="chevron" size={15}/></button></td></tr>)}</tbody></table></div>
      <div className="report-card-list mobile-history-cards">{rows.map(r=><button type="button" className={`report-card luxury ${r.deleted_at?"deleted":""}`} key={r.id} onClick={()=>setSelected(r)}><div className="report-card-top"><div className="report-card-tech"><Avatar name={r.technician_name_snapshot} pathUrl={r.technician_photo_url} size={44}/><div><b>{r.technician_name_snapshot}</b><small>{r.time_missing?`${formatThaiDate(r.started_at)} · ไม่ระบุเวลา`:formatThaiDateTime(r.started_at)}</small></div></div><Badge value={r.status}/></div><div className="report-card-machine"><b className="mono">{r.machine_no_snapshot}</b><span>{r.machine_name_snapshot}</span></div><div className="report-card-problem"><b>{r.area_point_snapshot||"-"}</b><span>{r.symptom}</span></div><div className="report-card-chip-row"><span className="loss-pill mono">{r.loss_time_min||0} นาที</span><Badge value={r.severity}>{severityLabel(r.severity)}</Badge><span className="soft-chip">{r.production_line_snapshot||"ไม่ระบุไลน์"}</span></div><div className="report-card-footer"><span className="report-card-id mono">{r.id?.slice(0,8) || "-"}</span><span className="report-card-link">ดูรายละเอียด →</span></div></button>)}</div>
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
