# QA Report — MVR Smart Maintenance v2.9

## UI / Responsive
- Admin Settings เปลี่ยนเป็น Card-first + Modal editor ทุกโมดูลหลัก
- กำหนด grid เป็น minmax(0,1fr) และทุก card/field ใช้ min-width:0
- History Admin filter เปลี่ยนจากการบังคับอยู่แถวเดียวเป็น responsive grid หลายแถว
- Mobile modal เป็น bottom sheet, Desktop modal อยู่กลางหน้าจอ
- Master machine mapping จำกัดความสูงและ scroll ภายใน modal
- Top navigation รองรับ horizontal overflow โดยไม่ดัน viewport
- ไอคอนประวัติใช้ Time-Clock-Circle จาก Streamline โดยตรง

## Static checks
- JSX parse ผ่านด้วย TypeScript parser
- local import audit ผ่าน
- CSS brace balance ผ่าน
- Service Role key ใน frontend = 0
- Streamline history icon file exists

## Backend
- ไม่มี schema mutation เพิ่มใน v2.9; ใช้ Supabase backend v2.8 เดิม
- RLS / machine-specific master mappings / required repair photos คงเดิม

## v2.17 QA
- JSX/JS syntax check: ผ่าน 7 ไฟล์, 0 error
- Local import check: 0 missing
- CSS brace balance: ผ่าน
- Supabase KPI RPC: `kpi_dashboard_v2` ใช้งานได้
- IJ machine master: 68 เครื่อง (Injection 53 / Crane 6 / Vacuum Pump 9)
- Security advisor: ไม่มี warning ใหม่จาก KPI RPC
