// URL ของ Google Apps Script 
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzHtghzQh5SVQcA3CmvCUHM6OPUSsOam95ex7s5N3HahS9jp1FPj_54ebTQ9jDuPAlGQA/exec";

let masterData = { machines: [], areaPoints: [], problems: [], causes: [], actions: [], technicians: [] };
const choicesMap = {}; // เก็บ Instance ของ Choices.js

// Elements
const form = document.getElementById("repairForm");
const repairDateEl = document.getElementById("repairDate");
const technicianIdEl = document.getElementById("technicianId");
const technicianNameEl = document.getElementById("technicianName");
const machineEl = document.getElementById("machine");
const machineNoEl = document.getElementById("machineNo");
const lineEl = document.getElementById("line");
const areaPointEl = document.getElementById("areaPoint");
const problemEl = document.getElementById("problem");
const causeEl = document.getElementById("cause");
const actionEl = document.getElementById("action");
const startRepairEl = document.getElementById("startRepair");
const endRepairEl = document.getElementById("endRepair");
const lossTimeEl = document.getElementById("lossTime");
const breakdownTypeEl = document.getElementById("breakdownType");
const resetBtn = document.getElementById("resetBtn");
const submitBtn = document.getElementById("submitBtn");
const systemStatusEl = document.getElementById("systemStatus");
const systemIndicatorDot = document.querySelector(".dot");

document.addEventListener("DOMContentLoaded", async () => {
  initChoicesDropdowns();
  setDefaultDate();
  bindEvents();
  await loadMasterData();
});

// ฟังก์ชันเสก Dropdown ทุกอันในหน้าเว็บ พร้อมระบบกันบั๊กซ้อนทับ
function initChoicesDropdowns() {
  document.querySelectorAll('select').forEach(el => {
    const choiceInstance = new Choices(el, {
      searchEnabled: true,
      itemSelectText: '', // ซ่อนข้อความ 'Press to select' น่ารำคาญ
      shouldSort: false,  // เรียงตามข้อมูลใน Sheet ไม่ต้องจัด A-Z ใหม่
      searchPlaceholderValue: 'พิมพ์ค้นหา...',
      noResultsText: 'ไม่พบข้อมูลที่ค้นหา',
      noChoicesText: 'ไม่มีตัวเลือก',
      position: 'bottom', // บังคับให้ Dropdown เด้งลงล่างเสมอ (กันบั๊กเด้งขึ้นบน)
    });
    
    choicesMap[el.id] = choiceInstance;

    // [HOTFIX] แก้ปัญหา Dropdown โดนกล่องอื่นบัง
    // เมื่อ Dropdown เปิด -> ดัน Section ขึ้นมาหน้าสุด
    el.addEventListener('showDropdown', function() {
      const parentSection = el.closest('.form-section');
      if(parentSection) {
        parentSection.classList.add('is-active-section');
      }
    });

    // เมื่อ Dropdown ปิด -> เอา Section กลับไปอยู่ที่เดิม
    el.addEventListener('hideDropdown', function() {
      const parentSection = el.closest('.form-section');
      if(parentSection) {
        parentSection.classList.remove('is-active-section');
      }
    });
  });
}

function bindEvents() {
  technicianIdEl.addEventListener("input", handleTechnicianLookup);
  
  // ใช้ 'change' event ปกติ เพราะ Choices.js จะ trigger ให้เอง
  machineEl.addEventListener("change", handleMachineChange);
  machineNoEl.addEventListener("change", handleMachineNoChange);
  problemEl.addEventListener("change", handleProblemChange);
  
  startRepairEl.addEventListener("change", autoCalculateLossTime);
  endRepairEl.addEventListener("change", autoCalculateLossTime);
  resetBtn.addEventListener("click", resetForm);
  form.addEventListener("submit", submitForm);
}

async function loadMasterData() {
  try {
    setSystemStatus("กำลังซิงค์ข้อมูล...", "warning");
    const response = await fetch(`${WEB_APP_URL}?action=master`);
    const result = await response.json();

    if (!result.success) {
      setSystemStatus("ซิงค์ข้อมูลล้มเหลว", "error");
      showToast(result.message || "โหลดข้อมูลฐานข้อมูลไม่สำเร็จ", "error");
      return;
    }

    masterData = {
      machines: Array.isArray(result.machines) ? result.machines : [],
      areaPoints: Array.isArray(result.areaPoints) ? result.areaPoints : [],
      problems: Array.isArray(result.problems) ? result.problems : [],
      causes: Array.isArray(result.causes) ? result.causes : [],
      actions: Array.isArray(result.actions) ? result.actions : [],
      technicians: Array.isArray(result.technicians) ? result.technicians : []
    };

    populateMachines();
    populateProblems();
    populateCauses();
    populateActions();

    setSystemStatus("พร้อมใช้งาน", "success");
  } catch (error) {
    console.error(error);
    setSystemStatus("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้", "error");
    showToast("เชื่อมต่อฐานข้อมูลไม่สำเร็จ กรุณาเช็คอินเทอร์เน็ต", "error");
  }
}

function setSystemStatus(text, state) {
  systemStatusEl.textContent = text;
  if (state === "warning") {
    systemIndicatorDot.style.background = "#f59e0b";
    systemIndicatorDot.style.boxShadow = "0 0 0 0 rgba(245, 158, 11, 0.7)";
  } else if (state === "error") {
    systemIndicatorDot.style.background = "#ef4444";
    systemIndicatorDot.style.boxShadow = "0 0 0 0 rgba(239, 68, 68, 0.7)";
  } else {
    systemIndicatorDot.style.background = "#10b981";
    systemIndicatorDot.style.boxShadow = "0 0 0 0 rgba(16, 185, 129, 0.7)";
  }
}

function setDefaultDate() {
  const today = new Date();
  repairDateEl.value = formatDateInput(today);
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ฟังก์ชันอัปเดตข้อมูลเข้า Choices.js
function populateSelect(selectEl, items, placeholder) {
  const choiceInstance = choicesMap[selectEl.id];
  if (!choiceInstance) return;

  choiceInstance.clearStore();
  choiceInstance.clearChoices();

  const choicesData = [
    {
      value: "",
      label: placeholder,
      selected: true,
      disabled: true
    }
  ];

  items.forEach(item => {
    choicesData.push({
      value: item.value,
      label: item.label,
      disabled: false
    });
  });

  choiceInstance.setChoices(choicesData, "value", "label", true);

  if (items.length > 0) {
    choiceInstance.enable();
  } else {
    choiceInstance.disable();
  }
}

function populateMachines() {
  const machineNames = [...new Set(masterData.machines.map(item => String(item["ชื่อเครื่องจักร"] || "").trim()).filter(Boolean))];
  populateSelect(machineEl, machineNames.map(name => ({ value: name, label: name })), "-- เลือกเครื่องจักร --");
}

function populateProblems() {
  const items = masterData.problems.filter(item => String(item["อาการที่เสีย"] || "").trim() !== "").map(item => String(item["อาการที่เสีย"]).trim());
  populateSelect(problemEl, items.map(name => ({ value: name, label: name })), "-- เลือกอาการที่พบ --");
}

function populateCauses() {
  const unique = [...new Set(
    masterData.causes
      .map(item => String(item["สาเหตุ"] || "").trim())
      .filter(Boolean)
  )];

  populateSelect(
    causeEl,
    unique.map(text => ({ value: text, label: text })),
    "-- เลือกสาเหตุ --"
  );
}

function populateActions() {
  populateSelect(actionEl, masterData.actions.filter(item => String(item["การแก้ไข"] || "").trim() !== "").map(item => ({ value: String(item["การแก้ไข"]).trim(), label: String(item["การแก้ไข"]).trim() })), "-- เลือกการแก้ไข --");
}

function handleTechnicianLookup() {
  const employeeId = technicianIdEl.value.trim();
  technicianNameEl.value = "";
  if (!employeeId) return;
  const tech = masterData.technicians.find(item => String(item["รหัสพนักงาน"] || "").trim() === employeeId);
  if (tech) technicianNameEl.value = String(tech["ชื่อช่าง"] || "").trim();
}

function handleMachineChange() {
  const selectedMachine = machineEl.value.trim();
  lineEl.value = "";
  resetMachineNo();
  resetAreaPoint();
  if (!selectedMachine) return;
  const machineNos = masterData.machines.filter(item => String(item["ชื่อเครื่องจักร"] || "").trim() === selectedMachine);
  populateSelect(machineNoEl, machineNos.map(item => ({ value: String(item["หมายเลขเครื่อง"] || "").trim(), label: String(item["หมายเลขเครื่อง"] || "").trim() })), "-- เลือกหมายเลขเครื่อง --");
}

function handleMachineNoChange() {
  const selectedMachine = machineEl.value.trim();
  const selectedMachineNo = machineNoEl.value.trim();

  lineEl.value = "";
  resetAreaPoint();

  if (!selectedMachine || !selectedMachineNo) return;

  const machineInfo = masterData.machines.find(
    item =>
      String(item["ชื่อเครื่องจักร"] || "").trim() === selectedMachine &&
      String(item["หมายเลขเครื่อง"] || "").trim() === selectedMachineNo
  );

  if (!machineInfo) return;

  lineEl.value = String(machineInfo["ไลน์ผลิต"] || "").trim();

  const relatedPoints = masterData.areaPoints.filter(
    item => String(item["ชื่อเครื่องจักร"] || "").trim() === selectedMachine
  );

  const uniquePoints = [...new Set(
    relatedPoints
      .map(item => String(item["จุดที่เสีย"] || "").trim())
      .filter(Boolean)
  )];

  populateSelect(
    areaPointEl,
    uniquePoints.map(point => ({
      value: point,
      label: point
    })),
    "-- เลือกจุดที่เสีย --"
  );
}

function handleProblemChange() {
  const selectedProblem = problemEl.value.trim();
  breakdownTypeEl.value = "";
  if (!selectedProblem) return;
  const foundProblem = masterData.problems.find(item => String(item["อาการที่เสีย"] || "").trim() === selectedProblem);
  if (foundProblem) breakdownTypeEl.value = String(foundProblem["ประเภทงานเสีย"] || "").trim();
}

function resetMachineNo() {
  if (choicesMap["machineNo"]) {
    choicesMap["machineNo"].clearChoices();
    choicesMap["machineNo"].setChoices([{ value: "", label: "-- เลือกเครื่องจักรก่อน --", selected: true }], 'value', 'label', true);
    choicesMap["machineNo"].disable();
  }
}

function resetAreaPoint() {
  if (choicesMap["areaPoint"]) {
    choicesMap["areaPoint"].clearChoices();
    choicesMap["areaPoint"].setChoices([{ value: "", label: "-- เลือกหมายเลขเครื่องก่อน --", selected: true }], 'value', 'label', true);
    choicesMap["areaPoint"].disable();
  }
}

function autoCalculateLossTime() {
  const startValue = startRepairEl.value;
  const endValue = endRepairEl.value;
  if (!startValue || !endValue) return;
  const [startHour, startMinute] = startValue.split(":").map(Number);
  const [endHour, endMinute] = endValue.split(":").map(Number);
  let startTotal = startHour * 60 + startMinute;
  let endTotal = endHour * 60 + endMinute;
  let diff = endTotal - startTotal;
  if (diff < 0) diff += 24 * 60;
  lossTimeEl.value = diff;
}

function validateForm() {
  if (!form.checkValidity()) {
    form.reportValidity();
    return false;
  }

  if (!technicianNameEl.value.trim()) {
    showToast("ไม่พบชื่อช่างจากรหัสพนักงาน!", "error");
    technicianIdEl.focus();
    return false;
  }

  if (!machineEl.value || !machineNoEl.value || !areaPointEl.value) {
    showToast("กรุณาเลือกข้อมูลเครื่องจักรและจุดที่เสียให้ครบ", "error");
    return false;
  }

  const foundProblem = masterData.problems.find(
    item => String(item["อาการที่เสีย"] || "").trim() === String(problemEl.value || "").trim()
  );
  if (!foundProblem) {
    showToast("กรุณาเลือกอาการที่พบจากรายการที่กำหนด", "error");
    return false;
  }

  if (!causeEl.value || !actionEl.value) {
    showToast("กรุณาเลือกสาเหตุและการแก้ไขให้ครบ", "error");
    return false;
  }

  const hasLossTime = lossTimeEl.value !== "";
  const hasStartEnd = startRepairEl.value !== "" && endRepairEl.value !== "";
  if (!hasLossTime && !hasStartEnd) {
    showToast("กรุณากรอกเวลาเริ่ม-จบ หรือเวลา Downtime", "error");
    return false;
  }

  const severityNode = document.querySelector('input[name="severity"]:checked');
  if (!severityNode) {
    showToast("กรุณาเลือกระดับความรุนแรง", "error");
    return false;
  }

  return true;
}

async function submitForm(event) {
  event.preventDefault();
  
  // ให้ HTML5 เช็ค Validation พื้นฐานก่อน (เช่น required)
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  if (!validateForm()) return;

  const severityVal = document.querySelector('input[name="severity"]:checked').value;

  const payload = {
    repairDate: repairDateEl.value,
    shift: document.getElementById("shift").value,
    technicianId: technicianIdEl.value.trim(),
    technicianName: technicianNameEl.value.trim(),
    machine: machineEl.value,
    machineNo: machineNoEl.value,
    line: lineEl.value,
    areaPoint: areaPointEl.value,
    problem: problemEl.value,
    breakdownType: breakdownTypeEl.value,
    severity: severityVal,
    cause: causeEl.value,
    action: actionEl.value,
    sparePart: document.getElementById("sparePart").value.trim(),
    startRepair: startRepairEl.value,
    endRepair: endRepairEl.value,
    lossTime: lossTimeEl.value,
    result: document.getElementById("result").value,
    remark: document.getElementById("remark").value.trim()
  };

  setSubmitting(true);

  try {
    const response = await fetch(WEB_APP_URL, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "text/plain;charset=utf-8" }
    });

    const result = await response.json();

    if (result.success) {
      showToast("บันทึกข้อมูลสำเร็จเรียบร้อย!", "success");
      resetForm();
    } else {
      showToast(`เกิดข้อผิดพลาด: ${result.message}`, "error");
    }
  } catch (error) {
    console.error(error);
    showToast("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "error");
  } finally {
    setSubmitting(false);
  }
}

function setSubmitting(isSubmitting) {
  submitBtn.disabled = isSubmitting;
  if (isSubmitting) {
    submitBtn.innerHTML = `<span>กำลังบันทึก...</span>`;
  } else {
    submitBtn.innerHTML = `<span>ส่งข้อมูลบันทึกงาน</span><i data-lucide="send"></i>`;
    lucide.createIcons();
  }
}

function resetForm() {
  form.reset();
  setDefaultDate();

  technicianNameEl.value = "";
  lineEl.value = "";
  breakdownTypeEl.value = "";
  lossTimeEl.value = "";

  if (choicesMap["machine"]) {
    choicesMap["machine"].setChoiceByValue("");
  }
  if (choicesMap["problem"]) {
    choicesMap["problem"].setChoiceByValue("");
  }
  if (choicesMap["cause"]) {
    choicesMap["cause"].setChoiceByValue("");
  }
  if (choicesMap["action"]) {
    choicesMap["action"].setChoiceByValue("");
  }
  if (choicesMap["shift"]) {
    choicesMap["shift"].setChoiceByValue("");
  }
  if (choicesMap["result"]) {
    choicesMap["result"].setChoiceByValue("");
  }

  resetMachineNo();
  resetAreaPoint();

  document.querySelectorAll('input[name="severity"]').forEach(r => {
    r.checked = false;
  });
}
// --- Toast Notification System ---
function showToast(message, type) {
  let toastContainer = document.getElementById("toast-container");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "toast-container";
    Object.assign(toastContainer.style, {
      position: "fixed", top: "20px", right: "20px", zIndex: "9999", display: "flex", flexDirection: "column", gap: "10px"
    });
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement("div");
  const isSuccess = type === "success";
  
  Object.assign(toast.style, {
    background: isSuccess ? "#10b981" : "#ef4444",
    color: "#fff", padding: "14px 24px", borderRadius: "12px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.2)",
    fontFamily: "'Kanit', sans-serif", fontSize: "15px", fontWeight: "500",
    transform: "translateX(120%)", transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    display: "flex", alignItems: "center", gap: "10px"
  });

  toast.innerHTML = isSuccess ? `<i data-lucide="check-circle"></i> ${message}` : `<i data-lucide="alert-circle"></i> ${message}`;
  toastContainer.appendChild(toast);
  lucide.createIcons(); // Render icon ใน Toast

  requestAnimationFrame(() => { toast.style.transform = "translateX(0)"; });

  setTimeout(() => {
    toast.style.transform = "translateX(120%)";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}