import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json; charset=utf-8",
};
const reply=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:corsHeaders});
const clean=(v:unknown)=>String(v??"").trim();
function serviceKey(){
  const modern=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(modern){try{const k=JSON.parse(modern).default;if(k)return k}catch{}}
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
}
const service=()=>createClient(Deno.env.get("SUPABASE_URL")||"",serviceKey(),{auth:{persistSession:false,autoRefreshToken:false}});
const authClient=()=>createClient(Deno.env.get("SUPABASE_URL")||"",Deno.env.get("SUPABASE_ANON_KEY")||"",{auth:{persistSession:false,autoRefreshToken:false}});
async function hmac(secret:string,value:string){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig),b=>b.toString(16).padStart(2,"0")).join("");
}
async function rateLimit(req:Request,username:string,sb:ReturnType<typeof service>){
  const secret=serviceKey();
  const forwarded=req.headers.get("x-forwarded-for")||req.headers.get("cf-connecting-ip")||"unknown";
  const ip=forwarded.split(",")[0].trim();
  const fingerprint=await hmac(secret,`admin/${ip}/${username.toLowerCase()}`);
  const now=Date.now(),windowMs=10*60*1000,blockMs=15*60*1000,max=8;
  const {data:cur,error}=await sb.from("employee_code_login_rate_limits")
    .select("attempts,window_started_at,blocked_until").eq("fingerprint",fingerprint).maybeSingle();
  if(error) throw error;
  if(cur?.blocked_until && new Date(cur.blocked_until).getTime()>now) return false;
  const fresh=!cur || new Date(cur.window_started_at).getTime()+windowMs<=now;
  const attempts=fresh?1:Number(cur.attempts||0)+1;
  const blocked=attempts>max?new Date(now+blockMs).toISOString():null;
  const {error:saveErr}=await sb.from("employee_code_login_rate_limits").upsert({
    fingerprint,attempts,window_started_at:fresh?new Date(now).toISOString():cur.window_started_at,
    blocked_until:blocked,updated_at:new Date(now).toISOString()
  },{onConflict:"fingerprint"});
  if(saveErr) throw saveErr;
  return !blocked;
}
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST") return reply(405,{error:"Method not allowed"});
  try{
    const body=await req.json();
    const username=clean(body?.username).toLowerCase();
    const password=String(body?.password??"");
    if(!username || password.length<4) return reply(400,{error:"กรอกชื่อผู้ใช้และรหัสผ่านให้ครบ"});
    const sb=service();
    if(!await rateLimit(req,username,sb)) return reply(429,{error:"ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาที"});
    const {data:profile,error:profileError}=await sb.from("app_profiles")
      .select("id,employee_code,username,role,is_active,auth_user_id")
      .eq("username",username).eq("role","admin").maybeSingle();
    if(profileError || !profile || !profile.is_active || !profile.auth_user_id)
      return reply(401,{error:"ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"});
    const {data:userData,error:userErr}=await sb.auth.admin.getUserById(profile.auth_user_id);
    if(userErr || !userData.user?.email) return reply(401,{error:"ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"});
    const client=authClient();
    let signed=await client.auth.signInWithPassword({email:userData.user.email,password});
    if(signed.error || !signed.data.session){
      signed=await client.auth.signInWithPassword({email:userData.user.email,password:`MPR:${password}`});
    }
    if(signed.error || !signed.data.session) return reply(401,{error:"ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"});
    return reply(200,{ok:true,session:{access_token:signed.data.session.access_token,refresh_token:signed.data.session.refresh_token}});
  }catch(error){
    console.error("admin-login",error);
    return reply(500,{error:"ระบบเข้าสู่ระบบขัดข้อง กรุณาลองใหม่"});
  }
});
