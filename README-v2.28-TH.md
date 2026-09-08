# MVR Smart Maintenance v2.28.0 — People & Manager Workspace

เวอร์ชันนี้ต่อยอดจาก v2.27 โดยเน้นฝั่ง Admin/หัวหน้างาน และ **ไม่เปลี่ยน Workflow ฝั่งช่าง**

## สิ่งที่เพิ่ม

### Modern Admin Sidebar
- ย้ายเมนู Admin ไปด้านซ้าย
- แบ่งกลุ่ม CONTROL / PEOPLE / MAINTENANCE / ANALYTICS / SYSTEM
- ทุกเมนูมีชื่ออังกฤษ + คำอธิบายภาษาไทย
- Desktop ใช้ Sidebar คงที่
- Mobile ใช้ Sidebar แบบเลื่อนออกจากด้านซ้าย

### Team Management / จัดการทีมช่าง
- Team Overview
- Technician Profile
- Skill Matrix ระดับ 0–5
- Technician Workload แบบถ่วงน้ำหนัก P1=5, P2=3, P3=2, P4=1
- ดู Active Jobs / P1-P2 / Repairs เดือนนี้ / Follow-up
- แก้ Skill ของช่างได้จาก Matrix

Skill เริ่มต้น 12 หมวด:
Mechanical, Electrical, PLC, HMI, Servo, Robot, Hydraulic, Pneumatic, Injection Machine, Vacuum Forming, Crane, Welding

### My Workspace / งานของฉัน
- Today / วันนี้
- Follow-up / ติดตาม
- Waiting For / รอผู้อื่น
- Improvement / งานปรับปรุง
- Overdue / เกินกำหนด
- Weekly Manager Review
- Top 3 Next Week

### Command Center
- เพิ่ม Shortcut ไป Team Management และ My Workspace
- สรุปจำนวนช่าง Active และงานส่วนตัว Today / Waiting

## Supabase
Migration: `supabase/migrations/20260908_people_manager_workspace.sql`

เพิ่มแบบ Additive เท่านั้น:
- `skill_catalog`
- `technician_skills`
- `manager_tasks`
- `manager_weekly_reviews`

เปิด RLS และกำหนดให้ Admin เท่านั้นอ่าน/แก้ข้อมูลชุดนี้ได้

## ฝั่งช่าง
ไฟล์หลักฝั่งช่างไม่ได้แก้จาก v2.27:
- `src/modules/repair.jsx`
- `src/modules/pm.jsx`
- `repair.js`
- `pm.js`

ดังนั้นการกรอกรายงานซ่อม / ประวัติ / งาน PM ของช่างยังเป็น Workflow เดิม
