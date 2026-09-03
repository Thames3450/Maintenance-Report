# MVR Smart Maintenance v2.9

เวอร์ชันนี้ปรับ Admin Settings ใหม่เป็น Card-first + Modal editor เพื่อให้ใช้งานง่ายและไม่ล้นจอบนมือถือ/คอม พร้อมแก้ Admin History filter responsive และใช้ไอคอนนาฬิกาสำหรับเมนูประวัติ

# MVR Smart Maintenance v2.6

เว็บ React + Supabase สำหรับงานซ่อมบำรุง โดยเน้น Mobile-first, Modern Minimal และภาษาไทยด้วยฟอนต์ Sarabun

## Technician Portal
มีเพียง 3 เมนู:
1. กรอกรายงาน — Wizard 6 ขั้นตอน
2. ประวัติ — ค้นหา/กรอง/ดูรายละเอียด
3. งาน PM — งาน PM ที่ได้รับสิทธิ์ตามแผนก

ลำดับกรอกรายงาน:
1. กลุ่มเครื่อง
2. หมายเลขเครื่อง
3. จุดเสีย / อาการ
4. วิเคราะห์สาเหตุ / วิธีแก้ไข
5. เวลา / สถานะ / รูปภาพ
6. ทบทวนก่อนส่ง

Technician Login ใช้รหัสพนักงานอย่างเดียวผ่าน Edge Function `employee-code-login` และ RLS จำกัดตามแผนก

### สิทธิ์แก้ไข/ลบของช่าง

Technician สามารถเปิดประวัติงานของตัวเองแล้วกด `แก้ไขรายงาน` หรือ `ลบรายงานถาวร` ได้ โดย RLS บังคับให้แก้ไข/ลบได้เฉพาะรายงานที่ `technician_id` ตรงกับโปรไฟล์ของผู้ใช้และอยู่ในแผนกเดียวกันเท่านั้น ช่างไม่สามารถแก้หรือลบรายงานของคนอื่นได้ ส่วน Admin ยังจัดการรายงานทั้งหมดได้เหมือนเดิม

## Admin Portal
แยกจาก Technician โดยมี Dashboard, Repair Reports, PM/TPM, KPI และ System Management

### เครื่องจักรและรูปเครื่อง
- Admin อัปโหลดรูปเครื่องได้จากหน้าเครื่องจักร
- รองรับ Drag & Drop และกดเลือกไฟล์
- มี Preview ก่อนบันทึก
- รูปเครื่องถูกเก็บใน Private Storage และอ้างอิงผ่าน `machines.photo_path`
- ช่างเห็นรูปเครื่องเฉพาะเครื่องในแผนกที่ RLS อนุญาต

## UI v2.6
- Modern Minimal สีฟ้า/ขาว/เทาอ่อน
- Sarabun + JetBrains Mono
- Searchable decorated dropdowns
- History เป็น Premium Table บน Desktop และ Luxury Cards บน Mobile
- ตัวกรองประวัติพับ/ขยายได้
- Detail modal responsive พร้อม photo gallery และ lightbox
- Machine cards แสดงรูปเครื่องเมื่อ Admin อัปโหลดไว้
- รูป Repair ลบก่อนส่งได้
- มีหน้าทบทวนก่อนส่งแยกเป็น Step สุดท้าย
- Streamline icon assets

## วิธีรัน
```powershell
npm.cmd install
npm.cmd run dev
```
เปิด `http://localhost:5173`

## Supabase
`.env` เชื่อมโปรเจกต์เดิมไว้แล้ว และ backend migration v2 ถูก apply ในโปรเจกต์เดิมแล้ว ไม่ควรรัน migration ซ้ำโดยไม่ตรวจสถานะฐานก่อน

Frontend ใช้ Publishable Key เท่านั้น ห้ามใส่ Service Role Key ลงในไฟล์เว็บ


## อัปเดต v2.7
- ผลหลังซ่อมมี 3 ค่า: **ใช้งานได้ปกติ / ไม่มีอะไหล่ / ต้องติดตามต่อ**
- เมนู **ประวัติ** ฝั่งช่างใช้ไอคอนนาฬิกา Streamline `Time-Clock-Circle`
- ทุก Repair Report บังคับแนบรูป **ก่อนซ่อม + จุดเสีย + หลังซ่อม** ครบ 3 รูป
- ถ้าข้อมูลไม่ครบจะแสดง Validation Card ระบุรายการที่ขาดและกดกลับไปแก้ขั้นตอนนั้นได้
- Supabase live migration `mvr_v27_repair_result_required_photos` ถูกใช้กับโปรเจกต์ MPR Maintenance แล้ว

## v2.8 — โหมดการกรอกแยกตามแผนก + Master Data ตามเครื่อง
- Admin ตั้งโหมด `จุดเสีย + อาการเสีย` เป็น **ใช้ตัวเลือกตามเครื่อง** หรือ **กรอกเอง** ได้
- Admin ตั้งโหมด `สาเหตุ + วิธีแก้ไข` แยกต่างหากได้
- เมื่อใช้ตัวเลือก ช่างเห็นเฉพาะรายการที่ Admin ผูกกับเครื่องที่เลือกเท่านั้น
- ถ้าเครื่องยังไม่มี Mapping จะไม่มี Dropdown ให้เลือกและไม่มี Free Text fallback
- Mapping เดิมที่เคยผูกกับ Production Line ถูก seed มาเป็นรายเครื่องแล้วใน Live Supabase
- ตารางใหม่: `machine_problem_map`, `machine_cause_map`, `machine_action_map`

## KPI Analytics v2.17
หน้า KPI รองรับการกรองตาม แผนก → กลุ่ม/Zone → หมายเลขเครื่อง → ช่วงวันที่ และแสดง Machine Health รายเครื่อง, Trend, Pareto, Cause, Action, Severity, Repair Result, Technician workload และ PM performance


## v2.19 KPI Analytics
- KPI Dashboard แบบเจาะระดับแผนก / Zone / หมายเลขเครื่อง / ช่วงเวลา
- Searchable dropdown สำหรับเครื่องจำนวนมาก เช่น IJ
- Trend Downtime และ Breakdown
- Pareto ปัญหา จุดเสีย สาเหตุ ประเภทปัญหา ความรุนแรง ผลหลังซ่อม และกะ
- Machine Health รายเครื่อง พร้อม MTTR / MTBF / Availability
- วิเคราะห์ภาระงานช่าง, Action ที่ใช้บ่อย, PM performance และ Breakdown ล่าสุด


## v2.20 Mobile Photo Picker
- ช่องแนบรูปงานซ่อมบนมือถือไม่บังคับเปิดกล้องอีกต่อไป
- แตะช่องรูปแล้วสามารถเลือก ถ่ายรูป / Photo Library / Gallery / Files ตามเมนูของอุปกรณ์
- ยังคงบังคับแนบรูป ก่อนซ่อม / จุดเสีย / หลังซ่อม ตามกฎเดิม
