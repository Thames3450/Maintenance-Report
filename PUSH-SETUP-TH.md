# v2.30 — เปิด Mobile Push Notification

ฐานข้อมูลและ Edge Function `dispatch-maintenance-notification` ถูกติดตั้งบน Live Supabase แล้ว
เหลือขั้นตอนเดียวที่ต้องทำด้วยบัญชีเจ้าของ Project: ตั้ง Edge Function Secret ชื่อ `VAPID_PRIVATE_KEY`.

## วิธีตั้ง
1. เข้า Supabase Project `MPR Maintenance` (`hftlogubohbjiivcvkut`).
2. ไปที่ **Edge Functions → Secrets** (บาง UI อยู่ที่ **Project Settings → Edge Functions → Secrets**).
3. สร้าง Secret ชื่อ `VAPID_PRIVATE_KEY`.
4. ใช้ Private Key ที่ส่งแยกต่างหากจากไฟล์ Source. **ห้ามใส่คีย์นี้ใน GitHub หรือไฟล์ .env ฝั่งเว็บ**.
5. Save แล้วเปิดเว็บเวอร์ชัน v2.30 → **Notifications / การแจ้งเตือนมือถือ** → **เปิดการแจ้งเตือน** → **ทดสอบแจ้งเตือน**.

Public VAPID key ถูกใส่ใน `.env` / `.env.example` แล้วและสามารถอยู่ฝั่งเว็บได้ตามปกติ.

## Routing ที่เปิดใช้ใน v2.30
- Work Board: ถ้าระบุชื่อ → ส่งตรงผู้รับผิดชอบคนนั้น
- Work Board: ถ้าไม่ระบุชื่อ → ส่งเฉพาะ Department + Shift A/B/O ที่เลือก
- Spare Request ใหม่ → แจ้ง Admin ที่เลือกติดตาม Department นั้น
- Spare Request ส่งจัดซื้อ / ต้องติดตาม / ปิด → แจ้งกลับผู้แจ้งรายการ
- ส่ง Purchase Batch → แจ้งผู้แจ้งใน Batch ของตัวเอง

ไม่มี P1 / Emergency Push ในระบบนี้ตาม Workflow หน้างานที่ตกลงไว้.
