# QA v2.28.0

## Source QA
- TypeScript parser (`tsc` JSX parse) ผ่านสำหรับ App + modules ใหม่ + Command Center
- ตรวจ brace/parenthesis balance ผ่าน
- `repair.jsx` checksum ตรงกับ v2.27
- `pm.jsx` checksum ตรงกับ v2.27
- root `repair.js` checksum ตรงกับ v2.27
- root `pm.js` checksum ตรงกับ v2.27

## Supabase Live
Migration `people_manager_workspace_v228` ถูก Apply สำเร็จใน Project `MPR Maintenance`.

ตรวจพบตาราง:
- skill_catalog
- technician_skills
- manager_tasks
- manager_weekly_reviews

Skill Catalog เริ่มต้น: 12 รายการ
RLS Policy: 4 policies ต่อ table (SELECT / INSERT / UPDATE / DELETE) สำหรับ Admin

## หมายเหตุ Build
สภาพแวดล้อมตรวจ QA นี้ไม่มี Vite dependencies ติดตั้งอยู่ จึงไม่ได้รัน `vite build` ใน container แต่ JSX parser ผ่านโดยไม่มี syntax error.
