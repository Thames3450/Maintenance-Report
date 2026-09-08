# QA v2.30.1 — Profile Relationship Fix

## แก้ไข
- แก้หน้าเว็บขึ้น `Could not embed because more than one relationship was found for 'app_profiles' and 'departments'` หลังเพิ่มระบบ Notification Routing
- ระบุ Foreign Key ของแผนกใน `loadMyProfile()` แบบชัดเจนด้วย `app_profiles_department_id_fkey`
- ไม่เปลี่ยนโครงสร้างข้อมูลฝั่งช่าง และไม่ต้องรัน SQL เพิ่ม

## สาเหตุ
ตาราง `notification_department_subscriptions` ทำให้ PostgREST มองเห็นเส้นทางความสัมพันธ์ระหว่าง `app_profiles` และ `departments` มากกว่าหนึ่งแบบ จึงต้องระบุ Foreign Key โดยตรงในการ embed แผนกของผู้ใช้

## ผลที่คาดหวัง
- Login แล้วโหลด Profile ได้ตามปกติ
- Admin และ Technician เข้าเว็บได้
- Department ของผู้ใช้ยังถูกโหลดจาก `app_profiles.department_id`
- Notification routing ยังคงทำงานตามแผนกที่สมัครติดตาม
