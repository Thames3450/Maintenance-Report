# QA v2.30.2 — VAPID Public Key Build Fix

- แก้ GitHub Pages build ที่ไม่ได้รับ `VITE_VAPID_PUBLIC_KEY` เพราะ `.env` ถูก ignore ตามปกติ
- เพิ่ม Public VAPID Key ใน GitHub Actions build environment
- เพิ่ม fallback Public VAPID Key ใน `src/notifications.js` เพื่อให้ระบบยังทำงานแม้ build environment ไม่ส่งตัวแปรมา
- Public VAPID Key สามารถอยู่ฝั่ง client ได้; Private Key ยังคงอยู่เฉพาะ Supabase Edge Function Secret
- ไม่เปลี่ยน schema / database / Repair / PM workflow
