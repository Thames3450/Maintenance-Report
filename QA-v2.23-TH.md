# QA v2.23 — KPI CLEAN OVERVIEW

## เป้าหมาย
ปรับหน้า KPI ให้ตรงกับ mockup ที่อนุมัติ: อ่านง่าย เน้น KPI สำคัญ และลดความรกของหน้าจอ

## สิ่งที่เปลี่ยน
- เปลี่ยนหัวหน้า KPI เป็นแบบเรียบสว่าง
- รวมตัวกรองช่วงวันที่ / แผนก / กลุ่มเครื่องจักรไว้แถวเดียว
- เหลือ KPI หลัก 5 ใบ: จำนวนเครื่อง, เครื่อง Breakdown, Downtime, MTTR, Availability
- เพิ่มรายการประสิทธิภาพแบบแถว แสดงสถานะ, Breakdown, Downtime, MTTR และ Availability
- รายการถูกจัดเรียงตาม Availability
- คลิกแถวเพื่อเจาะกลุ่มหรือเครื่องจักรได้
- กราฟ, Pareto, Machine Health, PM/TPM และ Breakdown ล่าสุดยังอยู่ครบ แต่ย้ายไปใน “การวิเคราะห์เพิ่มเติม” และปิดไว้เป็นค่าเริ่มต้น
- ไม่มีการแก้ RPC, ตาราง Supabase หรือสูตร KPI ใน backend

## ตรวจสอบโค้ด
- ตรวจสมดุลวงเล็บ/ปีกกาใน `src/modules/kpi.jsx` แล้ว
- ตรวจชื่อ component/state ที่เพิ่มใหม่แล้ว
- ไม่สามารถรัน `npm build` ใน sandbox นี้ได้ เพราะ dependency ไม่ได้ถูก cache และไม่มี network package install
