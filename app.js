"use strict";

/* ============================================================
   PD Incident Report Maker — free, no-key, fully client-side.
   Builds a formatted report from typed details or video frames.
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
  "summaryInput", "incidentType", "caseNumber", "incidentDate", "location",
  "officerName", "badgeNo", "involvedParties", "vehiclesProperty",
  "evidence", "actionsTaken", "disposition",
];

function saveDraft() {
  const data = {};
  INPUT_IDS.forEach((id) => (data[id] = $(id).value));
  localStorage.setItem("pd_draft", JSON.stringify(data));
}

function loadDraft() {
  try {
    const data = JSON.parse(localStorage.getItem("pd_draft") || "{}");
    INPUT_IDS.forEach((id) => { if (data[id] != null) $(id).value = data[id]; });
  } catch (_) {}
}

INPUT_IDS.forEach((id) => $(id).addEventListener("input", saveDraft));

/* ---------- Sensible defaults ---------- */
function pad(n) { return String(n).padStart(2, "0"); }

function defaultCaseNumber() {
  const d = new Date();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}${pad(d.getDate())}-${rand}`;
}

function localDatetimeValue(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initDefaults() {
  if (!$("caseNumber").value) $("caseNumber").value = defaultCaseNumber();
  if (!$("incidentDate").value) $("incidentDate").value = localDatetimeValue(new Date());
}

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
  setStatus(`Captured ${n} frames. Add a note under each, then build the narrative.`);
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
  const narrative = "The following is based on review of recorded video footage. " + lines.join(" ");
  const existing = $("summaryInput").value.trim();
  $("summaryInput").value = existing ? existing + "\n\n" + narrative : narrative;
  saveDraft();
  setStatus("Narrative built from frame notes and added to the summary box.");
});

/* ---------- Build the report ---------- */
const FIELDS = [
  { key: "incident_type", label: "Incident type / classification", from: () => $("incidentType").value },
  { key: "case_number", label: "Case / report number", from: () => $("caseNumber").value },
  { key: "incident_datetime", label: "Date & time of incident", from: () => formatDate($("incidentDate").value) },
  { key: "location", label: "Location / address", from: () => $("location").value },
  { key: "reporting_officer", label: "Reporting officer", from: () => $("officerName").value },
  { key: "badge_number", label: "Badge #", from: () => $("badgeNo").value },
];
const LONG_FIELDS = [
  { key: "summary", label: "Summary", rows: 3, from: () => firstSentences($("summaryInput").value, 2) },
  { key: "narrative", label: "Narrative", rows: 10, from: () => $("summaryInput").value },
  { key: "involved_parties", label: "Persons involved", rows: 4, from: () => $("involvedParties").value },
  { key: "vehicles_property", label: "Vehicles / property", rows: 2, from: () => $("vehiclesProperty").value },
  { key: "evidence", label: "Evidence", rows: 2, from: () => $("evidence").value },
  { key: "actions_taken", label: "Actions taken", rows: 2, from: () => $("actionsTaken").value },
  { key: "disposition", label: "Status / disposition", rows: 1, from: () => $("disposition").value },
];

function formatDate(v) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d)) return v;
  return d.toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });
}

function firstSentences(text, count) {
  if (!text) return "";
  const parts = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return parts.slice(0, count).join(" ").trim();
}

function val(v) {
  return v != null && String(v).trim() ? String(v).trim() : "[UNKNOWN]";
}

$("generateBtn").addEventListener("click", () => {
  const summary = $("summaryInput").value.trim();
  const anyDetail = INPUT_IDS.some((id) => $(id).value.trim());
  if (!summary && !anyDetail) {
    setStatus("Add a brief summary or some incident details first.", "error");
    return;
  }
  const report = {};
  FIELDS.forEach((f) => (report[f.key] = f.from()));
  LONG_FIELDS.forEach((f) => (report[f.key] = f.from()));
  renderReport(report);
  setStatus("Report built. Review and edit every field before use.");
});

/* ---------- Render editable report ---------- */
function renderReport(report) {
  const form = $("reportForm");
  form.innerHTML = "";
  $("reportEmpty").classList.add("hidden");
  form.classList.remove("hidden");

  const grid = document.createElement("div");
  grid.className = "rep-grid";
  FIELDS.forEach((f) => grid.appendChild(field(f, report[f.key], false)));
  form.appendChild(grid);

  LONG_FIELDS.forEach((f) => {
    if (f.key === "summary") addSectionHead(form, "Summary");
    if (f.key === "narrative") addSectionHead(form, "Narrative");
    if (f.key === "involved_parties") addSectionHead(form, "Parties, property & evidence");
    if (f.key === "actions_taken") addSectionHead(form, "Response");
    form.appendChild(field(f, report[f.key], true));
  });

  ["copyBtn", "printBtn", "downloadBtn"].forEach((id) => ($(id).disabled = false));

  // On phones the report renders below the long input form — bring it into view
  // so it's obvious the report was built.
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

function field(f, value, isLong) {
  const wrap = document.createElement("div");
  wrap.className = "rep-field";
  const label = document.createElement("label");
  label.textContent = f.label;
  const el = isLong ? document.createElement("textarea") : document.createElement("input");
  if (isLong) el.rows = f.rows || 3; else el.type = "text";
  el.value = val(value);
  el.dataset.key = f.key;
  el.dataset.label = f.label;
  wrap.appendChild(label);
  wrap.appendChild(el);
  return wrap;
}

/* ---------- Export ---------- */
function reportToText() {
  const lines = ["POLICE INCIDENT REPORT (DRAFT)", "=".repeat(40), ""];
  $("reportForm").querySelectorAll("[data-key]").forEach((el) => {
    lines.push(el.dataset.label.toUpperCase() + ":");
    lines.push(el.value);
    lines.push("");
  });
  lines.push("-".repeat(40));
  lines.push("Draft — must be reviewed and verified by a sworn officer before filing.");
  return lines.join("\n");
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
