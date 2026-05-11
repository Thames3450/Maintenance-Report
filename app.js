const SUPABASE_URL = "https://crigkewtzvslkpmsufxk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyaWdrZXd0enZzbGtwbXN1ZnhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MDc5OTQsImV4cCI6MjA5Mzk4Mzk5NH0.G13M84Qz7mjLXuCtdCHe07BpP7feeBwVD4c2K4czot4";

if (!window.supabase) {
  alert("โหลด Supabase SDK ไม่สำเร็จ กรุณาตรวจสอบ Internet หรือ CDN");
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  technicians: [],
  machines: [],
  areaPoints: [],
  problems: [],
  causes: [],
  actions: [],
  selectedImages: [],
  history: []
};

const choicesMap = {};
const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  initNiceSelects();
  bindEvents();
  setDefaultDate();
  refreshIcons();

  await loadMasterData();
  await loadHistory();

  setStatus("พร้อมใช้งาน", "success");
}

function cacheElements() {
  Object.assign(els, {
    statusDot: document.getElementById("statusDot"),
    systemStatus: document.getElementById("systemStatus"),

    tabBtns: document.querySelectorAll(".tab-btn"),
    tabPanels: document.querySelectorAll(".tab-panel"),

    form: document.getElementById("repairForm"),
    repairDate: document.getElementById("repairDate"),
    shift: document.getElementById("shift"),
    technicianCode: document.getElementById("technicianCode"),
    technicianName: document.getElementById("technicianName"),

    machine: document.getElementById("machine"),
    machineNo: document.getElementById("machineNo"),
    productionLine: document.getElementById("productionLine"),
    areaPoint: document.getElementById("areaPoint"),

    problem: document.getElementById("problem"),
    breakdownType: document.getElementById("breakdownType"),
    cause: document.getElementById("cause"),
    action: document.getElementById("action"),

    startRepair: document.getElementById("startRepair"),
    endRepair: document.getElementById("endRepair"),
    lossTime: document.getElementById("lossTime"),
    repairResult: document.getElementById("repairResult"),
    sparePart: document.getElementById("sparePart"),
    sparePartQty: document.getElementById("sparePartQty"),
    remark: document.getElementById("remark"),

    repairImages: document.getElementById("repairImages"),
    imagePreview: document.getElementById("imagePreview"),

    resetBtn: document.getElementById("resetBtn"),
    submitBtn: document.getElementById("submitBtn"),

    refreshHistoryBtn: document.getElementById("refreshHistoryBtn"),
    historySearch: document.getElementById("historySearch"),
historyFromDate: document.getElementById("historyFromDate"),
historyToDate: document.getElementById("historyToDate"),
clearHistoryFilterBtn: document.getElementById("clearHistoryFilterBtn"),
historyBody: document.getElementById("historyBody"),
detailPanel: document.getElementById("detailPanel"),
    toast: document.getElementById("toast")
  });
}

function bindEvents() {
  els.tabBtns?.forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  els.technicianCode?.addEventListener("input", handleTechnicianLookup);

  els.machine?.addEventListener("change", handleMachineChange);
  els.machineNo?.addEventListener("change", handleMachineNoChange);
  els.problem?.addEventListener("change", handleProblemChange);

  els.startRepair?.addEventListener("change", calculateLossTime);
  els.endRepair?.addEventListener("change", calculateLossTime);
  els.lossTime?.addEventListener("input", renderImageRuleHint);

  els.repairResult?.addEventListener("change", renderImageRuleHint);
  els.repairImages?.addEventListener("change", handleImageSelect);

  els.resetBtn?.addEventListener("click", resetForm);
  els.form?.addEventListener("submit", submitRepairReport);

  els.refreshHistoryBtn?.addEventListener("click", loadHistory);
  els.historySearch?.addEventListener("input", debounce(renderHistory, 180));
els.historyFromDate?.addEventListener("change", renderHistory);
els.historyToDate?.addEventListener("change", renderHistory);

els.clearHistoryFilterBtn?.addEventListener("click", () => {
  els.historySearch.value = "";
  els.historyFromDate.value = "";
  els.historyToDate.value = "";
  renderHistory();
});

  els.historyBody?.addEventListener("click", event => {
    const btn = event.target.closest(".image-count-btn[data-detail-id]");
    if (!btn) return;

    event.preventDefault();
    event.stopPropagation();

    showDetail(btn.dataset.detailId);
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeRepairModal();
  });
}

/* ================= Choices Dropdown ================= */

function initNiceSelects() {
  if (typeof Choices === "undefined") {
    console.warn("Choices.js not loaded. Native select will be used.");
    return;
  }

  const searchableSelects = [
    "machine",
    "machineNo",
    "areaPoint",
    "problem",
    "cause",
    "action"
  ];

  const selectIds = [
    "shift",
    "machine",
    "machineNo",
    "areaPoint",
    "problem",
    "cause",
    "action",
    "repairResult"
  ];

  selectIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el || choicesMap[id]) return;

    const instance = new Choices(el, {
      searchEnabled: searchableSelects.includes(id),
      shouldSort: false,
      itemSelectText: "",
      allowHTML: false,
      placeholder: true,
      searchPlaceholderValue: "พิมพ์ค้นหา...",
      noResultsText: "ไม่พบข้อมูลที่ค้นหา",
      noChoicesText: "ไม่มีตัวเลือก",
      position: "bottom"
    });

    choicesMap[id] = instance;

    el.addEventListener("showDropdown", () => {
      const parent = el.closest(".form-card, .glass-panel");
      if (parent) parent.classList.add("is-active-section");
    });

    el.addEventListener("hideDropdown", () => {
      const parent = el.closest(".form-card, .glass-panel");
      if (parent) parent.classList.remove("is-active-section");
    });
  });

  setSelectDisabled(els.machineNo, true);
  setSelectDisabled(els.areaPoint, true);
}

function setSelectDisabled(selectEl, disabled) {
  if (!selectEl) return;

  selectEl.disabled = disabled;

  const instance = choicesMap[selectEl.id];
  if (!instance) return;

  if (disabled) instance.disable();
  else instance.enable();
}

function setOptions(selectEl, options, placeholder) {
  if (!selectEl) return;

  const instance = choicesMap[selectEl.id];

  if (instance) {
    const currentValue = String(selectEl.value || "");

    instance.clearStore();

    const choicesData = [
      {
        value: "",
        label: placeholder,
        selected: true,
        disabled: false
      },
      ...options.map(opt => ({
        value: String(opt.value ?? ""),
        label: String(opt.label ?? ""),
        selected: false,
        disabled: false
      }))
    ];

    instance.setChoices(choicesData, "value", "label", true);

    if (
      currentValue &&
      options.some(opt => String(opt.value) === currentValue)
    ) {
      instance.setChoiceByValue(currentValue);
    }

    return;
  }

  selectEl.innerHTML = "";

  const first = document.createElement("option");
  first.value = "";
  first.textContent = placeholder;
  selectEl.appendChild(first);

  options.forEach(opt => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    selectEl.appendChild(option);
  });
}

function setSelectValue(selectEl, value) {
  if (!selectEl) return;

  const instance = choicesMap[selectEl.id];

  if (instance) instance.setChoiceByValue(String(value || ""));
  else selectEl.value = value || "";
}

/* ================= Tabs ================= */

function switchTab(tabId) {
  els.tabBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });

  els.tabPanels.forEach(panel => {
    panel.classList.toggle("active", panel.id === tabId);
  });

  if (tabId === "historyTab") {
    loadHistory();
  }

  refreshIcons();
}

/* ================= Master Data ================= */

async function loadMasterData() {
  try {
    setStatus("กำลังโหลด Master Data...", "warning");

    const [
      techniciansRes,
      machinesRes,
      areaPointsRes,
      problemsRes,
      causesRes,
      actionsRes
    ] = await Promise.all([
      sb.from("technicians").select("*").eq("is_active", true).order("employee_code", { ascending: true }),
      sb.from("machines").select("*").eq("is_active", true).order("machine_name", { ascending: true }),
      sb.from("area_points").select("*").eq("is_active", true).order("point_name", { ascending: true }),
      sb.from("problems").select("*").eq("is_active", true).order("problem_name", { ascending: true }),
      sb.from("causes").select("*").eq("is_active", true).order("cause_name", { ascending: true }),
      sb.from("actions").select("*").eq("is_active", true).order("action_name", { ascending: true })
    ]);

    throwIfError(techniciansRes.error);
    throwIfError(machinesRes.error);
    throwIfError(areaPointsRes.error);
    throwIfError(problemsRes.error);
    throwIfError(causesRes.error);
    throwIfError(actionsRes.error);

    state.technicians = techniciansRes.data || [];
    state.machines = machinesRes.data || [];
    state.areaPoints = areaPointsRes.data || [];
    state.problems = problemsRes.data || [];
    state.causes = causesRes.data || [];
    state.actions = actionsRes.data || [];

    populateMachines();
    populateProblems();
    populateCauses();
    populateActions();

    resetMachineNoSelect();
    resetAreaPointSelect();

    setStatus("พร้อมใช้งาน", "success");
  } catch (err) {
    console.error(err);
    setStatus("โหลด Master Data ไม่สำเร็จ", "error");
    toast("โหลดข้อมูลไม่สำเร็จ กรุณาตรวจสอบ Supabase URL / Key / RLS Policy", "error");
  }
}

function populateMachines() {
  const uniqueMachines = uniqueBy(
    state.machines.filter(item => clean(item.machine_name)),
    item => clean(item.machine_name)
  );

  const options = uniqueMachines
    .map(item => ({
      value: item.machine_name,
      label: item.machine_name
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "th"));

  setOptions(els.machine, options, "-- เลือกเครื่องจักร --");
}

function populateProblems() {
  const options = state.problems
    .filter(item => clean(item.problem_name))
    .map(item => ({
      value: item.id,
      label: item.problem_name
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "th"));

  setOptions(els.problem, options, "-- เลือกอาการที่เสีย --");
}

function populateCauses() {
  const options = state.causes
    .filter(item => clean(item.cause_name))
    .map(item => ({
      value: item.id,
      label: item.cause_name
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "th"));

  setOptions(els.cause, options, "-- เลือกสาเหตุ --");
}

function populateActions() {
  const options = state.actions
    .filter(item => clean(item.action_name))
    .map(item => ({
      value: item.id,
      label: item.action_name
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "th"));

  setOptions(els.action, options, "-- เลือกการแก้ไข --");
}

/* ================= Form Logic ================= */

function setDefaultDate() {
  if (!els.repairDate) return;
  els.repairDate.value = formatDateInput(new Date());
}

function handleTechnicianLookup() {
  const code = clean(els.technicianCode.value);
  const tech = state.technicians.find(item => clean(item.employee_code) === code);
  els.technicianName.value = tech ? clean(tech.full_name) : "";
}

function handleMachineChange() {
  const machineName = clean(els.machine.value);

  els.productionLine.value = "";
  resetMachineNoSelect();
  resetAreaPointSelect();

  if (!machineName) return;

  const machineNos = state.machines
    .filter(item => clean(item.machine_name) === machineName)
    .sort((a, b) => clean(a.machine_no).localeCompare(clean(b.machine_no), "th"));

  const options = machineNos.map(item => ({
    value: item.id,
    label: item.machine_no
  }));

  setOptions(els.machineNo, options, "-- เลือกหมายเลขเครื่อง --");
  setSelectDisabled(els.machineNo, options.length === 0);
}

function handleMachineNoChange() {
  const machine = getSelectedMachine();

  els.productionLine.value = machine?.production_line || "";
  resetAreaPointSelect();

  if (!machine) return;

  const points = state.areaPoints
    .filter(item => {
      const byId = item.machine_id && item.machine_id === machine.id;
      const byMachineName = clean(item.machine_name) && clean(item.machine_name) === clean(machine.machine_name);
      return byId || byMachineName;
    })
    .sort((a, b) => clean(a.point_name).localeCompare(clean(b.point_name), "th"));

  const uniquePoints = uniqueBy(points, item => clean(item.point_name));

  const options = uniquePoints.map(item => ({
    value: item.id,
    label: item.point_name
  }));

  setOptions(els.areaPoint, options, "-- เลือกจุดที่เสีย --");
  setSelectDisabled(els.areaPoint, options.length === 0);
}

function handleProblemChange() {
  const problem = getSelectedProblem();
  els.breakdownType.value = problem?.breakdown_type || "";
}

function resetMachineNoSelect() {
  setOptions(els.machineNo, [], "-- เลือกเครื่องจักรก่อน --");
  setSelectDisabled(els.machineNo, true);
}

function resetAreaPointSelect() {
  setOptions(els.areaPoint, [], "-- เลือกหมายเลขเครื่องก่อน --");
  setSelectDisabled(els.areaPoint, true);
}

function calculateLossTime() {
  const start = els.startRepair.value;
  const end = els.endRepair.value;

  if (!start || !end) return;

  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);

  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  let diff = endMin - startMin;

  if (diff < 0) diff += 24 * 60;

  els.lossTime.value = diff;
  renderImageRuleHint();
}

/* ================= Image ================= */

function handleImageSelect(event) {
  const files = Array.from(event.target.files || []);

  if (files.length > 5) {
    toast("แนบรูปได้สูงสุด 5 รูป", "error");
    els.repairImages.value = "";
    state.selectedImages = [];
    renderImagePreview();
    updateUploadBoxText();
    return;
  }

  const validFiles = [];

  for (const file of files) {
    const isValidType = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    const isValidSize = file.size <= 5 * 1024 * 1024;

    if (!isValidType) {
      toast(`ไฟล์ ${file.name} ไม่รองรับ กรุณาใช้ JPG, PNG หรือ WEBP`, "error");
      continue;
    }

    if (!isValidSize) {
      toast(`ไฟล์ ${file.name} ใหญ่เกิน 5 MB`, "error");
      continue;
    }

    validFiles.push({
      file,
      imageType: "Before",
      previewUrl: URL.createObjectURL(file)
    });
  }

  state.selectedImages.forEach(item => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  });

  state.selectedImages = validFiles;
  renderImagePreview();
  updateUploadBoxText();
}

function renderImagePreview() {
  if (!state.selectedImages.length) {
    els.imagePreview.innerHTML = "";
    return;
  }

  els.imagePreview.innerHTML = state.selectedImages.map((item, index) => {
    return `
      <div class="preview-card">
        <img src="${item.previewUrl}" alt="repair image preview">
        <select data-image-index="${index}">
          <option value="Before" ${item.imageType === "Before" ? "selected" : ""}>Before - ก่อนซ่อม</option>
          <option value="Fault Point" ${item.imageType === "Fault Point" ? "selected" : ""}>Fault Point - จุดที่เสีย</option>
          <option value="Spare Part" ${item.imageType === "Spare Part" ? "selected" : ""}>Spare Part - อะไหล่</option>
          <option value="After" ${item.imageType === "After" ? "selected" : ""}>After - หลังซ่อม</option>
          <option value="Evidence" ${item.imageType === "Evidence" ? "selected" : ""}>Evidence - หลักฐาน</option>
        </select>
      </div>
    `;
  }).join("");

  els.imagePreview.querySelectorAll("select").forEach(select => {
    select.addEventListener("change", event => {
      const index = Number(event.target.dataset.imageIndex);
      if (state.selectedImages[index]) {
        state.selectedImages[index].imageType = event.target.value;
      }
    });
  });
}

function updateUploadBoxText() {
  const labelText = document.querySelector(".file-upload-box span");
  if (!labelText) return;

  if (!state.selectedImages.length) {
    labelText.textContent = "คลิกเพื่ออัปโหลดรูปภาพ";
    return;
  }

  labelText.textContent = `เลือกแล้ว ${state.selectedImages.length} รูป`;
}

function getRequiredImageCount() {
  const lossTime = Number(els.lossTime.value || 0);
  const result = els.repairResult.value;

  if (lossTime >= 60 || isFollowUpResult(result)) return 2;
  return 1;
}

function renderImageRuleHint() {
  return getRequiredImageCount();
}

/* ================= Validate + Submit ================= */

function validateForm() {
  if (!els.form.checkValidity()) {
    els.form.reportValidity();
    return false;
  }

  if (!clean(els.technicianName.value)) {
    toast("ไม่พบชื่อช่างจากรหัสพนักงาน กรุณาตรวจสอบรหัส", "error");
    els.technicianCode.focus();
    return false;
  }

  if (!getSelectedMachine()) {
    toast("กรุณาเลือกเครื่องจักรและหมายเลขเครื่องให้ถูกต้อง", "error");
    return false;
  }

  if (!getSelectedAreaPoint()) {
    toast("กรุณาเลือกจุดที่เสีย", "error");
    return false;
  }

  if (!getSelectedProblem()) {
    toast("กรุณาเลือกอาการที่เสีย", "error");
    return false;
  }

  if (!getSelectedCause()) {
    toast("กรุณาเลือกสาเหตุ", "error");
    return false;
  }

  if (!getSelectedAction()) {
    toast("กรุณาเลือกการแก้ไข", "error");
    return false;
  }

  if (!getSeverity()) {
    toast("กรุณาเลือกระดับความรุนแรง", "error");
    return false;
  }

  const imageRequired = getRequiredImageCount();

  if (state.selectedImages.length < imageRequired) {
    toast(`ต้องแนบรูปอย่างน้อย ${imageRequired} รูป`, "error");
    return false;
  }

  if (isFollowUpResult(els.repairResult.value) && !clean(els.remark.value)) {
    toast("กรณีใช้งานชั่วคราว/ต้องติดตาม/รอซ่อมเพิ่มเติม ต้องกรอกหมายเหตุ", "error");
    els.remark.focus();
    return false;
  }

  return true;
}

async function submitRepairReport(event) {
  event.preventDefault();

  if (!validateForm()) return;

  const machine = getSelectedMachine();
  const areaPoint = getSelectedAreaPoint();
  const problem = getSelectedProblem();
  const cause = getSelectedCause();
  const action = getSelectedAction();
  const technician = getSelectedTechnician();

  const recordNo = createRecordNo();

  const payload = {
    record_no: recordNo,

    repair_date: els.repairDate.value,
    shift: els.shift.value,

    technician_id: technician?.id || null,
    technician_code: clean(els.technicianCode.value),
    technician_name: clean(els.technicianName.value),

    machine_id: machine?.id || null,
    machine_name: machine?.machine_name || "",
    machine_no: machine?.machine_no || "",
    production_line: machine?.production_line || "",

    area_point_id: areaPoint?.id || null,
    area_point_name: areaPoint?.point_name || "",

    problem_id: problem?.id || null,
    problem_name: problem?.problem_name || "",
    breakdown_type: problem?.breakdown_type || "",

    severity: getSeverity(),

    cause_id: cause?.id || null,
    cause_name: cause?.cause_name || "",

    action_id: action?.id || null,
    action_name: action?.action_name || "",

    spare_part: clean(els.sparePart.value),
    spare_part_qty: Number(els.sparePartQty.value || 0),

    start_repair: els.startRepair.value || null,
    end_repair: els.endRepair.value || null,
    loss_time_min: Number(els.lossTime.value || 0),

    repair_result: els.repairResult.value,
    remark: clean(els.remark.value),

    status: "Closed"
  };

  try {
    setSubmitting(true);

    const { data: inserted, error } = await sb
      .from("repair_logs")
      .insert(payload)
      .select()
      .single();

    throwIfError(error);

    try {
      await uploadRepairImages(inserted.id, recordNo, payload.technician_code);
    } catch (imageError) {
      console.error(imageError);
      toast("บันทึกรายงานสำเร็จ แต่รูปภาพอัปโหลดไม่สำเร็จ", "warning");
      resetForm();
      await loadHistory();
      return;
    }

    toast("บันทึกรายงานซ่อมสำเร็จ", "success");
    resetForm();
    await loadHistory();
  } catch (err) {
    console.error(err);
    toast(err.message || "บันทึกข้อมูลไม่สำเร็จ", "error");
  } finally {
    setSubmitting(false);
  }
}

async function uploadRepairImages(repairLogId, recordNo, uploadedBy) {
  if (!state.selectedImages.length) return;

  const imageRows = [];

  for (let i = 0; i < state.selectedImages.length; i++) {
    const item = state.selectedImages[i];

    const ext = getFileExtension(item.file);
    const randomKey = safeUUID();

    const filePath = [
      "repair-reports",
      sanitizeStoragePath(recordNo),
      `${String(i + 1).padStart(2, "0")}-${Date.now()}-${randomKey}.${ext}`
    ].join("/");

    const { data: uploadData, error: uploadError } = await sb
      .storage
      .from("repair-images")
      .upload(filePath, item.file, {
        cacheControl: "3600",
        upsert: false,
        contentType: item.file.type
      });

    if (uploadError) {
      console.error("Upload image error:", uploadError);
      throw new Error(`อัปโหลดรูปไม่สำเร็จ: ${uploadError.message}`);
    }

    const { data: publicData } = sb
      .storage
      .from("repair-images")
      .getPublicUrl(uploadData.path);

    imageRows.push({
      repair_log_id: repairLogId,
      image_type: item.imageType,
      file_name: item.file.name,
      file_path: uploadData.path,
      public_url: publicData.publicUrl,
      uploaded_by: uploadedBy
    });
  }

  const { error } = await sb
    .from("repair_images")
    .insert(imageRows);

  throwIfError(error);
}

/* ================= History ================= */

async function loadHistory() {
  try {
    const { data, error } = await sb
      .from("repair_logs")
      .select(`
        *,
        repair_images (*)
      `)
      .order("created_at", { ascending: false })
      .limit(1000);

    throwIfError(error);

    state.history = data || [];
    renderHistory();
  } catch (err) {
    console.error(err);
    els.historyBody.innerHTML = `<tr><td colspan="8" class="empty">โหลดประวัติไม่สำเร็จ</td></tr>`;
  }
}

function renderHistory() {
  const keyword = clean(els.historySearch?.value).toLowerCase();
  const fromDate = els.historyFromDate?.value || "";
  const toDate = els.historyToDate?.value || "";

  let rows = state.history;

  rows = rows.filter(row => {
    const rowDate = row.repair_date || "";

    if (fromDate && rowDate < fromDate) return false;
    if (toDate && rowDate > toDate) return false;

    return true;
  });

  if (keyword) {
    rows = rows.filter(row => {
      const base = [
        row.record_no,
        row.repair_date,
        row.shift,
        row.machine_name,
        row.machine_no,
        row.production_line,
        row.area_point_name,
        row.problem_name,
        row.cause_name,
        row.action_name,
        row.technician_name,
        row.technician_code,
        row.repair_result,
        row.remark
      ].join(" ").toLowerCase();

      return base.includes(keyword);
    });
  }

  if (!rows.length) {
    els.historyBody.innerHTML = `<tr><td colspan="8" class="empty">ไม่พบข้อมูล</td></tr>`;
    return;
  }

  els.historyBody.innerHTML = rows.map(row => {
    const images = row.repair_images || [];

    return `
      <tr>
        <td data-label="วันที่">
          <span class="history-date-main">${escapeHtml(formatThaiDate(row.repair_date))}</span>
          <span class="history-record-no">${escapeHtml(row.record_no || "-")}</span>
        </td>

        <td data-label="เครื่องจักร">
          <span class="history-machine-main">${escapeHtml(row.machine_name || "-")}</span>
          <span class="history-machine-no">${escapeHtml(row.machine_no || "-")}</span>
        </td>

        <td data-label="จุดที่เสีย">
          ${escapeHtml(row.area_point_name || "-")}
        </td>

        <td data-label="อาการ">
          ${escapeHtml(row.problem_name || "-")}
        </td>

        <td data-label="Downtime">
          <span class="history-downtime">${formatNumber(row.loss_time_min || 0)} นาที</span>
        </td>

        <td data-label="ช่าง">
          <span class="history-machine-main">${escapeHtml(row.technician_name || "-")}</span>
          <span class="history-machine-no">${escapeHtml(row.shift || "-")}</span>
        </td>

        <td data-label="ผลหลังซ่อม">
          ${renderResultBadge(row.repair_result)}
        </td>

        <td data-label="รายละเอียด">
          <button 
            type="button" 
            class="image-count-btn" 
            data-detail-id="${row.id}"
          >
            ดูรายละเอียด · ${images.length} รูป
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

window.showDetail = function(id) {
  const row = state.history.find(item => item.id === id);
  if (!row) return;

  const images = row.repair_images || [];

  closeRepairModal();

  const modal = document.createElement("div");
  modal.id = "repairDetailModal";
  modal.className = "repair-modal";

  modal.innerHTML = `
    <div class="repair-modal-backdrop" onclick="closeRepairModal()"></div>

    <div class="repair-modal-card">
      <div class="repair-modal-head">
        <div>
          <h2>รายละเอียดงานซ่อม</h2>
          <p>${escapeHtml(row.record_no || "-")}</p>
        </div>

        <button class="repair-modal-close" type="button" onclick="closeRepairModal()" aria-label="Close">
          <i data-lucide="x"></i>
        </button>
      </div>

      <div class="repair-modal-body">
        <div class="detail-grid">
          ${detailItem("วันที่ซ่อม", formatThaiDate(row.repair_date))}
          ${detailItem("กะ", row.shift)}
          ${detailItem("เครื่องจักร", `${row.machine_name || "-"} | ${row.machine_no || "-"}`)}
          ${detailItem("ไลน์ผลิต", row.production_line)}
          ${detailItem("จุดที่เสีย", row.area_point_name)}
          ${detailItem("อาการที่เสีย", row.problem_name)}
          ${detailItem("ประเภทงานเสีย", row.breakdown_type)}
          ${detailItem("ระดับความรุนแรง", row.severity)}
          ${detailItem("สาเหตุ", row.cause_name, true)}
          ${detailItem("การแก้ไข", row.action_name, true)}
          ${detailItem("Downtime", `${formatNumber(row.loss_time_min || 0)} นาที`)}
          ${detailItem("ผลหลังซ่อม", row.repair_result)}
          ${detailItem("ช่างผู้ซ่อม", `${row.technician_name || "-"} (${row.technician_code || "-"})`)}
          ${detailItem("อะไหล่ที่ใช้", `${row.spare_part || "-"} ${row.spare_part_qty ? `จำนวน ${row.spare_part_qty}` : ""}`, true)}
          ${detailItem("เวลาเริ่ม/จบ", `${row.start_repair || "-"} - ${row.end_repair || "-"}`)}
          ${detailItem("หมายเหตุ", row.remark || "-", true)}
        </div>

        <h3 style="margin-top: 22px; font-weight: 500;">รูปภาพการซ่อม (${images.length} รูป)</h3>

        <div class="detail-images">
          ${
            images.length
              ? images.map(img => `
                  <a href="${img.public_url}" target="_blank" rel="noopener">
                    <img src="${img.public_url}" alt="${escapeHtml(img.image_type || "repair image")}">
                  </a>
                `).join("")
              : `<p>ไม่มีรูปภาพ</p>`
          }
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.classList.add("repair-modal-open");
  refreshIcons();
};

window.hideDetail = function() {
  closeRepairModal();
};

window.closeRepairModal = function() {
  const oldModal = document.getElementById("repairDetailModal");
  if (oldModal) oldModal.remove();
  document.body.classList.remove("repair-modal-open");
};

function detailItem(label, value, full = false) {
  return `
    <div class="detail-item ${full ? "full" : ""}">
      <div class="detail-label">${escapeHtml(label)}</div>
      <div class="detail-value">${escapeHtml(value || "-")}</div>
    </div>
  `;
}

/* ================= UI ================= */

function resetForm() {
  els.form.reset();
  setDefaultDate();

  els.technicianName.value = "";
  els.productionLine.value = "";
  els.breakdownType.value = "";

  resetMachineNoSelect();
  resetAreaPointSelect();

  setSelectValue(els.shift, "");
  setSelectValue(els.machine, "");
  setSelectValue(els.problem, "");
  setSelectValue(els.cause, "");
  setSelectValue(els.action, "");
  setSelectValue(els.repairResult, "");

  els.repairImages.value = "";

  state.selectedImages.forEach(item => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  });

  state.selectedImages = [];
  renderImagePreview();
  updateUploadBoxText();
  renderImageRuleHint();

  refreshIcons();
}

function setSubmitting(isSubmitting) {
  els.submitBtn.disabled = isSubmitting;
  els.resetBtn.disabled = isSubmitting;

  els.submitBtn.innerHTML = isSubmitting
    ? `<i data-lucide="loader-2"></i> กำลังบันทึก...`
    : `<i data-lucide="send"></i> บันทึกรายงานซ่อม`;

  refreshIcons();
}

function setStatus(text, type) {
  if (els.systemStatus) els.systemStatus.textContent = text;
  if (!els.statusDot) return;

  if (type === "success") els.statusDot.style.background = "#10b981";
  else if (type === "error") els.statusDot.style.background = "#ef4444";
  else els.statusDot.style.background = "#f59e0b";
}

function toast(message, type = "success") {
  if (!els.toast) {
    alert(message);
    return;
  }

  els.toast.className = `toast ${type}`;
  els.toast.textContent = message;

  setTimeout(() => {
    els.toast.className = "toast hidden";
  }, 3800);
}

/* ================= Getters ================= */

function getSelectedTechnician() {
  const code = clean(els.technicianCode.value);
  return state.technicians.find(item => clean(item.employee_code) === code);
}

function getSelectedMachine() {
  return state.machines.find(item => item.id === els.machineNo.value);
}

function getSelectedAreaPoint() {
  return state.areaPoints.find(item => item.id === els.areaPoint.value);
}

function getSelectedProblem() {
  return state.problems.find(item => item.id === els.problem.value);
}

function getSelectedCause() {
  return state.causes.find(item => item.id === els.cause.value);
}

function getSelectedAction() {
  return state.actions.find(item => item.id === els.action.value);
}

function getSeverity() {
  return document.querySelector('input[name="severity"]:checked')?.value || "";
}

function isFollowUpResult(value) {
  return [
    "ใช้งานได้ชั่วคราว",
    "ต้องติดตามต่อ",
    "รอซ่อมเพิ่มเติม"
  ].includes(value);
}

/* ================= Helpers ================= */

function renderResultBadge(text) {
  const safe = escapeHtml(text || "-");

  if (text === "ใช้งานได้ปกติ") return `<span class="badge green">${safe}</span>`;
  if (text === "ใช้งานได้ชั่วคราว") return `<span class="badge orange">${safe}</span>`;
  if (text === "ต้องติดตามต่อ") return `<span class="badge blue">${safe}</span>`;
  if (text === "รอซ่อมเพิ่มเติม") return `<span class="badge red">${safe}</span>`;

  return `<span class="badge blue">${safe}</span>`;
}

function createRecordNo() {
  const now = new Date();

  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");

  const random = Math.floor(Math.random() * 900 + 100);

  return `MPR-RP-${y}${m}${d}-${h}${min}${s}${ms}-${random}`;
}

function sanitizeStoragePath(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getFileExtension(file) {
  const mimeMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  };

  if (mimeMap[file.type]) return mimeMap[file.type];

  const name = file.name || "";
  const ext = name.split(".").pop()?.toLowerCase();

  if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
    return ext === "jpeg" ? "jpg" : ext;
  }

  return "jpg";
}

function safeUUID() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function throwIfError(error) {
  if (error) throw error;
}

function uniqueBy(arr, keyFn) {
  const map = new Map();

  arr.forEach(item => {
    const key = keyFn(item);
    if (!key) return;
    if (!map.has(key)) map.set(key, item);
  });

  return Array.from(map.values());
}

function debounce(fn, delay = 200) {
  let timer;

  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function clean(value) {
  return String(value ?? "").trim();
}

function formatDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function formatThaiDate(value) {
  if (!value) return "-";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}
function formatNumber(value) {
  return Number(value || 0).toLocaleString("th-TH");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}
