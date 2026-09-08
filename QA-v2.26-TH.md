# QA v2.26 — Maintenance Command Center

## เป้าหมาย
เพิ่มหน้าบริหารสำหรับ Admin แบบ Minimal / Modern โดยไม่เปลี่ยน workflow ฝั่ง Technician

## สิ่งที่เพิ่ม
- Admin Command Center พร้อมตัวกรองทุกแผนก / MVR / MSR / LOTUS / IJ / MPR ตามฐานจริง
- KPI รายวัน: Breakdown, Loss Time, งานค้าง, P1/P2, PM Today, Active Technician, Critical A
- Priority Alert รวม Repair Follow-up และ Work Board
- Top Loss Machine ของเดือนปัจจุบัน
- Department Pulse เปรียบเทียบ Breakdown / Open Task / Technician / Machine
- Work Board แบบ Kanban: New → Assigned → Working → Waiting → Completed
- Priority P1 / P2 / P3 / P4
- Assign ช่าง, Machine, Department, Due date และ Waiting reason
- Filter งานตามแผนก และ "งานติดตามของฉัน"
- Machine Criticality A/B/C ในหน้า Admin > เครื่องจักร

## ฝั่งช่าง
ไฟล์ต่อไปนี้ไม่ถูกแก้ไขจาก v2.25.1:
- src/modules/repair.jsx
- src/modules/pm.jsx
- repair.js
- pm.js

ดังนั้น Repair Wizard, History และ PM ของ Technician ใช้ workflow เดิม

## Database
Work Board ใช้ตารางใหม่ `public.maintenance_tasks` แบบ Admin-only RLS
Migration:
`supabase/migrations/20260908_admin_maintenance_tasks.sql`

Migration เป็นแบบ additive:
- ไม่ Drop/Rename ตารางเดิม
- ไม่แก้ policy ของ Repair/PM ฝั่ง Technician
- เชื่อม FK กับ departments, machines, app_profiles, repair_reports

## หมายเหตุการทดสอบใน environment นี้
ตรวจสอบ source diff แล้วว่า Technician modules ไม่เปลี่ยนแปลง
ไม่สามารถติดตั้ง npm dependencies ใน runtime นี้ได้ภายใน timeout จึงยังไม่ได้รัน Vite production build ใน container
