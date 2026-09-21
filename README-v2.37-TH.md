# v2.37.0 — IJ Structured Repair Master

- ใช้เฉพาะเครื่อง Injection ในแผนก IJ
- Flow: Zone/System -> Component -> Symptom
- Cause และ Action ให้ช่างพิมพ์เองตามงานจริง
- เพิ่ม Material Leak เป็นอาการมาตรฐาน
- ถ้าเลือก Material Leak ระบบบังคับกรอก Mold Model / Mold No. ก่อนส่ง
- ข้อมูล Zone / Component / Symptom ถูกบันทึกเป็น structured fields เพื่อใช้วิเคราะห์ภายหลัง
- Crane และ Vacuum Pump ใน IJ ยังใช้รูปแบบเดิม ไม่ถูกบังคับด้วย Injection Master
