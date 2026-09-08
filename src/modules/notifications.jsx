import React,{useEffect,useMemo,useState} from "react";
import {formatThaiDateTime,requireSupabase} from "../../core.js";
import {Empty,ErrorState,Icon,Loading} from "../components/UI.jsx";
import {dispatchMaintenanceNotification,ensureNotificationPreference,pushSupported,registerPushSubscription,unregisterPushSubscription} from "../notifications.js";

const DEFAULT_PREF={push_enabled:true,urgent_work:true,planned_work:true,improvement_work:false,pm_reminders:true,overdue:true,spare_updates:true,spare_new:true,quiet_hours_enabled:false,quiet_start:"22:00",quiet_end:"06:00"};
const PREFS=[
  ["urgent_work","งานเร่งด่วน","Urgent work"],
  ["planned_work","งานตามแผน","Planned work"],
  ["improvement_work","งานปรับปรุง","Improvement"],
  ["spare_updates","อัปเดตอะไหล่ที่แจ้ง","Spare request update"],
  ["spare_new","คำขออะไหล่ใหม่","New spare request"]
];
const CATEGORY_LABEL={urgent_work:"งานเร่งด่วน",planned_work:"งานตามแผน",improvement_work:"งานปรับปรุง",pm_reminders:"PM / TPM",overdue:"เกินกำหนด",spare_updates:"อะไหล่",spare_new:"คำขออะไหล่"};

function isIos(){return /iPhone|iPad|iPod/i.test(navigator.userAgent||"")}
function isStandalone(){return window.matchMedia?.("(display-mode: standalone)")?.matches||window.navigator.standalone===true}

export default function NotificationsModule({profile}){
  const admin=profile.role==="admin";
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[msg,setMsg]=useState(""),[prefs,setPrefs]=useState(DEFAULT_PREF),[departments,setDepartments]=useState([]),[routes,setRoutes]=useState([]),[devices,setDevices]=useState([]),[items,setItems]=useState([]),[installPrompt,setInstallPrompt]=useState(null),[busy,setBusy]=useState(false);
  const permission=typeof Notification!=="undefined"?Notification.permission:"unsupported";
  const supported=pushSupported();
  const unread=items.filter(x=>!x.read_at).length;

  async function load(){
    setLoading(true);setError("");
    try{
      const sb=requireSupabase();
      const pref=await ensureNotificationPreference(profile.id);
      const queries=[
        sb.from("push_subscriptions").select("id,device_name,is_active,last_seen_at,created_at").eq("profile_id",profile.id).order("last_seen_at",{ascending:false}),
        sb.from("notifications").select("*").eq("profile_id",profile.id).order("created_at",{ascending:false}).limit(100)
      ];
      if(admin){
        queries.push(sb.from("departments").select("id,dept_code,dept_name,is_active,sort_order").eq("is_active",true).order("sort_order"));
        queries.push(sb.from("notification_department_subscriptions").select("profile_id,department_id,enabled").eq("profile_id",profile.id));
      }
      const results=await Promise.all(queries);for(const q of results)if(q.error)throw q.error;
      setPrefs({...DEFAULT_PREF,...pref});setDevices(results[0].data||[]);setItems(results[1].data||[]);
      if(admin){setDepartments(results[2].data||[]);setRoutes(results[3].data||[])}
    }catch(e){setError(e.message||"โหลดการแจ้งเตือนไม่สำเร็จ")}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);
  useEffect(()=>{
    const h=e=>{e.preventDefault();setInstallPrompt(e)};window.addEventListener("beforeinstallprompt",h);return()=>window.removeEventListener("beforeinstallprompt",h)
  },[]);

  const routeMap=useMemo(()=>Object.fromEntries(routes.map(x=>[x.department_id,x.enabled])),[routes]);
  async function savePref(key,value){
    const next={...prefs,[key]:value,updated_at:new Date().toISOString()};setPrefs(next);setMsg("");
    const {error}=await requireSupabase().from("notification_preferences").upsert({...next,profile_id:profile.id},{onConflict:"profile_id"});
    if(error){setMsg(error.message||"บันทึกไม่สำเร็จ");setPrefs(prefs)}
  }
  async function toggleDepartment(departmentId,enabled){
    setMsg("");
    try{
      const {error}=await requireSupabase().from("notification_department_subscriptions").upsert({profile_id:profile.id,department_id:departmentId,enabled,updated_at:new Date().toISOString()},{onConflict:"profile_id,department_id"});
      if(error)throw error;setRoutes(prev=>{const rest=prev.filter(x=>x.department_id!==departmentId);return [...rest,{profile_id:profile.id,department_id:departmentId,enabled}]})
    }catch(e){setMsg(e.message||"บันทึกแผนกไม่สำเร็จ")}
  }
  async function enablePush(){setBusy(true);setMsg("");try{await registerPushSubscription(profile);await savePref("push_enabled",true);setMsg("เปิดการแจ้งเตือนบนอุปกรณ์นี้เรียบร้อย");await load()}catch(e){setMsg(e.message||"เปิด Push Notification ไม่สำเร็จ")}finally{setBusy(false)}}
  async function disablePush(){setBusy(true);setMsg("");try{await unregisterPushSubscription(profile);await savePref("push_enabled",false);setMsg("ปิด Push Notification บนอุปกรณ์นี้แล้ว");await load()}catch(e){setMsg(e.message||"ปิด Push ไม่สำเร็จ")}finally{setBusy(false)}}
  async function testPush(){setBusy(true);setMsg("");try{const result=await dispatchMaintenanceNotification("test",profile.id);if(result?.push_ready===false)setMsg("Notification Center พร้อมแล้ว แต่ Push Server ยังไม่ได้ตั้ง VAPID Private Key");else if((result?.pushed||0)<1)setMsg("ส่งคำสั่งทดสอบแล้ว แต่ยังไม่พบอุปกรณ์ที่พร้อมรับ Push");else setMsg("ส่งแจ้งเตือนทดสอบแล้ว มือถือควรเด้งภายในไม่กี่วินาที");setTimeout(load,1000)}catch(e){setMsg(e.message||"ส่งทดสอบไม่สำเร็จ")}finally{setBusy(false)}}
  async function markRead(id){const {error}=await requireSupabase().from("notifications").update({read_at:new Date().toISOString()}).eq("id",id);if(!error)setItems(prev=>prev.map(x=>x.id===id?{...x,read_at:new Date().toISOString()}:x))}
  async function markAll(){const ids=items.filter(x=>!x.read_at).map(x=>x.id);if(!ids.length)return;const now=new Date().toISOString();const {error}=await requireSupabase().from("notifications").update({read_at:now}).in("id",ids);if(!error)setItems(prev=>prev.map(x=>({...x,read_at:x.read_at||now})))}
  async function installApp(){if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;setInstallPrompt(null)}}
  function openNotification(n){
    markRead(n.id);
    if(n.route){
      const clean=String(n.route).replace(/^#\/?/,"");
      location.hash=`#/${clean}`;
    }
  }

  if(loading)return <Loading text="กำลังโหลดการแจ้งเตือน…"/>;
  if(error)return <ErrorState message={error} onRetry={load}/>;

  return <div className="stack notify-root">
    <section className="cc-head">
      <div>
        <span className="cc-eyebrow">MOBILE NOTIFICATION</span>
        <h1>Notifications <small>การแจ้งเตือนมือถือ</small></h1>
        <p>แจ้งเฉพาะแผนก กะ และผู้รับผิดชอบที่เกี่ยวข้อง เพื่อลดข้อความรบกวนข้ามทีม</p>
      </div>
      <div className="cc-actions">
        <button className="btn ghost" onClick={load}><Icon name="refresh" size={16}/>รีเฟรช</button>
        {supported&&permission==="granted"&&<button className="btn primary" disabled={busy} onClick={testPush}><Icon name="bell" size={16}/>ทดสอบแจ้งเตือน</button>}
      </div>
    </section>

    {msg&&<div className={`notice ${/เรียบร้อย|ส่งแจ้งเตือน|ปิด Push/.test(msg)?"success":"danger"}`}>{msg}</div>}

    <section className="notify-setup-grid">
      <article className="notify-card hero-notify">
        <div className="notify-card-head">
          <div className="notify-icon"><Icon name="bell" size={22}/></div>
          <div><span>Push Notification</span><h2>การแจ้งเตือนบนมือถือ</h2></div>
          <span className={`notify-state ${permission}`}>{permission==="granted"?"อนุญาตแล้ว":permission==="denied"?"ถูกบล็อก":"ยังไม่เปิด"}</span>
        </div>
        <p>{supported?"กดเปิดครั้งเดียวบนมือถือเครื่องนี้ จากนั้นงานที่เกี่ยวข้องจะเด้งแม้ไม่ได้เปิดหน้าเว็บอยู่":"เบราว์เซอร์นี้ยังไม่รองรับ Web Push"}</p>
        <div className="notify-actions">
          {supported&&permission!=="granted"&&<button className="btn primary" disabled={busy} onClick={enablePush}>เปิดการแจ้งเตือน</button>}
          {supported&&permission==="granted"&&<>
            <button className="btn primary" disabled={busy} onClick={enablePush}>เชื่อมอุปกรณ์นี้</button>
            <button className="btn ghost" disabled={busy} onClick={disablePush}>ปิดบนอุปกรณ์นี้</button>
          </>}
        </div>
        {isIos()&&!isStandalone()&&<div className="notify-ios-tip"><b>iPhone / iPad</b><span>เปิดด้วย Safari → แชร์ → “เพิ่มไปยังหน้าจอโฮม” แล้วเปิดแอปจากไอคอนก่อนกดอนุญาตแจ้งเตือน</span></div>}
      </article>

      <article className="notify-card">
        <div className="notify-card-head"><div className="notify-icon soft"><Icon name="download" size={21}/></div><div><span>PWA</span><h2>ติดตั้งเป็นแอป</h2></div></div>
        <p>ติดตั้งไว้บนหน้าจอมือถือเพื่อเปิดเหมือนแอปทั่วไปและรับ Push ได้สะดวกขึ้น</p>
        {isStandalone()?<div className="notify-installed">ติดตั้งบนอุปกรณ์นี้แล้ว</div>:installPrompt?<button className="btn ghost" onClick={installApp}>ติดตั้งแอปบนอุปกรณ์นี้</button>:<div className="notify-manual">Android: เมนู Chrome → ติดตั้งแอป<br/>iPhone: Safari → แชร์ → เพิ่มไปยังหน้าจอโฮม</div>}
      </article>

      <article className="notify-card">
        <div className="notify-card-head"><div className="notify-icon soft"><Icon name="machine" size={21}/></div><div><span>ROUTING</span><h2>กฎการส่ง</h2></div></div>
        <div className="notify-routing">
          <span>1</span><p><b>แผนก</b> เครื่องอยู่แผนกไหน ส่งเฉพาะแผนกนั้น</p>
          <span>2</span><p><b>กะ</b> งานยังไม่ระบุคน ส่งเฉพาะกะ A / B / O ที่มอบหมาย</p>
          <span>3</span><p><b>ผู้รับผิดชอบ</b> ถ้าระบุชื่อแล้ว ส่งตรงคนนั้น</p>
        </div>
      </article>
    </section>

    <section className="notify-panel">
      <div className="notify-panel-head"><div><span className="cc-eyebrow">WHAT TO RECEIVE</span><h2>เลือกสิ่งที่ต้องการรับ <small>Notification Preferences</small></h2></div></div>
      <div className="notify-pref-grid">
        {PREFS.map(([key,th,en])=><label key={key} className="notify-toggle-row"><span><b>{th}</b><small>{en}</small></span><input type="checkbox" checked={Boolean(prefs[key])} onChange={e=>savePref(key,e.target.checked)}/><i/></label>)}
      </div>
    </section>

    {admin&&<section className="notify-panel">
      <div className="notify-panel-head"><div><span className="cc-eyebrow">DEPARTMENT ROUTING</span><h2>แผนกที่คุณต้องการติดตาม</h2><p>ใช้กับแจ้งเตือนระดับทีม เช่น คำขออะไหล่ใหม่ ช่างยังไม่รับข้อความข้ามแผนก</p></div></div>
      <div className="notify-dept-grid">
        {departments.map(d=><label key={d.id} className={`notify-dept ${routeMap[d.id]!==false?"active":""}`}><span><b>{d.dept_code}</b><small>{d.dept_name}</small></span><input type="checkbox" checked={routeMap[d.id]!==false} onChange={e=>toggleDepartment(d.id,e.target.checked)}/><i/></label>)}
      </div>
    </section>}

    <section className="notify-panel">
      <div className="notify-panel-head inline">
        <div><span className="cc-eyebrow">NOTIFICATION CENTER</span><h2>ประวัติการแจ้งเตือน <small>{unread} ยังไม่อ่าน</small></h2></div>
        {unread>0&&<button className="btn ghost" onClick={markAll}>อ่านทั้งหมด</button>}
      </div>
      {!items.length
        ? <Empty title="ยังไม่มีการแจ้งเตือน" text="เมื่อมีการมอบหมายงานหรืออัปเดตอะไหล่ รายการจะขึ้นที่นี่"/>
        : <div className="notify-list">{items.map(n=><button key={n.id} className={`notify-item ${n.read_at?"read":"unread"}`} onClick={()=>openNotification(n)}>
            <span className="notify-dot"/>
            <div>
              <div className="notify-item-top"><b>{n.title}</b><small>{formatThaiDateTime(n.created_at)}</small></div>
              <p>{n.body}</p>
              <div className="notify-item-foot"><span>{CATEGORY_LABEL[n.category]||n.category}</span>{!n.read_at&&<em>ใหม่</em>}</div>
            </div>
          </button>)}</div>
      }
    </section>

    <section className="notify-device-strip">
      <div><b>อุปกรณ์ที่เชื่อมไว้</b><span>{devices.length} อุปกรณ์</span></div>
      {devices.slice(0,4).map(d=><span key={d.id}>{d.device_name||"Browser"} · {formatThaiDateTime(d.last_seen_at)}</span>)}
    </section>
  </div>;
}
