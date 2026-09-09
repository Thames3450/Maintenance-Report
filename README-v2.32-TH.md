# MVR Smart Maintenance v2.32.0

## Vacuum Problem Master Cleanup

เวอร์ชันนี้ปรับปรุงรายการอาการเสียของเครื่อง IVF/DVF ให้ใช้งานจริงบนโทรศัพท์ได้ง่ายขึ้นและลดความหมายซ้ำ

- ลด Mapping อาการของ IVF/DVF จาก 74 เหลือ 51 รายการมาตรฐาน
- ไม่มีชื่ออาการซ้ำกันในรายการที่ช่างเห็น
- แยกเป็น 9 ระบบ: Vacuum, Heater, Clamp/Forming, Loading/Transfer, Air/Hydraulic, Electrical/Control, Water/Cooling, Safety, Mechanical
- ตัดรายการของ Crusher / Conveyor / Lift Conveyor ที่เคยปนออกจาก IVF/DVF
- ตัด TPM/PM และรายการที่ไม่เหมาะเป็นอาการเสียออกจาก Mapping ของ IVF/DVF
- รวม/ตัดคำซ้ำ เช่น PLC, Wiring, Motor, Safety Door และ Vacuum pressure
- ปรับชื่อ Cylinder / Reed Switch ให้แยกความหมายชัดเจน
- ช่างยังไม่สามารถเพิ่มอาการเองได้ หากไม่พบให้แจ้ง Engineer/Admin
- ประวัติ Repair เดิมไม่ถูกแก้ไข

## Mobile Flow

1. เลือกระบบที่มีปัญหา
2. เลือกอาการเฉพาะระบบนั้น
3. Dropdown ใช้ Bottom Sheet แบบมือถือเหมือน v2.31.1

Supabase Live ได้อัปเดต Master Mapping แล้ว ไม่ต้องรัน SQL เพิ่มหลัง Deploy Frontend
