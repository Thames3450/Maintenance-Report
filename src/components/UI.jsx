import React, { useEffect, useMemo, useRef, useState } from "react";
import { initials, statusLabel } from "../../core.js";

const iconFiles = Object.freeze({
  home:"House-Chimney-1--Streamline-Ultimate.png",
  repair:"Hammer-Wrench--Streamline-Ultimate.png",
  pm:"Calendar-Check-1--Streamline-Ultimate.png",
  kpi:"Performance-Increase-2--Streamline-Ultimate.png",
  admin:"Cog-3--Streamline-Ultimate.png",
  logout:"Logout--Streamline-Ultimate.png",
  plus:"List-Add--Streamline-Ultimate.png",
  search:"Search-Bar-1--Streamline-Ultimate.png",
  machine:"Cog-1--Streamline-Ultimate.png",
  alert:"Alert-Triangle--Streamline-Ultimate.png",
  clock:"Time-Clock-Circle--Streamline-Ultimate.png",
  history:"Time-Clock-Circle--Streamline-Ultimate.png",
  image:"Harddrive-Upload--Streamline-Ultimate.png",
  check:"Check-Circle-1--Streamline-Ultimate.png",
  close:"Remove-Circle--Streamline-Ultimate.png",
  refresh:"Synchronize-Arrow-1--Streamline-Ultimate.png",
  user:"Single-Neutral-Actions-Edit-1--Streamline-Ultimate.png",
  team:"Multiple-Circle--Streamline-Ultimate.png",
  group:"Hierarchy-5--Streamline-Ultimate.png",
  filter:"Settings-Horizontal--Streamline-Ultimate.png",
  edit:"Pencil-Write--Streamline-Ultimate.png",
  trash:"Delete-2--Streamline-Ultimate.png",
  calendar:"Calendar--Streamline-Ultimate.png",
  list:"Checklist--Streamline-Ultimate.png",
  report:"Time-Clock-File--Streamline-Ultimate.png",
  save:"Database-Check--Streamline-Ultimate.png",
  play:"Login-3--Streamline-Ultimate.png",
  dashboard:"Layout-Dashboard--Streamline-Ultimate.png",
  warning:"Calendar-Warning--Streamline-Ultimate.png",
  checklist:"Task-Checklist-Add--Streamline-Ultimate.png",
  spare:"Time-Clock-File-Add--Streamline-Ultimate.png",
  download:"Harddrive-Download-1--Streamline-Ultimate.png",
  send:"Share-1--Streamline-Ultimate.png",
  bell:"Alarm-Bell-Ring-1--Streamline-Ultimate.png"
});

const vectorPaths = {
  chevron:<path d="m9 18 6-6-6-6"/>
};

function iconAsset(name){
  const file=iconFiles[name];
  if(!file)return "";
  const base=String(import.meta.env.BASE_URL||"./");
  return `${base}icons/streamline/${file}`;
}

export function Icon({name,size=20,className=""}){
  const src=iconAsset(name);
  if(src)return <img className={`streamline-icon ${className}`.trim()} src={src} width={size} height={size} alt="" aria-hidden="true" draggable="false"/>;
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{vectorPaths[name]||vectorPaths.chevron}</svg>;
}


export function SearchSelect({
  value, onChange, options=[], placeholder="เลือกข้อมูล", searchPlaceholder="พิมพ์ค้นหา…",
  labelKey="label", valueKey="value", subKey="sub", disabled=false, searchable=true, className=""
}){
  const [open,setOpen]=useState(false),[query,setQuery]=useState("");
  const [mobileMode,setMobileMode]=useState(()=>typeof window!=="undefined"&&window.matchMedia?.("(max-width:599px)").matches);
  const root=useRef(null);
  const normalized=options.map(o=>typeof o==="string"?{value:o,label:o}:o);
  const selected=normalized.find(o=>String(o[valueKey])===String(value));
  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!q)return normalized;
    return normalized.filter(o=>`${o[labelKey]??""} ${o[subKey]??""}`.toLowerCase().includes(q));
  },[query,options,labelKey,subKey]);
  useEffect(()=>{
    const mq=window.matchMedia?.("(max-width:599px)");
    if(!mq)return;
    const sync=()=>setMobileMode(mq.matches);
    sync();mq.addEventListener?.("change",sync);
    return()=>mq.removeEventListener?.("change",sync);
  },[]);
  useEffect(()=>{
    const close=e=>{if(root.current&&!root.current.contains(e.target))setOpen(false)};
    const esc=e=>{if(e.key==="Escape")setOpen(false)};
    document.addEventListener("mousedown",close);document.addEventListener("keydown",esc);
    return()=>{document.removeEventListener("mousedown",close);document.removeEventListener("keydown",esc)};
  },[]);
  useEffect(()=>{
    if(!open||!mobileMode)return;
    const body=document.body,html=document.documentElement,scrollY=window.scrollY;
    const prev={position:body.style.position,top:body.style.top,width:body.style.width,overflow:body.style.overflow,htmlOverflow:html.style.overflow};
    body.style.position="fixed";body.style.top=`-${scrollY}px`;body.style.width="100%";body.style.overflow="hidden";html.style.overflow="hidden";
    return()=>{body.style.position=prev.position;body.style.top=prev.top;body.style.width=prev.width;body.style.overflow=prev.overflow;html.style.overflow=prev.htmlOverflow;window.scrollTo(0,scrollY)};
  },[open,mobileMode]);
  function closeMenu(){setOpen(false);setQuery("")}
  function choose(v){onChange?.(v);closeMenu()}
  return <div ref={root} className={`smart-select ${open?"open":""} ${disabled?"disabled":""} ${className}`.trim()}>
    <button type="button" className="smart-select-trigger" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={()=>!disabled&&(open?closeMenu():setOpen(true))}>
      <span className={`smart-select-value ${selected?"":"placeholder"}`}>{selected?.[labelKey]||placeholder}</span>
      {selected?.[subKey]&&<span className="smart-select-sub">{selected[subKey]}</span>}
      <span className="smart-select-chevron" aria-hidden="true"><Icon name="chevron" size={18}/></span>
    </button>
    {open&&<div className="smart-select-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)closeMenu()}}>
      <div className="smart-select-menu" onMouseDown={e=>e.stopPropagation()}>
        <div className="smart-select-sheet-head"><div><span>เลือกข้อมูล</span><b>{placeholder}</b></div><button type="button" className="smart-select-sheet-close" onClick={closeMenu} aria-label="ปิดรายการ"><Icon name="close" size={19}/></button></div>
        {searchable&&<div className="smart-select-search"><Icon name="search" size={17}/><input autoFocus={!mobileMode} value={query} onChange={e=>setQuery(e.target.value)} placeholder={searchPlaceholder}/>{query&&<button type="button" className="smart-select-clear" onClick={()=>setQuery("")} aria-label="ล้างคำค้นหา">×</button>}</div>}
        <div className="smart-select-options" role="listbox" aria-label={placeholder}>
          {!filtered.length?<div className="smart-select-empty">ไม่พบรายการที่ค้นหา</div>:filtered.map((o,i)=>{
            const v=o[valueKey],active=String(v)===String(value);
            return <button type="button" role="option" aria-selected={active} className={`smart-select-option ${active?"active":""}`} key={`${v}-${i}`} onClick={()=>choose(v)}>
              <span><b>{o[labelKey]}</b>{o[subKey]&&<small>{o[subKey]}</small>}</span>{active&&<Icon name="check" size={18}/>}
            </button>;
          })}
        </div>
        {mobileMode&&<div className="smart-select-sheet-foot"><span>{filtered.length.toLocaleString("th-TH")} รายการ</span><small>เลื่อนรายการด้านบนได้โดยเมนูจะไม่ปิด</small></div>}
      </div>
    </div>}
  </div>;
}

export function Loading({text="กำลังโหลดข้อมูล…"}){return <div className="state"><div className="state-box"><div className="spinner" style={{margin:"0 auto 14px"}}/><p>{text}</p></div></div>}
export function Empty({title="ยังไม่มีข้อมูล",text="เมื่อมีข้อมูล ระบบจะแสดงรายการในหน้านี้"}){return <div className="state"><div className="state-box"><div className="state-icon"><Icon name="list"/></div><h3>{title}</h3><p>{text}</p></div></div>}
export function ErrorState({message,onRetry}){return <div className="state"><div className="state-box"><div className="state-icon" style={{background:"#FDECEF",color:"#B82E42"}}><Icon name="alert"/></div><h3>โหลดข้อมูลไม่สำเร็จ</h3><p>{message||"เกิดข้อผิดพลาด กรุณาลองใหม่"}</p>{onRetry&&<button className="btn ghost" style={{marginTop:14}} onClick={onRetry}><Icon name="refresh" size={16}/>ลองใหม่</button>}</div></div>}
export function Badge({value,children}){return <span className={`badge ${value||""}`}>{children||statusLabel(value)}</span>}
export function Avatar({name,pathUrl,size=34}){return pathUrl?<img src={pathUrl} alt={name||"ช่าง"} style={{width:size,height:size,borderRadius:11,objectFit:"cover",background:"#EDF2FF"}}/>:<div className="avatar" style={{width:size,height:size}}>{initials(name)}</div>}
export function CardTitle({icon,title,sub}){return <div className="card-title"><div className="card-title-ico"><Icon name={icon}/></div><div><h3>{title}</h3>{sub&&<p>{sub}</p>}</div></div>}
export function Modal({title,onClose,children}){return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose?.()}}><div className="modal"><div className="modal-head"><h3>{title}</h3><button className="modal-close" onClick={onClose} aria-label="ปิด"><Icon name="close"/></button></div><div className="modal-body">{children}</div></div></div>}
