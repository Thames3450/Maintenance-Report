# QA v2.24.2

- แก้กราฟ MTBF / MTTR / Availability ที่แสดง 0 เพราะ monthly_trend เดิมไม่มี KPI รายเดือน
- เพิ่ม RPC kpi_trend_metrics_v1 สำหรับ KPI รายวัน/รายเดือนจริง
- หน้า KPI เรียก RPC ใหม่และ merge กับ dashboard เดิม
- รองรับ field mtbf_hour ที่ backend ใช้จริง
- เดือนที่ไม่มี Breakdown แสดง MTBF/MTTR เป็น — ไม่ใช่ 0
- สีรายเดือน: เขียว=ดี เหลือง=เฝ้าระวัง แดง=แย่
