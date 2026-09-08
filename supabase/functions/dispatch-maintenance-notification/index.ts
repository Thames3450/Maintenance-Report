import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")||"";
const VAPID_PUBLIC_KEY="BKpdBxqC1cPHntfM6EBXwwd-AqtzbQQ0fW8iDqg22zZOlHxS_7mIdVMqcp3-JWLOahbV3-ARcKzRsJXX427I_aA";
const VAPID_PRIVATE_KEY=Deno.env.get("VAPID_PRIVATE_KEY")||"";
const VAPID_SUBJECT="https://thames3450.github.io/Maintenance-Report/";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const DEFAULT_PREF={push_enabled:true,urgent_work:true,planned_work:true,improvement_work:false,pm_reminders:true,overdue:true,spare_updates:true,spare_new:true,quiet_hours_enabled:false,quiet_start:"22:00",quiet_end:"06:00"};
if(VAPID_PRIVATE_KEY)webpush.setVapidDetails(VAPID_SUBJECT,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY);

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors})}
function bangkokTime(){return new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Bangkok",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date())}
function inQuiet(pref:any){if(!pref?.quiet_hours_enabled)return false;const now=bangkokTime(),start=String(pref.quiet_start||"22:00").slice(0,5),end=String(pref.quiet_end||"06:00").slice(0,5);return start<end?(now>=start&&now<end):(now>=start||now<end)}
function enabled(pref:any,category:string){const p={...DEFAULT_PREF,...pref};return Boolean(p.push_enabled&&p[category]!==false&&!inQuiet(p))}
async function profileFromRequest(req:Request){
  const auth=req.headers.get("Authorization")||"";if(!auth.startsWith("Bearer "))throw new Error("Unauthorized");
  const client=createClient(SUPABASE_URL,ANON_KEY,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data:{user},error}=await client.auth.getUser();if(error||!user)throw new Error("Unauthorized");
  const {data:profile,error:pe}=await admin.from("app_profiles").select("id,auth_user_id,full_name,department_id,role,is_active,shift").eq("auth_user_id",user.id).maybeSingle();
  if(pe||!profile||!profile.is_active)throw new Error("Profile unavailable");return profile;
}
async function names(departmentId?:string|null,machineId?:string|null){
  let dept="",machine="";
  if(departmentId){const {data}=await admin.from("departments").select("dept_code").eq("id",departmentId).maybeSingle();dept=data?.dept_code||""}
  if(machineId){const {data}=await admin.from("machines").select("machine_no,machine_name").eq("id",machineId).maybeSingle();machine=data?`${data.machine_no||"-"} · ${data.machine_name||""}`.trim():""}
  return {dept,machine};
}
async function adminRecipients(departmentId:string){
  const {data:routes}=await admin.from("notification_department_subscriptions").select("profile_id").eq("department_id",departmentId).eq("enabled",true);
  const ids=[...new Set((routes||[]).map((x:any)=>x.profile_id).filter(Boolean))];if(!ids.length)return [];
  const {data:profiles}=await admin.from("app_profiles").select("id").in("id",ids).eq("role","admin").eq("is_active",true);return (profiles||[]).map((x:any)=>x.id);
}
async function taskRecipients(task:any){
  if(task.assigned_to)return [task.assigned_to];
  if(!task.department_id||!task.assigned_shift)return [];
  const {data}=await admin.from("app_profiles").select("id").eq("department_id",task.department_id).eq("shift",task.assigned_shift).eq("role","technician").eq("is_active",true);
  return (data||[]).map((x:any)=>x.id);
}
async function deliver(profileIds:string[],payload:any,category:string,departmentId:string|null,dedupeBase:string){
  const ids=[...new Set(profileIds.filter(Boolean))];if(!ids.length)return {recipients:0,pushed:0};
  const rows=ids.map(id=>({profile_id:id,department_id:departmentId,category,title:payload.title,body:payload.body,route:payload.route,data:payload.data||{},dedupe_key:`${dedupeBase}:${id}`}));
  const {data:created,error:insertError}=await admin.from("notifications").upsert(rows,{onConflict:"dedupe_key",ignoreDuplicates:true}).select("id,profile_id,dedupe_key");
  if(insertError)throw insertError;
  const createdIds=[...new Set((created||[]).map((x:any)=>x.profile_id))];if(!createdIds.length)return {recipients:ids.length,pushed:0,duplicate:true};
  const [{data:prefs},{data:subs}]=await Promise.all([
    admin.from("notification_preferences").select("*").in("profile_id",createdIds),
    admin.from("push_subscriptions").select("id,profile_id,endpoint,p256dh,auth").in("profile_id",createdIds).eq("is_active",true)
  ]);
  const prefMap=new Map((prefs||[]).map((x:any)=>[x.profile_id,x]));
  if(!VAPID_PRIVATE_KEY)return {recipients:ids.length,pushed:0,push_ready:false};
  let pushed=0;
  for(const sub of subs||[]){
    const pref=prefMap.get(sub.profile_id)||DEFAULT_PREF;if(!enabled(pref,category))continue;
    try{
      await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify({...payload,tag:dedupeBase}),{TTL:3600});
      pushed++;
    }catch(e:any){
      const code=e?.statusCode||e?.status;if(code===404||code===410)await admin.from("push_subscriptions").update({is_active:false,updated_at:new Date().toISOString()}).eq("id",sub.id);
    }
  }
  if(pushed>0)await admin.from("notifications").update({pushed_at:new Date().toISOString()}).in("profile_id",createdIds).like("dedupe_key",`${dedupeBase}:%`);
  return {recipients:ids.length,pushed,push_ready:true};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const caller=await profileFromRequest(req);const body=await req.json().catch(()=>({}));const event=String(body.event_type||"");const sourceId=String(body.source_id||"");
    if(event==="test"){
      return json({ok:true,...await deliver([caller.id],{title:"ทดสอบการแจ้งเตือน",body:"MVR Smart Maintenance พร้อมส่งแจ้งเตือนบนอุปกรณ์นี้แล้ว",route:"#/notify",data:{event:"test"}},"urgent_work",caller.department_id,`test:${Date.now()}`)});
    }
    if(event==="task_assigned"){
      if(caller.role!=="admin")return json({error:"Admin only"},403);
      const {data:task,error}=await admin.from("maintenance_tasks").select("*").eq("id",sourceId).maybeSingle();if(error||!task)return json({error:"Task not found"},404);
      const recipients=await taskRecipients(task),n=await names(task.department_id,task.machine_id),category=task.priority==="P2"?"urgent_work":task.priority==="P4"?"improvement_work":"planned_work";
      const level=task.priority==="P2"?"เร่งด่วน":task.priority==="P4"?"ปรับปรุง":"ตามแผน";
      const bodyText=[n.machine||"งานทั่วไป",task.assigned_shift?`Shift ${task.assigned_shift}`:"",task.title].filter(Boolean).join(" · ");
      return json({ok:true,...await deliver(recipients,{title:`${level} · ${n.dept||"Maintenance"}`,body:bodyText,route:"#/work",data:{event,task_id:task.id,department_id:task.department_id,shift:task.assigned_shift}},category,task.department_id,`task:${task.id}:${task.updated_at}`)});
    }
    if(event==="spare_request_created"){
      const {data:r,error}=await admin.from("spare_requests").select("*").eq("id",sourceId).maybeSingle();if(error||!r)return json({error:"Request not found"},404);
      if(caller.role!=="admin"&&caller.id!==r.requester_profile_id)return json({error:"Forbidden"},403);
      const recipients=(await adminRecipients(r.department_id)).filter((id:string)=>id!==caller.id),n=await names(r.department_id,r.machine_id);
      const bodyText=[n.machine||"ไม่ระบุเครื่อง",r.part_name,`${Number(r.quantity)} ${r.unit}`,r.requester_name_snapshot].join(" · ");
      return json({ok:true,...await deliver(recipients,{title:`คำขออะไหล่ใหม่ · ${n.dept||"Maintenance"}`,body:bodyText,route:"#/spare",data:{event,request_id:r.id,department_id:r.department_id,shift:r.requester_shift_snapshot}},"spare_new",r.department_id,`spare-new:${r.id}`)});
    }
    if(event==="spare_request_status"){
      if(caller.role!=="admin")return json({error:"Admin only"},403);
      const {data:r,error}=await admin.from("spare_requests").select("*").eq("id",sourceId).maybeSingle();if(error||!r)return json({error:"Request not found"},404);
      const n=await names(r.department_id,r.machine_id);const labels:any={sent:"ส่งจัดซื้อแล้ว",follow_up:"ต้องติดตามข้อมูลเพิ่ม",closed:"ปิดรายการแล้ว",review:"กำลังตรวจสอบ",ready:"รอรวบรวม"};
      const status=labels[r.status]||r.status,extra=r.status==="follow_up"&&r.follow_up_note?` · ${r.follow_up_note}`:"";
      return json({ok:true,...await deliver([r.requester_profile_id],{title:`อัปเดตอะไหล่ · ${n.dept||"Maintenance"}`,body:`${r.part_name} · ${status}${extra}`,route:"#/spare",data:{event,request_id:r.id,status:r.status}},"spare_updates",r.department_id,`spare-status:${r.id}:${r.status}:${r.updated_at}`)});
    }
    if(event==="spare_batch_sent"){
      if(caller.role!=="admin")return json({error:"Admin only"},403);
      const {data:batch}=await admin.from("spare_request_batches").select("id,batch_no,status,sent_at").eq("id",sourceId).maybeSingle();if(!batch)return json({error:"Batch not found"},404);
      const {data:reqs}=await admin.from("spare_requests").select("id,requester_profile_id,department_id,part_name").eq("batch_id",sourceId);
      const grouped=new Map<string,any[]>();for(const r of reqs||[]){const list=grouped.get(r.requester_profile_id)||[];list.push(r);grouped.set(r.requester_profile_id,list)}
      let pushed=0,recipients=0;for(const [pid,list] of grouped.entries()){const deptId=list[0]?.department_id||null;const partText=list.slice(0,2).map(x=>x.part_name).join(", ")+(list.length>2?` +${list.length-2} รายการ`:"");const result=await deliver([pid],{title:"ส่งรายการอะไหล่ให้จัดซื้อแล้ว",body:`${batch.batch_no} · ${partText}`,route:"#/spare",data:{event,batch_id:sourceId}},"spare_updates",deptId,`spare-batch:${sourceId}:${pid}`);pushed+=result.pushed||0;recipients+=result.recipients||0}
      return json({ok:true,recipients,pushed,push_ready:Boolean(VAPID_PRIVATE_KEY)});
    }
    return json({error:"Unknown event"},400);
  }catch(e:any){return json({error:e?.message||"Notification dispatch failed"},e?.message==="Unauthorized"?401:500)}
});
