# QA v2.27.0 — Executive Command Center

## ขอบเขตการเปลี่ยนแปลง
- ปรับเฉพาะฝั่ง Admin / หัวหน้างาน
- ไม่เปลี่ยน Repair Wizard, Repair History, PM execution และ workflow ฝั่งช่าง
- แยกสถานะจากคำว่า “งานค้าง” เป็น 3 กลุ่มชัดเจน: รออะไหล่ / ต้องติดตาม / งานมอบหมายค้าง
- เพิ่ม Criticality A/B/C และ Critical A Risk Watch
- ปรับ Command Center เป็น Minimal / Modern สำหรับดูบน Desktop และ Mobile

## Criticality
- A = Production Stop
- B = Production Impact
- C = General / Support

## Live DB ณ 2026-09-08
- IJ: A 53 / B 15
- MVR: A 12 / B 4
- MVR-LOTUS: A 16 / B 4 / C 5
- ค่าเดิม High/Medium ถูก normalize เป็น A/B

## ตรวจสอบ
- Work Board ใช้ maintenance_tasks เดิม
- Dashboard อ่านข้อมูล Live เท่านั้น ไม่มีการเปลี่ยน schema เพิ่มใน v2.27
- Admin > เครื่องจักร แสดงจำนวน A/B/C และแก้ Criticality ได้จาก modal เดิม
