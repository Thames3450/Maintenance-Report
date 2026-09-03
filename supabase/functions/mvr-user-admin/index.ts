import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json; charset=utf-8",
};
const reply=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:corsHeaders});
function serviceKey(){
  const modern=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(modern){try{const k=JSON.parse(modern).default;if(k)return k}catch{}}
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
}
const service=()=>createClient(Deno.env.get("SUPABASE_URL")||"",serviceKey(),{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return reply(405,{error:"Method not allowed"});
  try{
    const authHeader=req.headers.get("authorization")||"";
    const token=authHeader.replace(/^Bearer\s+/i,"");
    if(!token)return reply(401,{error:"Authentication required"});
    const sb=service();
    const {data:callerAuth,error:authErr}=await sb.auth.getUser(token);
    if(authErr||!callerAuth.user)return reply(401,{error:"Invalid session"});
    const {data:caller,error:callerErr}=await sb.from("app_profiles")
      .select("id,role,is_active").eq("auth_user_id",callerAuth.user.id).maybeSingle();
    if(callerErr||!caller||!caller.is_active||caller.role!=="admin")
      return reply(403,{error:"Admin permission required"});
    const body=await req.json();
    const action=String(body.action||"");
    if(action!=="provision_admin")return reply(400,{error:"Unknown action"});
    const profileId=String(body.profileId||"");
    const password=String(body.password||"");
    if(password.length<6)return reply(400,{error:"รหัสผ่าน Admin ต้องมีอย่างน้อย 6 ตัวอักษร"});
    const {data:target,error:targetErr}=await sb.from("app_profiles")
      .select("id,employee_code,username,role,is_active,auth_user_id")
      .eq("id",profileId).maybeSingle();
    if(targetErr)throw targetErr;
    if(!target||target.role!=="admin"||!target.is_active) return reply(400,{error:"ไม่พบ Admin ที่เปิดใช้งาน"});
    let userId=target.auth_user_id as string|null;
    if(userId){
      const {error:updateErr}=await sb.auth.admin.updateUserById(userId,{password});
      if(updateErr)throw updateErr;
    }else{
      const email=`${target.employee_code}@mvr-smart.local`;
      const {data:created,error:createErr}=await sb.auth.admin.createUser({email,password,email_confirm:true});
      if(createErr||!created.user)throw createErr||new Error("Unable to create admin Auth user");
      userId=created.user.id;
      const {error:linkErr}=await sb.from("app_profiles").update({auth_user_id:userId}).eq("id",target.id);
      if(linkErr){await sb.auth.admin.deleteUser(userId);throw linkErr;}
    }
    await sb.from("technicians").update({auth_user_id:userId}).eq("id",target.id);
    return reply(200,{ok:true,message:"ตั้งรหัสผ่าน Admin เรียบร้อย"});
  }catch(error){
    console.error("mvr-user-admin",error);
    return reply(500,{error:error instanceof Error?error.message:"ดำเนินการไม่สำเร็จ"});
  }
});
