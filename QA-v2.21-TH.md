# QA v2.21 — One Tap Photo + Fast Save

ตรวจแก้จากปัญหาบน iPhone ที่ต้องแตะช่องรูปสองครั้ง และการส่งรายงานใช้เวลานาน

## รูปภาพ
- เอา capture ออกจาก input ทั้งหมด
- ใช้ปุ่มจริงเรียก input.click() จาก user gesture โดยตรง
- input file ซ่อนไว้นอกหน้าจอ ไม่วาง overlay ทับการ์ด
- รองรับ image/* เพื่อให้ iOS แสดง คลังรูปภาพ / ถ่ายภาพ / เลือกไฟล์
- Preview ใช้ Object URL และ revoke เมื่อเปลี่ยน/ลบ เพื่อลด memory leak
- ลบรูปและเลือกใหม่ได้
- Validation ยังบังคับครบ Before / Evidence / After

## การบันทึก
- เปลี่ยน auth.getUser() เป็น auth.getSession() เพื่อตัด network request ที่ไม่จำเป็น
- รูปขนาดใหญ่จะถูกย่อสูงสุด 1920px และ JPEG quality 0.84 เมื่อ browser รองรับ
- หาก browser/HEIC ย่อไม่ได้ จะ fallback ใช้ไฟล์เดิม
- อัปโหลด 3 รูปพร้อมกันด้วย Promise.allSettled
- retry อัปโหลดแต่ละรูป 1 ครั้งเมื่อเกิด network error
- ถ้ามีรูปใดล้มเหลว ระบบ cleanup รูปที่อัปโหลดสำเร็จแล้ว เพื่อไม่ทิ้ง orphan object
- DB RPC จะถูกเรียกหลังรูปครบเท่านั้น
- มี progress state: เตรียมรูป → อัปโหลดรูป → บันทึกฐานข้อมูล

## Static checks
- capture= 0 จุด
- file input = 1 component กลางที่ reuse 3 ช่อง
- JSX brace / parenthesis balance ผ่าน
