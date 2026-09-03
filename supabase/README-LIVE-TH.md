# Supabase — Live Project Note

ชุด v2.0 นี้เชื่อมกับ Project `MPR Maintenance` (`hftlogubohbjiivcvkut`) และ migration ของระบบ v2 ถูก Apply ที่ Live Project แล้ว

**ห้ามรัน migrations ซ้ำแบบสุ่มบน Live Project** เพราะไฟล์ในโฟลเดอร์นี้เก็บเป็น Source/Reference ของ schema และ policy

Live v2 migrations ที่ Apply แล้ว:
- mvr_v2_core_schema
- mvr_v2_rls_audit
- mvr_v2_index_followup
- mvr_v2_repair_rpc
- mvr_v2_required_images_guard

Edge Functions ที่ Frontend ใช้:
- employee-code-login
- admin-login
- mvr-user-admin

สำหรับการสร้าง Project ใหม่ ให้ทบทวน migration 001–007 ตามลำดับและตรวจ legacy compatibility ก่อน apply โดยเฉพาะ 005 ที่เชื่อม Master Data เดิมของ Project MPR Maintenance (problems / causes / actions / area_points / production_lines / technicians)
