# MVR Smart Maintenance v2.30.0 — Mobile Notification & PWA

## เพิ่มใหม่
- PWA manifest + service worker ติดตั้งบนมือถือได้
- Notification Center ภาษาไทย/อังกฤษ
- Push subscription ต่อบัญชีและอุปกรณ์
- Notification Preferences
- Admin เลือก Department ที่ต้องการติดตามได้
- Work Board เพิ่ม Assigned Shift A/B/O
- Routing: Department → Shift → Assignee
- งานเร่งด่วน / ตามแผน / ปรับปรุง ใช้คำไทย ไม่แสดง P1/P2/P3/P4 แก่ผู้ใช้
- Spare Request ใหม่และการอัปเดตสถานะแจ้งผู้เกี่ยวข้อง
- Edge Function `dispatch-maintenance-notification` บน Live Supabase

## ไม่เปลี่ยน
- ฟอร์ม Repair เดิม
- PM execution เดิม
- KPI เดิม
- การแจ้ง Emergency Production Stop ยังใช้ช่องทางเดิมของหน้างาน ไม่ส่งผ่าน Push นี้

## หมายเหตุ
Push จริงต้องตั้ง Supabase Edge Function Secret `VAPID_PRIVATE_KEY` หนึ่งครั้ง ดู `PUSH-SETUP-TH.md`.

## v2.30.1 Hotfix
หาก v2.30.0 แสดงข้อความ `more than one relationship was found for app_profiles and departments` ให้ใช้ v2.30.1 ซึ่งระบุ FK `app_profiles_department_id_fkey` ใน Profile query โดยตรง ไม่ต้องรัน SQL เพิ่ม
