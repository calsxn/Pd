"use strict";

/* ============================================================
   PD Incident Report Maker — free, no-key, fully client-side.
   Output matches the standardized incident report template.
   ============================================================ */

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
let mode = "text";

function setStatus(msg, kind = "") {
  statusEl.textContent = msg || "";
  statusEl.className = "status" + (kind ? " " + kind : "");
}

/* ---------- Draft autosave ---------- */
const INPUT_IDS = [
  "subjectName", "incidentDate", "arrestingOfficers", "summaryInput",
  "evidenceLocker", "criminalName", "plea", "timeSentenced", "fine",
];

function saveDraft() {
  const data = {};
  INPUT_IDS.forEach((id) => (data[id] = $(id).value));
  data.weapons = getWeapons();
  localStorage.setItem("pd_draft", JSON.stringify(data));
}

function loadDraft() {
  try {
    const data = JSON.parse(localStorage.getItem("pd_draft") || "{}");
    INPUT_IDS.forEach((id) => { if (data[id] != null) $(id).value = data[id]; });
    if (Array.isArray(data.weapons) && data.weapons.length) {
      data.weapons.forEach((w) => addWeaponRow(w.type, w.serial));
    }
  } catch (_) {}
}

INPUT_IDS.forEach((id) => $(id).addEventListener("input", saveDraft));

/* ---------- Defaults ---------- */
function pad(n) { return String(n).padStart(2, "0"); }

function initDefaults() {
  if (!$("incidentDate").value) {
    const d = new Date();
    $("incidentDate").value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  if (!$("arrestingOfficers").value) $("arrestingOfficers").value = "LSPD, BCSO, SAST, SWAT";
  if ($("weaponRows").children.length === 0) addWeaponRow("", "");
}

function formatMDY(v) {
  if (!v) return "00/00/0000";
  const parts = v.split("-");
  if (parts.length !== 3) return v;
  return `${parts[1]}/${parts[2]}/${parts[0]}`;
}

/* ---------- Weapons (dynamic rows) ---------- */
function addWeaponRow(type = "", serial = "") {
  const row = document.createElement("div");
  row.className = "weapon-row";

  const typeInput = document.createElement("input");
  typeInput.type = "text";
  typeInput.placeholder = "Weapon type";
  typeInput.value = type;
  typeInput.className = "w-type";

  const serialInput = document.createElement("input");
  serialInput.type = "text";
  serialInput.placeholder = "Serial #";
  serialInput.value = serial;
  serialInput.className = "w-serial";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "w-remove";
  remove.textContent = "✕";
  remove.setAttribute("aria-label", "Remove weapon");
  remove.addEventListener("click", () => { row.remove(); saveDraft(); });

  [typeInput, serialInput].forEach((el) => el.addEventListener("input", saveDraft));

  row.appendChild(typeInput);
  row.appendChild(serialInput);
  row.appendChild(remove);
  $("weaponRows").appendChild(row);
}

function getWeapons() {
  return Array.from($("weaponRows").querySelectorAll(".weapon-row")).map((row) => ({
    type: row.querySelector(".w-type").value.trim(),
    serial: row.querySelector(".w-serial").value.trim(),
  }));
}

function weaponsText() {
  const filled = getWeapons().filter((w) => w.type || w.serial);
  if (filled.length === 0) return "N/A";
  return filled.map((w) => `${w.type || "Weapon Type"} - 🔍 Serial Number #${w.serial}`).join("\n");
}

$("addWeaponBtn").addEventListener("click", () => addWeaponRow("", ""));

/* ---------- Tabs ---------- */
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    mode = tab.dataset.mode;
    document.querySelectorAll(".tab").forEach((t) => {
      const active = t === tab;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", String(active));
    });
    $("mode-text").classList.toggle("hidden", mode !== "text");
    $("mode-video").classList.toggle("hidden", mode !== "video");
  });
});

/* ---------- Clear ---------- */
$("clearBtn").addEventListener("click", () => {
  if (!confirm("Clear all fields and start a new report?")) return;
  localStorage.removeItem("pd_draft");
  INPUT_IDS.forEach((id) => ($(id).value = ""));
  $("weaponRows").innerHTML = "";
  frameNotes = [];
  $("frameList").innerHTML = "";
  $("buildNarrativeBtn").classList.add("hidden");
  $("videoPreview").classList.add("hidden");
  $("reportForm").classList.add("hidden");
  $("reportForm").innerHTML = "";
  $("reportEmpty").classList.remove("hidden");
  ["copyBtn", "printBtn", "downloadBtn"].forEach((id) => ($(id).disabled = true));
  initDefaults();
  setStatus("Started a new report.");
});

/* ---------- Video: local frame sampling + per-frame notes ---------- */
const dropzone = $("dropzone");
const videoInput = $("videoInput");
const videoPreview = $("videoPreview");
const frameList = $("frameList");
let frameNotes = []; // { time, note }

dropzone.addEventListener("click", () => videoInput.click());
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); videoInput.click(); }
});
["dragover", "dragenter"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add("drag"); })
);
["dragleave", "drop"].forEach((ev) =>
  dropzone.addEventListener(ev, () => dropzone.classList.remove("drag"))
);
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  if (e.dataTransfer.files[0]) handleVideoFile(e.dataTransfer.files[0]);
});
videoInput.addEventListener("change", () => {
  if (videoInput.files[0]) handleVideoFile(videoInput.files[0]);
});

function handleVideoFile(file) {
  if (!file.type.startsWith("video/")) { setStatus("That file isn't a video.", "error"); return; }
  frameNotes = [];
  frameList.innerHTML = "";
  videoPreview.src = URL.createObjectURL(file);
  videoPreview.classList.remove("hidden");
  setStatus("Loading video…");
  videoPreview.addEventListener("loadedmetadata", extractFrames, { once: true });
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${pad(s)}`;
}

async function extractFrames() {
  const duration = videoPreview.duration;
  if (!isFinite(duration) || duration <= 0) { setStatus("Couldn't read video duration.", "error"); return; }
  const n = duration <= 12 ? 6 : 8;
  const canvas = document.createElement("canvas");
  const w = 480;
  const scale = w / (videoPreview.videoWidth || w);
  canvas.width = w;
  canvas.height = Math.round((videoPreview.videoHeight || 270) * scale);
  const ctx = canvas.getContext("2d");

  setStatus("Sampling frames", "busy");
  for (let i = 0; i < n; i++) {
    const t = (duration * (i + 0.5)) / n;
    await seek(videoPreview, t);
    ctx.drawImage(videoPreview, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    frameNotes.push({ time: t, note: "" });
    addFrameRow(dataUrl, t, frameNotes.length - 1);
  }
  videoPreview.pause();
  $("buildNarrativeBtn").classList.remove("hidden");
  setStatus(`Captured ${n} frames. Add a note under each, then build the summary.`);
}

function addFrameRow(dataUrl, time, idx) {
  const row = document.createElement("div");
  row.className = "frame-row";
  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = "Frame at " + fmtTime(time);
  img.addEventListener("click", () => { videoPreview.currentTime = time; videoPreview.play(); });
  const right = document.createElement("div");
  right.className = "frame-right";
  const stamp = document.createElement("span");
  stamp.className = "frame-time";
  stamp.textContent = "⏱ " + fmtTime(time);
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "What's visible at this moment…";
  input.addEventListener("input", () => { frameNotes[idx].note = input.value; });
  right.appendChild(stamp);
  right.appendChild(input);
  row.appendChild(img);
  row.appendChild(right);
  frameList.appendChild(row);
}

function seek(video, time) {
  return new Promise((resolve) => {
    const onSeeked = () => { video.removeEventListener("seeked", onSeeked); resolve(); };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = Math.min(time, video.duration - 0.05);
  });
}

$("buildNarrativeBtn").addEventListener("click", () => {
  const noted = frameNotes.filter((f) => f.note.trim());
  if (noted.length === 0) { setStatus("Add at least one frame note first.", "error"); return; }
  const lines = noted.map((f) => `At ${fmtTime(f.time)} into the recording, ${f.note.trim()}`);
  const narrative = "Based on review of recorded video footage. " + lines.join(" ");
  const existing = $("summaryInput").value.trim();
  $("summaryInput").value = existing ? existing + "\n\n" + narrative : narrative;
  saveDraft();
  setStatus("Summary built from frame notes.");
});

/* ---------- Build the report (template layout) ---------- */
$("generateBtn").addEventListener("click", () => {
  const hasContent =
    $("subjectName").value.trim() || $("summaryInput").value.trim() ||
    $("criminalName").value.trim() || getWeapons().some((w) => w.type || w.serial);
  if (!hasContent) {
    setStatus("Add a name, summary, or some details first.", "error");
    return;
  }

  const report = {
    name: $("subjectName").value.trim() || "[Name]",
    date: formatMDY($("incidentDate").value),
    arresting_officers: $("arrestingOfficers").value.trim() || "LSPD, BCSO, SAST, SWAT",
    summary: $("summaryInput").value.trim(),
    evidence: $("evidenceLocker").value.trim(),
    weapons: weaponsText(),
    s_name: $("criminalName").value.trim(),
    s_plea: $("plea").value,
    s_time: $("timeSentenced").value.trim() || "0",
    s_fine: $("fine").value.trim() || "0",
  };
  renderReport(report);
  setStatus("Report built. Review and edit any field before you export.");
});

/* ---------- Render editable report in the template layout ---------- */
function makeField(key, label, value, isLong) {
  const wrap = document.createElement("div");
  wrap.className = "rep-field";
  const lab = document.createElement("label");
  lab.textContent = label;
  const el = isLong ? document.createElement("textarea") : document.createElement("input");
  if (isLong) { el.rows = Math.max(2, String(value).split("\n").length); } else { el.type = "text"; }
  el.value = value;
  el.dataset.key = key;
  wrap.appendChild(lab);
  wrap.appendChild(el);
  return wrap;
}

function renderReport(r) {
  const form = $("reportForm");
  form.innerHTML = "";
  $("reportEmpty").classList.add("hidden");
  form.classList.remove("hidden");

  const grid = document.createElement("div");
  grid.className = "rep-grid";
  grid.appendChild(makeField("name", "Name", r.name, false));
  grid.appendChild(makeField("date", "Date", r.date, false));
  form.appendChild(grid);

  addSectionHead(form, "Arresting Officers");
  form.appendChild(makeField("arresting_officers", "Arresting officers", r.arresting_officers, false));

  addSectionHead(form, "Summary");
  form.appendChild(makeField("summary", "Summary", r.summary, true));

  addSectionHead(form, "Evidence");
  form.appendChild(makeField("evidence", "Evidence locker #", r.evidence, false));

  addSectionHead(form, "Weapon");
  form.appendChild(makeField("weapons", "Weapons (one per line)", r.weapons, true));

  addSectionHead(form, "Sentence");
  const sgrid = document.createElement("div");
  sgrid.className = "rep-grid";
  sgrid.appendChild(makeField("s_name", "Criminal name", r.s_name, false));
  sgrid.appendChild(makeField("s_plea", "Plea", r.s_plea, false));
  sgrid.appendChild(makeField("s_time", "Time sentenced (months)", r.s_time, false));
  sgrid.appendChild(makeField("s_fine", "Fine ($)", r.s_fine, false));
  form.appendChild(sgrid);

  ["copyBtn", "printBtn", "downloadBtn"].forEach((id) => ($(id).disabled = false));

  requestAnimationFrame(() => {
    document.querySelector(".report-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function addSectionHead(form, label) {
  const h = document.createElement("div");
  h.className = "section-head";
  h.textContent = label;
  form.appendChild(h);
}

/* ---------- Export in the exact template layout ---------- */
function g(key) {
  const el = $("reportForm").querySelector(`[data-key="${key}"]`);
  return el ? el.value.trim() : "";
}

function reportToText() {
  return [
    g("name") || "[Name]",
    "Date: " + (g("date") || "00/00/0000"),
    "",
    "Arresting Officers",
    g("arresting_officers"),
    "",
    "Summary",
    g("summary"),
    "",
    "Evidence",
    "Evidence Locker: #" + g("evidence"),
    "",
    "Weapon",
    g("weapons") || "N/A",
    "",
    "Sentence",
    g("s_name") + " -",
    g("s_plea"),
    "Time Sentenced: " + (g("s_time") || "0") + " Months",
    "Fine: $" + (g("s_fine") || "0"),
  ].join("\n");
}

$("copyBtn").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(reportToText()); setStatus("Report copied to clipboard."); }
  catch (_) { setStatus("Copy failed — select and copy manually.", "error"); }
});

$("printBtn").addEventListener("click", () => window.print());

$("downloadBtn").addEventListener("click", () => {
  const blob = new Blob([reportToText()], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "incident-report-" + new Date().toISOString().slice(0, 10) + ".txt";
  a.click();
  URL.revokeObjectURL(url);
});

/* ---------- Boot ---------- */
loadDraft();
initDefaults();
