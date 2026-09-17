# MVR Smart Maintenance v2.36.1

## แยก KPI ออกจากระบบหลัก

เวอร์ชันนี้เอาฟังก์ชัน KPI ออกจากเว็บ Maintenance หลักทั้งหมดแล้ว

- ไม่มีเมนู KPI
- ไม่มีหน้า KPI / Dashboard KPI
- ลบโมดูล KPI ออกจาก Frontend แล้ว
- ลิงก์ `#/kpi` จะไม่เปิด KPI และจะกลับไปหน้าที่บัญชีมีสิทธิ์ใช้งาน
- ข้อความในแบบฟอร์ม Repair ไม่อ้างถึง KPI แล้ว
- งานซ่อม, PM/TPM, Spare Request, Work Board, Team Management และ Command Center ยังทำงานตามเดิม

> หมายเหตุ: ไม่ลบข้อมูลและฟังก์ชัน KPI ใน Supabase เพื่อเก็บไว้ใช้กับเว็บ KPI แยกในอนาคต
