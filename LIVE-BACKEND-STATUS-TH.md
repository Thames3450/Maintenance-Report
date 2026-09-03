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
