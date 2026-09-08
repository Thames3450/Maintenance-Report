import { createClient } from "@supabase/supabase-js";

export const CONFIG = Object.freeze({
  supabaseUrl: String(import.meta.env.VITE_SUPABASE_URL || "").trim(),
  supabaseKey: String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim(),
  employeeLoginFunction: String(import.meta.env.VITE_EMPLOYEE_LOGIN_FUNCTION || "employee-code-login").trim(),
  adminLoginFunction: String(import.meta.env.VITE_ADMIN_LOGIN_FUNCTION || "admin-login").trim(),
  userAdminFunction: String(import.meta.env.VITE_USER_ADMIN_FUNCTION || "mvr-user-admin").trim(),
  storageBucket: "maintenance-media"
});

export const isConfigured = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseKey);
export const supabase = isConfigured
  ? createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

export function requireSupabase() {
  if (!supabase) throw new Error("ไม่พบค่าการเชื่อมต่อ Supabase กรุณาตรวจสอบไฟล์ .env");
  return supabase;
}

function withTimeout(promise, ms, message = "การเชื่อมต่อใช้เวลานานเกินไป") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(message);
      error.code = "AUTH_TIMEOUT";
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function clearStoredAuthSession() {
  if (!isConfigured || typeof window === "undefined") return;
  let ref = "";
  try { ref = new URL(CONFIG.supabaseUrl).hostname.split(".")[0] || ""; } catch {}
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      const remove = [];
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i) || "";
        if ((ref && key.includes(ref) && key.startsWith("sb-")) || key === "supabase.auth.token") remove.push(key);
      }
      remove.forEach(key => store.removeItem(key));
    } catch {}
  }
}

export async function resetLocalSession() {
  const sb = requireSupabase();
  try { await withTimeout(sb.auth.signOut({ scope: "local" }), 2500, ""); } catch {}
  clearStoredAuthSession();
}

export function clean(v) { return String(v ?? "").trim(); }
export function mono(v) { return clean(v) || "-"; }
export function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
export function todayISO() { return localDateISO(new Date()); }
export function localDateISO(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
export function addDaysISO(dateISO, amount) {
  const [y,m,d] = String(dateISO).split("-").map(Number);
  if (![y,m,d].every(Number.isFinite)) return "";
  return new Date(Date.UTC(y, m - 1, d + Number(amount || 0), 12)).toISOString().slice(0, 10);
}
export function localDayStartUTC(dateISO) {
  if (!dateISO) return null;
  const d = new Date(`${dateISO}T00:00:00+07:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
export function localNextDayStartUTC(dateISO) {
  if (!dateISO) return null;
  const next = addDaysISO(dateISO, 1);
  return next ? new Date(`${next}T00:00:00+07:00`).toISOString() : null;
}
export function startOfWeekISO(date = new Date()) {
  const iso = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localDateISO(date);
  const [y,m,d] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(y,m-1,d,12));
  const day = utc.getUTCDay() || 7;
  return addDaysISO(iso, 1 - day);
}
export function endOfMonthISO(date = new Date()) {
  const iso = typeof date === "string" && /^\d{4}-\d{2}/.test(date) ? date : localDateISO(date);
  const [y,m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0, 12)).toISOString().slice(0, 10);
}
export function formatThaiDate(value, opts = {}) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value.length === 10 ? `${value}T12:00:00+07:00` : value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric", ...opts }).format(date);
}
export function formatThaiDateTime(value) {
  if (!value) return "-";
  const date = new Date(value); if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}
export function minutesBetween(start, end) {
  if (!start || !end) return 0;
  const a = new Date(start).getTime(), b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 60000);
}
export function initials(name) {
  const s = clean(name).replace(/^(นาย|นางสาว|นาง)\s*/, "");
  return s ? s.slice(0, 1).toUpperCase() : "?";
}
export function safeFileName(name) {
  return clean(name).replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "image.jpg";
}
export function statusLabel(value) {
  return ({
    operational: "ใช้งานได้ปกติ", no_parts: "ไม่มีอะไหล่", follow_up: "ต้องติดตามต่อ",
    waiting: "ต้องติดตามต่อ", in_progress: "ต้องติดตามต่อ", waiting_parts: "ไม่มีอะไหล่", completed: "ใช้งานได้ปกติ",
    planned: "วางแผนไว้", done: "เสร็จ", skipped: "ไม่ได้ทำ", normal: "ปกติ", abnormal: "ผิดปกติ", na: "ไม่เกี่ยวข้อง",
    issue: "พบปัญหา", corrected: "แก้ไขแล้ว"
  })[value] || value || "-";
}
export function frequencyLabel(value) {
  return ({ daily: "รายวัน", weekly: "รายสัปดาห์", monthly: "รายเดือน", quarterly: "ราย 3 เดือน", semiannual: "ราย 6 เดือน", annual: "รายปี" })[value] || value;
}
export function severityLabel(value) {
  return ({ low: "เล็กน้อย", medium: "ปานกลาง", high: "รุนแรง" })[value] || value;
}

export async function loginAdmin(username, password) {
  requireSupabase();
  const user = clean(username).toLowerCase();
  if (!user || !password) throw new Error("กรอกชื่อผู้ใช้และรหัสผ่านให้ครบ");
  const res = await fetch(`${CONFIG.supabaseUrl}/functions/v1/${CONFIG.adminLoginFunction}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: CONFIG.supabaseKey },
    body: JSON.stringify({ username: user, password })
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.session) throw new Error(payload?.error || "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
  const { error } = await supabase.auth.setSession(payload.session);
  if (error) throw error;
  return payload.session;
}

export async function provisionAdminPassword(profileId, password) {
  const sb = requireSupabase();
  const { data: sessionData } = await sb.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
  const res = await fetch(`${CONFIG.supabaseUrl}/functions/v1/${CONFIG.userAdminFunction}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: CONFIG.supabaseKey,
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ action: "provision_admin", profileId, password })
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || "ตั้งรหัสผ่าน Admin ไม่สำเร็จ");
  return payload;
}

export async function loginTechnician(employeeCode) {
  requireSupabase();
  const code = clean(employeeCode);
  if (!/^\d{4,16}$/.test(code)) throw new Error("กรอกรหัสพนักงานให้ถูกต้อง");
  const res = await fetch(`${CONFIG.supabaseUrl}/functions/v1/${CONFIG.employeeLoginFunction}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: CONFIG.supabaseKey },
    body: JSON.stringify({ employeeCode: code })
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.session) throw new Error(payload?.error || "ไม่สามารถเข้าสู่ระบบได้");
  const { error } = await supabase.auth.setSession(payload.session);
  if (error) throw error;
  return payload.session;
}

export async function loadMyProfile({ timeoutMs = 8000 } = {}) {
  const sb = requireSupabase();
  const sessionResult = await withTimeout(sb.auth.getSession(), 3000, "ตรวจสอบเซสชันไม่สำเร็จ");
  if (sessionResult?.error) throw sessionResult.error;
  const userId = sessionResult?.data?.session?.user?.id;
  if (!userId) return null;

  const result = await withTimeout(
    sb.from("app_profiles")
      .select("id,auth_user_id,employee_code,username,full_name,department_id,role,is_active,photo_path,shift,position,departments!app_profiles_department_id_fkey(id,dept_code,dept_name)")
      .eq("auth_user_id", userId)
      .maybeSingle(),
    timeoutMs,
    "โหลดสิทธิ์ผู้ใช้งานนานเกินไป"
  );
  if (result?.error) throw result.error;
  const data = result?.data;
  if (!data) {
    const error = new Error("เซสชันเดิมไม่ตรงกับรายชื่อผู้ใช้งานปัจจุบัน");
    error.code = "PROFILE_NOT_FOUND";
    throw error;
  }
  if (!data.is_active) {
    const error = new Error("บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ");
    error.code = "PROFILE_DISABLED";
    throw error;
  }
  return data;
}

export async function signOut() {
  await resetLocalSession();
}

export async function uploadRepairImage({ userId, reportId, file }) {
  const sb = requireSupabase();
  if (!file?.type?.startsWith("image/")) throw new Error("รองรับเฉพาะไฟล์รูปภาพ");
  if (file.size > 8 * 1024 * 1024) throw new Error("รูปภาพต้องมีขนาดไม่เกิน 8 MB");
  const path = `repair/${userId}/${reportId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await sb.storage.from(CONFIG.storageBucket).upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
}


export async function uploadMachinePhoto({ machineId, file }) {
  const sb = requireSupabase();
  if (!file?.type?.startsWith("image/")) throw new Error("รองรับเฉพาะไฟล์รูปภาพ");
  if (file.size > 8 * 1024 * 1024) throw new Error("รูปภาพต้องมีขนาดไม่เกิน 8 MB");
  const path = `machines/${machineId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await sb.storage.from(CONFIG.storageBucket).upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
}

export async function uploadProfilePhoto({ profileId, file }) {
  const sb = requireSupabase();
  if (!file?.type?.startsWith("image/")) throw new Error("รองรับเฉพาะไฟล์รูปภาพ");
  if (file.size > 8 * 1024 * 1024) throw new Error("รูปภาพต้องมีขนาดไม่เกิน 8 MB");
  const path = `profiles/${profileId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await sb.storage.from(CONFIG.storageBucket).upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
}

export function normalizeStoragePath(path) {
  const raw = clean(path);
  if (!raw) return "";
  let out = raw;
  try {
    if (/^https?:\/\//i.test(out)) {
      const url = new URL(out);
      out = decodeURIComponent(url.pathname || "");
    }
  } catch {}
  out = out.replace(/^\/+/, "");
  out = out.replace(/^storage\/v1\/object\/(?:public|sign)\//, "");
  out = out.replace(/^object\/(?:public|sign)\//, "");
  if (out.startsWith(`${CONFIG.storageBucket}/`)) out = out.slice(CONFIG.storageBucket.length + 1);
  const publicSegment = `/object/public/${CONFIG.storageBucket}/`;
  const signSegment = `/object/sign/${CONFIG.storageBucket}/`;
  if (out.includes(publicSegment)) out = out.split(publicSegment)[1] || out;
  if (out.includes(signSegment)) out = out.split(signSegment)[1] || out;
  const tokenIndex = out.indexOf("?");
  if (tokenIndex >= 0) out = out.slice(0, tokenIndex);
  return out.replace(/^\/+/, "");
}

export async function signedImageUrl(path, expires = 900) {
  const normalized = normalizeStoragePath(path);
  if (!normalized) return "";
  const sb = requireSupabase();
  const { data, error } = await sb.storage.from(CONFIG.storageBucket).createSignedUrl(normalized, expires);
  if (!error && data?.signedUrl) return data.signedUrl;
  const { data: pub } = sb.storage.from(CONFIG.storageBucket).getPublicUrl(normalized);
  if (pub?.publicUrl) return pub.publicUrl;
  try {
    const { data: blob, error: downloadError } = await sb.storage.from(CONFIG.storageBucket).download(normalized);
    if (!downloadError && blob) return URL.createObjectURL(blob);
  } catch {}
  return "";
}

export async function rpc(name, args = {}) {
  const sb = requireSupabase(); const { data, error } = await sb.rpc(name, args); if (error) throw error; return data;
}
