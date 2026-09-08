# QA v2.28.1

- เพิ่ม Department filter ใน Admin > เครื่องจักร
- เพิ่มค้นหาเลขเครื่อง / ชื่อ / กลุ่ม / ไลน์
- เพิ่ม Criticality filter A/B/C
- Filter bar เป็น sticky
- กลุ่มเครื่องและรายการเครื่องใช้แผนกเดียวกัน
- ตัวเลข Criticality นับตามแผนก/คำค้น โดยไม่ถูกซ่อนตามปุ่ม A/B/C
- ไม่แก้ Database schema
- ฝั่งช่างไม่เปลี่ยน: repair.jsx, pm.jsx, repair.js, pm.js checksum ตรง v2.28.0

หมายเหตุ: การ build ใน sandbox ไม่สามารถรันได้เนื่องจาก environment ไม่มี vite/node_modules; source package เดิมเป็น Vite project และการแก้ไขจำกัดเฉพาะ admin.jsx + shell.css + docs/version.
