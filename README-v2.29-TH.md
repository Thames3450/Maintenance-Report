# v2.29.0 — Spare Request Collection

ระบบรวบรวมความต้องการอะไหล่สำหรับ Maintenance โดย **ไม่ทำระบบ Stock / PO / Supplier**

## Workflow

ช่างหรือ Admin/Engineer แจ้งรายการ → Admin ตรวจสอบ → ข้อมูลครบ → รอรวบรวม → สร้าง Batch → Export Excel/CSV → ส่งฝ่ายจัดซื้อ → ติดตาม → ปิดรายการ

## ฝั่งช่าง

- เพิ่มเมนู `ขออะไหล่`
- เห็นเฉพาะรายการที่ตัวเองแจ้ง
- แผนกถูกล็อกตามโปรไฟล์ช่าง จึงไม่ข้ามแผนก
- เลือกเครื่องแบบค้นหาเลขเครื่อง/ชื่อเครื่อง
- กรอก ชื่ออะไหล่, Part No. (ถ้าทราบ), Specification, จำนวน, หน่วย, เหตุผล
- ไม่มีช่อง “ต้องการใช้วันที่”
- ระดับใช้คำง่าย: `เร่งด่วน / ตามแผน / ปรับปรุง`
- แนบรูปได้ 3 ประเภท: รูปอะไหล่ / Nameplate / จุดติดตั้ง
- ดูสถานะของรายการตัวเองได้

## ฝั่ง Admin / Engineer

- สามารถสร้าง Spare Request เองได้ ไม่จำกัดว่าต้องมาจากช่าง
- เลือกที่มา: ช่างแจ้ง / Engineer / Breakdown / PM / Inspection / Other
- กรองตามแผนกและสถานะ
- ค้นหา Part No., ชื่ออะไหล่, เครื่อง, ผู้แจ้ง
- ตรวจและแก้ชื่อ/Part No./Spec ให้เป็นมาตรฐานโดยเก็บข้อมูลต้นฉบับไว้ในฐาน
- สถานะ: แจ้งใหม่ → รอตรวจสอบ → รอรวบรวม → ส่งจัดซื้อแล้ว → รอติดตาม → ปิดรายการ
- เห็น Waiting Days ตามเวลาที่ค้างในสถานะปัจจุบัน
- เลือกรายการ `รอรวบรวม` แล้วสร้าง Purchase Batch
- Export UTF-8 CSV ที่เปิดด้วย Excel ได้
- กด `ส่งจัดซื้อแล้ว` เพื่อเปลี่ยนรายการทั้ง Batch เป็น Sent ในครั้งเดียว
- Command Center มีทางลัดและจำนวน Spare Request ที่ต้องจัดการ

## Database

เพิ่มแบบ Additive:

- `spare_requests`
- `spare_request_images`
- `spare_request_batches`
- RPC `create_spare_request_batch`
- RPC `mark_spare_request_batch_sent`
- RLS แยกสิทธิ์ช่างกับ Admin
- Storage ใช้ bucket เดิม `maintenance-media` แต่เพิ่ม path `spare/<auth.uid>/...`

Migration Live ถูกติดตั้งในโปรเจกต์ `MPR Maintenance` แล้ว

## Priority UI

Work Board / My Workspace ปรับข้อความที่แสดงเป็น:

- `เร่งด่วน`
- `ตามแผน`
- `ปรับปรุง`

ค่า P2/P3/P4 ยังเก็บหลังบ้านเพื่อ Compatibility กับข้อมูลเดิม แต่ไม่บังคับผู้ใช้ให้จำรหัส P
