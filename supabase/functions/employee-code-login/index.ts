import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const INTERNAL_DOMAIN="mvr-smart.local";
const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json; charset=utf-8",
};
const reply=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:corsHeaders});
const clean=(v:unknown)=>String(v??"").trim();
const validCode=(v:string)=>/^\d{4,16}$/.test(v);

function serviceKey(){
  const modern=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(modern){try{const k=JSON.parse(modern).default;if(k)return k}catch{}}
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
}
const serviceClient=()=>createClient(Deno.env.get("SUPABASE_URL")||"",serviceKey(),{auth:{persistSession:false,autoRefreshToken:false}});
const authClient=()=>createClient(Deno.env.get("SUPABASE_URL")||"",Deno.env.get("SUPABASE_ANON_KEY")||"",{auth:{persistSession:false,autoRefreshToken:false}});

async function hmac(secret:string,value:string){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig),b=>b.toString(16).padStart(2,"0")).join("");
}
async function internalPassword(code:string){
  return hmac(serviceKey(),`mvr-smart/technician/${code}`);
}
async function rateLimit(req:Request,code:string,sb:ReturnType<typeof serviceClient>){
  const forwarded=req.headers.get("x-forwarded-for")||req.headers.get("cf-connecting-ip")||"unknown";
  const ip=forwarded.split(",")[0].trim();
  const fingerprint=await hmac(serviceKey(),`tech/${ip}/${code}`);
  const now=Date.now(),windowMs=10*60*1000,blockMs=10*60*1000,max=15;
  const {data:cur,error}=await sb.from("employee_code_login_rate_limits")
    .select("attempts,window_started_at,blocked_until").eq("fingerprint",fingerprint).maybeSingle();
  if(error)throw error;
  if(cur?.blocked_until&&new Date(cur.blocked_until).getTime()>now)return false;
  const fresh=!cur||new Date(cur.window_started_at).getTime()+windowMs<=now;
  const attempts=fresh?1:Number(cur.attempts||0)+1;
  const blocked=attempts>max?new Date(now+blockMs).toISOString():null;
  const {error:saveErr}=await sb.from("employee_code_login_rate_limits").upsert({
    fingerprint,attempts,window_started_at:fresh?new Date(now).toISOString():cur.window_started_at,
    blocked_until:blocked,updated_at:new Date(now).toISOString()
  },{onConflict:"fingerprint"});
  if(saveErr)throw saveErr;
  return !blocked;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return reply(405,{error:"Method not allowed"});
  try{
    const body=await req.json();
    const employeeCode=clean(body?.employeeCode);
    if(!validCode(employeeCode))return reply(400,{error:"กรอกรหัสพนักงานให้ถูกต้อง"});

    const service=serviceClient();
    if(!await rateLimit(req,employeeCode,service))
      return reply(429,{error:"ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 10 นาที"});

    const {data:profile,error:profileError}=await service.from("app_profiles")
      .select("id,employee_code,role,is_active,auth_user_id")
      .eq("employee_code",employeeCode).maybeSingle();

    if(profileError||!profile||!profile.is_active||profile.role!=="technician")
      return reply(403,{error:"ไม่พบรหัสพนักงาน หรือบัญชีนี้ไม่มีสิทธิ์เข้าใช้งานส่วนช่าง"});

    const password=await internalPassword(employeeCode);
    let userId=profile.auth_user_id as string|null;
    let email=`user${employeeCode}@${INTERNAL_DOMAIN}`;

    if(!userId){
      const {data:created,error:createError}=await service.auth.admin.createUser({email,password,email_confirm:true});
      if(createError||!created.user)throw createError||new Error("Unable to create technician Auth user");
      userId=created.user.id;
      const {error:linkError}=await service.from("app_profiles").update({auth_user_id:userId}).eq("id",profile.id);
      if(linkError){
        await service.auth.admin.deleteUser(userId);
        throw linkError;
      }
    }else{
      const {data:userData,error:userErr}=await service.auth.admin.getUserById(userId);
      if(userErr||!userData.user)throw userErr||new Error("Auth user not found");
      email=userData.user.email||email;
      const {error:updateError}=await service.auth.admin.updateUserById(userId,{password});
      if(updateError)throw updateError;
    }

    await service.from("technicians").update({auth_user_id:userId}).eq("id",profile.id);

    const {data:signed,error:signError}=await authClient().auth.signInWithPassword({email,password});
    if(signError||!signed.session){
      console.error("Technician sign-in failed",signError?.message);
      return reply(500,{error:"เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่"});
    }

    return reply(200,{ok:true,session:{access_token:signed.session.access_token,refresh_token:signed.session.refresh_token}});
  }catch(error){
    console.error("employee-code-login",error);
    return reply(500,{error:"ระบบเข้าสู่ระบบขัดข้อง กรุณาลองใหม่"});
  }
});
