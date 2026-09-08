import { requireSupabase } from "../core.js";

export const VAPID_PUBLIC_KEY=String(import.meta.env.VITE_VAPID_PUBLIC_KEY||"").trim();

export function pushSupported(){
  return typeof window!=="undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64String){
  const padding="=".repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(base64);const output=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)output[i]=raw.charCodeAt(i);
  return output;
}
function b64(key){
  if(!key)return "";const bytes=new Uint8Array(key);let binary="";
  bytes.forEach(v=>binary+=String.fromCharCode(v));
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function deviceName(){
  const ua=navigator.userAgent||"";
  if(/iPhone|iPad|iPod/i.test(ua))return "iPhone / iPad";
  if(/Android/i.test(ua))return "Android";
  if(/Windows/i.test(ua))return "Windows";
  if(/Macintosh|Mac OS X/i.test(ua))return "Mac";
  return "Web Browser";
}

export async function registerPushSubscription(profile){
  if(!pushSupported())throw new Error("อุปกรณ์หรือเบราว์เซอร์นี้ยังไม่รองรับ Push Notification");
  if(!VAPID_PUBLIC_KEY)throw new Error("ระบบยังไม่ได้ตั้งค่า VAPID Public Key");
  const permission=await Notification.requestPermission();
  if(permission!=="granted")throw new Error("ยังไม่ได้อนุญาตการแจ้งเตือน กรุณาอนุญาต Notification ในเบราว์เซอร์");
  const registration=await navigator.serviceWorker.register(`${import.meta.env.BASE_URL||"./"}sw.js`,{scope:import.meta.env.BASE_URL||"./"});
  await navigator.serviceWorker.ready;
  let subscription=await registration.pushManager.getSubscription();
  if(!subscription){
    subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)});
  }
  const json=subscription.toJSON();
  const payload={
    profile_id:profile.id,
    endpoint:subscription.endpoint,
    p256dh:json.keys?.p256dh||b64(subscription.getKey("p256dh")),
    auth:json.keys?.auth||b64(subscription.getKey("auth")),
    device_name:deviceName(),
    user_agent:(navigator.userAgent||"").slice(0,500),
    is_active:true,last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()
  };
  const {error}=await requireSupabase().from("push_subscriptions").upsert(payload,{onConflict:"endpoint"});
  if(error)throw error;
  return subscription;
}

export async function unregisterPushSubscription(profile){
  if(!pushSupported())return;
  const registration=await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL||"./");
  const subscription=await registration?.pushManager?.getSubscription();
  if(subscription){
    const endpoint=subscription.endpoint;
    await subscription.unsubscribe().catch(()=>{});
    await requireSupabase().from("push_subscriptions").delete().eq("profile_id",profile.id).eq("endpoint",endpoint);
  }
}

export async function dispatchMaintenanceNotification(eventType,sourceId,extra={}){
  const sb=requireSupabase();
  const {data,error}=await sb.functions.invoke("dispatch-maintenance-notification",{body:{event_type:eventType,source_id:sourceId,...extra}});
  if(error)throw error;
  if(data?.error)throw new Error(data.error);
  return data;
}

export async function ensureNotificationPreference(profileId){
  const sb=requireSupabase();
  const {data,error}=await sb.from("notification_preferences").select("*").eq("profile_id",profileId).maybeSingle();
  if(error)throw error;
  if(data)return data;
  const {data:created,error:createError}=await sb.from("notification_preferences").insert({profile_id:profileId}).select("*").single();
  if(createError)throw createError;
  return created;
}
