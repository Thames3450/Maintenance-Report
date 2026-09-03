# QA v2.22 — Native One-Tap + Reliable Save

วันที่ตรวจ: 3 กันยายน 2569

## อาการที่พบจากระบบจริง
- LINE in-app browser บน Android ต้องแตะช่องรูปซ้ำในบางครั้ง เพราะหน้าเว็บใช้ `input.click()` ไปเรียก input ที่ซ่อนไว้นอกหน้าจอ
- การทดสอบจริง 3 รอบอัปโหลดรูปครบ 3 รูป แต่ RPC `mvr_create_repair_report` ตอบ HTTP 400
- Postgres log ระบุ `Uploaded image object not found`
- สาเหตุคือ RLS ของ `storage.objects`: รูปใหม่ยังไม่ได้ผูกกับ `repair_images` จึงถูก `private.can_read_media()` ซ่อนไว้ แต่ RPC ต้องอ่าน object ก่อนถึงจะสร้าง `repair_images` ได้ เป็น circular dependency

## สิ่งที่แก้ใน v2.22
### 1) แนบรูปแตะเดียว
- ไม่ใช้ `input.click()` แล้ว
- ใช้ `<input type="file">` จริงเป็น hit target โปร่งใสเต็มการ์ด
- user gesture ไปถึง native file picker โดยตรง เหมาะกับ LINE WebView / mobile browser
- ปุ่มลบวาง z-index สูงกว่า input จึงยังลบรูปได้ปกติ
- เลือกรูปเดิมซ้ำได้ โดย reset input value ตอนแตะ

### 2) เตรียมรูปก่อนกดบันทึก
- ย่อรูปทันทีหลังผู้ใช้เลือกรูป ไม่รอไปทำตอนกด Save
- เป้าหมายด้านยาวสูงสุด 1600px
- JPEG quality ลดแบบขั้นบันได 0.78 → 0.70 → 0.62 เมื่อไฟล์ยังใหญ่
- เป้าหมายไฟล์ประมาณ <= 650 KB เมื่อ browser แปลงได้
- มี fallback จาก `createImageBitmap()` ไป `<img> + canvas` สำหรับ WebView/browser ที่รองรับไม่ครบ
- ระหว่างเตรียมรูปมีสถานะ `กำลังเตรียมรูป…`

### 3) บันทึกเร็วขึ้นและคงความปลอดภัยเดิม
- อัปโหลด Before / Evidence / After พร้อมกันต่อไป
- retry แต่ละรูปได้ 1 ครั้งเมื่อ network error
- RPC ทำงานหลังอัปโหลดครบ
- ถ้า RPC หรือ upload ล้มเหลว ยัง cleanup object ที่อัปโหลดสำเร็จแล้ว

### 4) แก้ backend RLS
- migration: `supabase/migrations/011_repair_upload_owner_read_fix.sql`
- เพิ่มสิทธิ์ SELECT metadata ของไฟล์เฉพาะ prefix `repair/{auth.uid()}/...` ของเจ้าของเอง
- admin และ `private.can_read_media()` เดิมยังใช้งานได้

## ผลตรวจ backend หลังแก้
- จำลอง JWT ของช่างรหัส 159172 แล้ว SELECT `storage.objects` ของตนเอง: เห็นครบ 3/3 object
- เรียก `mvr_create_repair_report()` ด้วยรูปจริง 3 รูปภายใน transaction: ผ่านและคืน report UUID สำเร็จ
- transaction ถูก rollback หลัง QA จึงไม่สร้างรายงานทดสอบค้างในฐานข้อมูล

## Static code checks
- `useRef` / programmatic `.click()` ใน photo picker: ไม่มี
- native file input: มี และครอบเต็ม upload card
- pre-compress ตอนเลือกไฟล์: มี
- parallel upload: มี
- RPC save: มี
- cleanup เมื่อส่งล้มเหลว: มี

## หมายเหตุการ build
เครื่องตรวจแบบออฟไลน์ไม่มี `vite`/`node_modules` และไม่สามารถดาวน์โหลด dependency เพิ่มได้ จึงตรวจ source/static path แทนการรัน `npm run build` ใน session นี้
