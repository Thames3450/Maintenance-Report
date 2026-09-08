# QA v2.29.0

- ตรวจ JS/JSX source ด้วย TypeScript parser: PASS
- เพิ่ม Spare Request route ฝั่ง Admin และ Technician
- ฝั่ง Technician เดิม `repair.jsx`, `pm.jsx`, `repair.js`, `pm.js` ไม่ถูกแก้
- ไม่มี field “ต้องการใช้วันที่” ใน Spare Request
- Admin และ Technician สามารถสร้างรายการได้ตามสิทธิ์
- Technician RLS เห็นเฉพาะ Spare Request ของตัวเอง
- Admin RLS เห็น/แก้/จัด Batch ได้ทั้งหมด
- Storage private bucket เดิม รองรับรูป path `spare/<auth.uid>/...`
- Live DB: `spare_requests`, `spare_request_images`, `spare_request_batches` สร้างแล้ว
- RLS policies: spare_requests 4, spare_request_images 3, spare_request_batches 4
- Security Advisor หลัง migration เหลือเฉพาะคำเตือนเดิม `Leaked Password Protection Disabled`; ไม่มี SECURITY DEFINER warning จาก v2.29
- เพิ่ม indexes สำหรับ Foreign Keys ของตาราง v2.29
- Package build ไม่ได้รันใน sandbox เนื่องจาก environment ไม่มี Vite/node_modules และ npm install timeout; ใช้ TypeScript JSX parser ตรวจ syntax แทน
