# QA v2.25 — Executive KPI Dashboard

## สิ่งที่ตรวจแล้ว
- Frontend เรียก `kpi_dashboard_v2` และ `kpi_trend_metrics_v1` จริง
- โหลดประวัติ KPI 6 เดือนแยกจากช่วงวันที่หลัก เพื่อให้ Monthly Comparison ใช้งานได้เสมอ
- MTBF ใช้ field `mtbf_hour` จาก backend
- MTTR ใช้ `mttr_min`
- Availability ใช้ `availability_pct`
- ค่า null ไม่ถูกแปลงเป็น 0; เดือนที่ไม่มี Breakdown แสดง No BD / — ตามความหมาย
- สีรายเดือนคำนวณจาก target (ถ้ามี) หรือแนวโน้มเดือนก่อน
- JSX ตรวจ syntax ด้วย TypeScript transpiler: 0 diagnostics
- Backend `kpi_trend_metrics_v1` ทดสอบแล้วมีค่ารายเดือนจริง

## โครงหน้าใหม่
1. Primary KPI: MTBF / MTTR / Availability
2. Supporting Loss: Downtime / Breakdown / Machines
3. 6-Month Performance Trend แบบ 3 แถวใน Timeline เดียวกัน
4. Latest Month Status พร้อมเทียบเดือนก่อน
5. Monthly Performance Matrix สีเขียว/เหลือง/แดง
6. Advanced Analysis เดิมยังอยู่ด้านล่าง
