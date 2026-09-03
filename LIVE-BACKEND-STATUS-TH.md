# Live Backend Status — MPR Maintenance

Supabase project: `hftlogubohbjiivcvkut`

อัปเดต v2.8 แล้ว:
- เพิ่ม `machine_problem_map`
- เพิ่ม `machine_cause_map`
- เพิ่ม `machine_action_map`
- Seed mapping เดิมจาก Production Line ไปเป็นรายเครื่อง
- RLS: Technician อ่าน mapping ได้เฉพาะเครื่องในแผนกตัวเอง / Admin จัดการได้
- Backend trigger ตรวจ Problem/Cause/Action ว่าต้องถูกผูกกับเครื่องที่เลือก
- Department มีโหมดแยก 2 กลุ่ม: จุดเสีย+อาการ และ สาเหตุ+วิธีแก้ไข
- ถ้าใช้ Master Mode แล้วไม่มี mapping: ไม่มีตัวเลือกและห้าม Free Text fallback

## อัปเดต v2.17 — KPI Analytics + เครื่องจักร IJ
- เพิ่ม RPC `kpi_dashboard_v2` สำหรับวิเคราะห์ Repair ตามแผนก / กลุ่มเครื่อง / เครื่อง / ช่วงวันที่
- KPI ครอบคลุม Downtime, Breakdown, MTTR, MTBF, Availability, Pareto, Cause, Action, Severity, Status, Technician และ Machine Health
- เพิ่มเครื่องจักร IJ 68 เครื่อง
  - Injection 53 เครื่อง
  - Crane 6 เครื่อง
  - Vacuum Pump 9 เครื่อง
  - Injection มี Robot 48 เครื่อง / ไม่มี Robot 5 เครื่อง
- เพิ่มฟิลด์ `machines.equipment_type` และ `machines.has_robot`
- กลุ่ม IJ: Zone A1, Zone A2, Zone A3, Zone A4, Crane, Vacuum Pump
