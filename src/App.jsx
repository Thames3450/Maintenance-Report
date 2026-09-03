import React, { useEffect, useMemo, useState } from "react";
import {
  isConfigured, loadMyProfile, loginAdmin, loginTechnician, requireSupabase, resetLocalSession, signOut,
  formatThaiDate, localDateISO, localDayStartUTC, localNextDayStartUTC
} from "../core.js";
import { Icon, Loading, ErrorState } from "./components/UI.jsx";
import RepairModule from "../repair.js";
import PMModule from "../pm.js";
import KPIModule from "../kpi.js";
import AdminModule from "../admin.js";

const TECH_NAV=[
  {key:"repair",label:"กรอกรายงาน",icon:"report"},
  {key:"history",label:"ประวัติ",icon:"history"},
  {key:"pm",label:"งาน PM",icon:"pm"}
];
const ADMIN_NAV=[
  {key:"home",label:"Dashboard",icon:"dashboard"},
  {key:"repair",label:"รายงานซ่อม",icon:"report"},
  {key:"pm",label:"PM/TPM",icon:"pm"},
  {key:"kpi",label:"KPI",icon:"kpi"},
  {key:"admin",label:"จัดการระบบ",icon:"admin"}
];

function useHashRoute(){
  const get=()=>location.hash.replace(/^#\/?/,"")||"home";
  const [route,setRoute]=useState(get);
  useEffect(()=>{const h=()=>setRoute(get());addEventListener("hashchange",h);return()=>removeEventListener("hashchange",h)},[]);
  const go=(key)=>{location.hash=`#/${key}`};
  return [route,go];
}

function Login({notice=""}){
  const [mode,setMode]=useState("technician"),[code,setCode]=useState(""),[password,setPassword]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(e){
    e.preventDefault();setError("");setBusy(true);
    try{mode==="technician"?await loginTechnician(code):await loginAdmin(code,password)}
    catch(err){setError(err.message||"เข้าสู่ระบบไม่สำเร็จ")}
    finally{setBusy(false)}
  }
  return <div className="auth-page"><div className="auth-card">
    <div className="auth-brand"><div className="auth-mark"><Icon name="repair" size={30}/></div><div><h1>MVR Smart Maintenance</h1><small>MAINTENANCE MANAGEMENT SYSTEM</small></div></div>
    <div className="auth-tabs"><button type="button" className={mode==="technician"?"active":""} onClick={()=>{setMode("technician");setError("")}}>ช่างซ่อมบำรุง</button><button type="button" className={mode==="admin"?"active":""} onClick={()=>{setMode("admin");setError("")}}>ผู้ดูแลระบบ</button></div>
    <span className="auth-badge">{mode==="technician"?"ใช้รหัสพนักงานเพียงอย่างเดียว":"บัญชีผู้ดูแลระบบ"}</span>
    <h2 className="auth-title">{mode==="technician"?"เริ่มงานได้ทันที":"Admin Control Center"}</h2>
    <p className="auth-desc">{mode==="technician"?"กรอกรหัสพนักงาน ระบบจะตรวจสอบสิทธิ์ Technician + Active และเข้าสู่ระบบให้อัตโนมัติ":"เข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านของ Admin"}</p>
    <form onSubmit={submit}>
      <label>{mode==="technician"?"รหัสพนักงาน":"ชื่อผู้ใช้"}</label>
      <input className={`auth-input ${mode==="technician"?"mono":""}`} value={code} onChange={e=>setCode(e.target.value)} inputMode={mode==="technician"?"numeric":"text"} autoComplete={mode==="admin"?"username":"off"} placeholder={mode==="technician"?"กรอกรหัสพนักงาน":"ชื่อผู้ใช้"}/>
      {mode==="admin"&&<><label>รหัสผ่าน</label><input className="auth-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" placeholder="รหัสผ่าน"/></>}
      {notice&&<div className="auth-notice"><Icon name="warning" size={17}/><span>{notice}</span></div>}
      {error&&<div className="auth-error">{error}</div>}
      <button className="auth-submit" disabled={busy}>{busy?"กำลังตรวจสอบ…":"เข้าสู่ระบบ"}</button>
    </form>
    <p className="auth-foot">Supabase Auth · Row Level Security · Private Storage</p>
  </div></div>;
}

function Home({profile,go}){
  const [state,setState]=useState({loading:true,error:"",stats:null});
  const admin=profile.role==="admin";
  async function load(){
    setState({loading:true,error:"",stats:null});
    try{
      const sb=requireSupabase(),today=localDateISO(),todayStart=localDayStartUTC(today),tomorrowStart=localNextDayStartUTC(today),soon=new Date();
      soon.setDate(soon.getDate()+7);const soonISO=localDateISO(soon);
      const [repToday,repOpen,pmToday,pmSoon,pmIssue]=await Promise.all([
        sb.from("repair_reports").select("id",{count:"exact",head:true}).is("deleted_at",null).gte("started_at",todayStart).lt("started_at",tomorrowStart),
        sb.from("repair_reports").select("id",{count:"exact",head:true}).is("deleted_at",null).in("status",["no_parts","follow_up"]),
        sb.from("pm_schedule").select("id",{count:"exact",head:true}).eq("due_date",today),
        sb.from("pm_schedule").select("id",{count:"exact",head:true}).gte("due_date",today).lte("due_date",soonISO).eq("status","planned"),
        sb.from("pm_schedule").select("id",{count:"exact",head:true}).eq("overall_result","issue")
      ]);
      const errs=[repToday,repOpen,pmToday,pmSoon,pmIssue].map(x=>x.error).filter(Boolean);if(errs[0])throw errs[0];
      setState({loading:false,error:"",stats:{repairToday:repToday.count||0,pmToday:pmToday.count||0,today:(repToday.count||0)+(pmToday.count||0),pending:repOpen.count||0,abnormal:pmIssue.count||0,dueSoon:pmSoon.count||0}});
    }catch(e){setState({loading:false,error:e.message||"โหลดภาพรวมไม่สำเร็จ",stats:null})}
  }
  useEffect(()=>{load()},[]);
  if(state.loading)return <Loading/>;if(state.error)return <ErrorState message={state.error} onRetry={load}/>;
  const cards=admin?[
    ["repair","รายงานซ่อม","ดู ค้นหา แก้ไข และติดตามงานซ่อมทุกแผนก","report"],
    ["admin","เครื่องจักรและทีมช่าง","จัดการเครื่อง กลุ่มเครื่อง ช่าง และทีมตามแผนก","team"],
    ["pm","แผน PM / TPM","วางแผนและตรวจติดตามงาน Preventive Maintenance","pm"],
    ["kpi","KPI และรายงาน","Downtime, MTTR, MTBF, Availability และ Pareto","kpi"]
  ]:[
    ["repair","กรอกรายงานซ่อม","เลือกกลุ่มเครื่อง → Machine No. → ปัญหา → รายละเอียด","report"],
    ["pm","งาน PM / TPM","ดูงานวันนี้ สัปดาห์ เดือน ปี และทำ Checklist","pm"]
  ];
  return <div className="stack">
    <section className="hero"><div className="hero-kicker">MVR SMART MAINTENANCE · {formatThaiDate(new Date(),{weekday:"long"})}</div><h1>{admin?"Maintenance Control Center":`สวัสดี, ${profile.full_name}`}</h1><p>{admin?"ภาพรวมงานซ่อม PM/TPM เครื่องจักร และทีมช่างจากข้อมูลจริง":"เลือกงานที่ต้องทำและบันทึกข้อมูลหน้างานได้จากมือถือ"}</p><div className="hero-meta"><span className="hero-chip">{admin?"ผู้ดูแลระบบ":"ช่างซ่อมบำรุง"}</span><span className="hero-chip mono">{profile.departments?.dept_code||"-"}</span>{profile.shift&&<span className="hero-chip mono">Shift {profile.shift}</span>}</div></section>
    <div className="section-title"><div><h2>ภาพรวมวันนี้</h2><p>ข้อมูลตามสิทธิ์ของบัญชีและแผนก</p></div></div>
    <div className="kpi-grid"><div className="kpi-card"><div className="kpi-label">งานวันนี้</div><div className="kpi-value">{state.stats.today}</div><div className="kpi-sub">Repair {state.stats.repairToday} · PM {state.stats.pmToday}</div></div><div className="kpi-card warn"><div className="kpi-label">งานซ่อมค้าง</div><div className="kpi-value">{state.stats.pending}</div><div className="kpi-sub">ยังไม่เสร็จ</div></div><div className="kpi-card danger"><div className="kpi-label">PM พบปัญหา</div><div className="kpi-value">{state.stats.abnormal}</div><div className="kpi-sub">ต้องติดตาม</div></div><div className="kpi-card purple"><div className="kpi-label">ใกล้ครบกำหนด</div><div className="kpi-value">{state.stats.dueSoon}</div><div className="kpi-sub">ภายใน 7 วัน</div></div></div>
    <div className="section-title"><div><h2>{admin?"ศูนย์บริหารระบบ":"พื้นที่ทำงาน"}</h2><p>{admin?"Admin ไม่ต้องกรอกรายงานซ่อมของช่าง":"เมนูสำหรับงานหน้างานของคุณ"}</p></div></div>
    <div className="grid grid-2">{cards.map(([key,title,desc,icon])=><button key={key} className={`card menu-card ${key}`} onClick={()=>go(key)} style={{textAlign:"left"}}><div className="menu-card-top"><span className="menu-card-ico"><Icon name={icon}/></span><Icon name="chevron" size={18}/></div><div><h3>{title}</h3><p>{desc}</p></div><span className="menu-card-go">เปิดเมนู →</span></button>)}</div>
  </div>;
}

export default function App(){
  const [route,go]=useHashRoute(),[session,setSession]=useState(undefined),[profile,setProfile]=useState(null),[error,setError]=useState(""),[authNotice,setAuthNotice]=useState("");
  useEffect(()=>{
    if(!isConfigured){setSession(null);return}
    let mounted=true;const sb=requireSupabase();
    sb.auth.getSession().then(({data,error})=>{if(!mounted)return;if(error){setSession(null);setAuthNotice("เซสชันเดิมใช้งานไม่ได้ กรุณาเข้าสู่ระบบใหม่");return}setSession(data.session||null)}).catch(()=>{if(mounted){setSession(null);setAuthNotice("ไม่สามารถตรวจสอบเซสชันเดิมได้ กรุณาเข้าสู่ระบบใหม่")}});
    const {data:sub}=sb.auth.onAuthStateChange((_e,s)=>{if(mounted)setSession(s||null)});
    return()=>{mounted=false;sub.subscription.unsubscribe()}
  },[]);
  useEffect(()=>{
    let ok=true;
    if(!session){setProfile(null);setError("");return()=>{ok=false}}
    setProfile(null);setError("");
    loadMyProfile({timeoutMs:8000}).then(p=>{if(!ok)return;if(!p){const e=new Error("ไม่พบโปรไฟล์ผู้ใช้งาน");e.code="PROFILE_NOT_FOUND";throw e}setProfile(p);setAuthNotice("")}).catch(async e=>{
      if(!ok)return;
      const stale=["PROFILE_NOT_FOUND","PROFILE_DISABLED","AUTH_TIMEOUT"].includes(e?.code)||/JWT|token|session|เซสชัน/i.test(e?.message||"");
      if(stale){
        await resetLocalSession();
        if(ok){setProfile(null);setError("");setAuthNotice("ระบบล้างเซสชันเดิมให้แล้ว กรุณาเข้าสู่ระบบใหม่ด้วยรหัสพนักงานปัจจุบัน");setSession(null);location.hash=""}
      }else{setError(e?.message||"โหลดสิทธิ์ผู้ใช้งานไม่สำเร็จ");setProfile(null)}
    });
    return()=>{ok=false}
  },[session?.user?.id]);
  const admin=profile?.role==="admin";const allowed=useMemo(()=>admin?ADMIN_NAV:TECH_NAV,[admin]);
  useEffect(()=>{if(profile&&!allowed.some(n=>n.key===route))go(admin?"home":"repair")},[profile,route,admin]);
  async function logout(){await signOut();location.hash=""}
  if(!isConfigured)return <div className="state"><div className="state-box"><h3>ยังไม่ได้ตั้งค่า Supabase</h3><p>ไม่พบค่าการเชื่อมต่อใน <span className="mono">.env</span></p></div></div>;
  if(session===undefined)return <Loading text="กำลังตรวจสอบเซสชัน…"/>;
  if(!session)return <Login notice={authNotice}/>;
  if(error)return <ErrorState message={error}/>;
  if(!profile)return <Loading text="กำลังโหลดสิทธิ์ผู้ใช้งาน…"/>;
  const safeRoute=admin?route:(["repair","history","pm"].includes(route)?route:"repair");
  const View=(safeRoute==="repair"||safeRoute==="history")?RepairModule:safeRoute==="pm"?PMModule:safeRoute==="kpi"?KPIModule:safeRoute==="admin"?AdminModule:null;
  return <div className={`page ${admin?"admin-portal":"tech-portal"}`}><header className="topbar"><button className="brand" onClick={()=>go(admin?"home":"repair")} style={{border:0,background:"transparent",padding:0,cursor:"pointer"}}><span className="brand-mark"><Icon name="repair" size={28}/></span><span className="brand-text"><span className="brand-title">MVR Smart Maintenance</span><span className="brand-sub">MAINTENANCE SYSTEM</span></span></button><nav className="desktop-nav">{allowed.map(n=><button key={n.key} className={safeRoute===n.key?"active":""} onClick={()=>go(n.key)}><Icon name={n.icon} size={20}/><span>{n.label}</span></button>)}</nav><div className="top-actions"><div className="user-chip"><div className="avatar">{profile.full_name?.trim()?.slice(0,1)||"?"}</div><div><div className="user-name">{profile.full_name}</div><div className="user-meta">{admin?"Admin":"Technician"} · {profile.departments?.dept_code||"-"}{profile.shift?` · ${profile.shift}`:""}</div></div></div><button className="icon-btn" onClick={logout} aria-label="ออกจากระบบ"><Icon name="logout" size={18}/></button></div></header>
  <main className="content">{safeRoute==="home"&&admin?<Home profile={profile} go={go}/>:<View profile={profile} go={go} viewMode={safeRoute==="history"?"history":safeRoute==="repair"?"wizard":undefined}/>}</main>
  <nav className="bottom-nav">{allowed.map(n=><button key={n.key} className={safeRoute===n.key?"active":""} onClick={()=>go(n.key)}><span className="nav-ico"><Icon name={n.icon} size={18}/></span><span>{n.label}</span></button>)}</nav><div id="toast-root"/></div>;
}
