"use strict";

/* ---------- State & storage ---------- */
const store = {
  get key() { return localStorage.getItem("pd_api_key") || ""; },
  set key(v) { localStorage.setItem("pd_api_key", v); },
  get model() { return localStorage.getItem("pd_model") || "claude-sonnet-5"; },
  set model(v) { localStorage.setItem("pd_model", v); },
  get frames() { return parseInt(localStorage.getItem("pd_frames") || "8", 10); },
  set frames(v) { localStorage.setItem("pd_frames", String(v)); },
};

let mode = "text";
let capturedFrames = []; // array of data URLs (jpeg)

/* ---------- Element helpers ---------- */
const $ = (id) => document.getElementById(id);
const statusEl = $("status");

function setStatus(msg, kind = "") {
  statusEl.textContent = msg;
  statusEl.className = "status" + (kind ? " " + kind : "");
}

/* ---------- Settings dialog ---------- */
const dialog = $("settingsDialog");
$("settingsBtn").addEventListener("click", () => {
  $("apiKey").value = store.key;
  $("modelSelect").value = store.model;
  $("frameCount").value = String(store.frames);
  dialog.showModal();
});
dialog.addEventListener("close", () => {
  if (dialog.returnValue === "save") {
    store.key = $("apiKey").value.trim();
    store.model = $("modelSelect").value;
    store.frames = parseInt($("frameCount").value, 10);
    setStatus("Settings saved.");
  }
});

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

/* ---------- Video upload + frame extraction ---------- */
const dropzone = $("dropzone");
const videoInput = $("videoInput");
const videoPreview = $("videoPreview");
const frameStrip = $("frameStrip");

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
  const file = e.dataTransfer.files[0];
  if (file) handleVideoFile(file);
});
videoInput.addEventListener("change", () => {
  if (videoInput.files[0]) handleVideoFile(videoInput.files[0]);
});

function handleVideoFile(file) {
  if (!file.type.startsWith("video/")) { setStatus("That file isn't a video.", "error"); return; }
  capturedFrames = [];
  frameStrip.innerHTML = "";
  const url = URL.createObjectURL(file);
  videoPreview.src = url;
  videoPreview.classList.remove("hidden");
  setStatus("Loading video…");
  videoPreview.addEventListener("loadedmetadata", () => extractFrames(), { once: true });
}

async function extractFrames() {
  const duration = videoPreview.duration;
  if (!isFinite(duration) || duration <= 0) { setStatus("Couldn't read video duration.", "error"); return; }
  const n = store.frames;
  const canvas = document.createElement("canvas");
  const w = 640;
  const scale = w / (videoPreview.videoWidth || w);
  canvas.width = w;
  canvas.height = Math.round((videoPreview.videoHeight || 360) * scale);
  const ctx = canvas.getContext("2d");

  setStatus("Sampling frames", "busy");
  for (let i = 0; i < n; i++) {
    const t = (duration * (i + 0.5)) / n;
    await seek(videoPreview, t);
    ctx.drawImage(videoPreview, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    capturedFrames.push(dataUrl);
    const img = document.createElement("img");
    img.src = dataUrl;
    img.alt = "Frame at " + t.toFixed(1) + "s";
    frameStrip.appendChild(img);
  }
  videoPreview.pause();
  setStatus(`Captured ${capturedFrames.length} frames. Ready to generate.`);
}

function seek(video, time) {
  return new Promise((resolve) => {
    const onSeeked = () => { video.removeEventListener("seeked", onSeeked); resolve(); };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = Math.min(time, video.duration - 0.05);
  });
}

/* ---------- Report field schema ---------- */
const FIELDS = [
  { key: "incident_type", label: "Incident type / classification" },
  { key: "case_number", label: "Case / report number" },
  { key: "incident_datetime", label: "Date & time of incident" },
  { key: "location", label: "Location / address" },
  { key: "reporting_officer", label: "Reporting officer" },
  { key: "badge_number", label: "Badge #" },
];
const LONG_FIELDS = [
  { key: "summary", label: "Summary", rows: 3 },
  { key: "narrative", label: "Narrative", rows: 10 },
  { key: "involved_parties", label: "Persons involved (victims, suspects, witnesses)", rows: 5 },
  { key: "vehicles_property", label: "Vehicles / property", rows: 3 },
  { key: "evidence", label: "Evidence", rows: 3 },
  { key: "actions_taken", label: "Actions taken", rows: 3 },
  { key: "disposition", label: "Status / disposition", rows: 2 },
];

/* ---------- Generate ---------- */
$("generateBtn").addEventListener("click", generate);

async function generate() {
  if (!store.key) { setStatus("Add your Anthropic API key in Settings first.", "error"); dialog.showModal(); return; }

  const officer = $("officerName").value.trim();
  const badge = $("badgeNo").value.trim();
  let content = [];

  if (mode === "text") {
    const text = $("summaryInput").value.trim();
    if (!text) { setStatus("Enter a brief summary of what happened.", "error"); return; }
    content.push({ type: "text", text: buildPrompt({ narrative: text, officer, badge }) });
  } else {
    if (capturedFrames.length === 0) { setStatus("Upload a video first.", "error"); return; }
    const notes = $("videoNotes").value.trim();
    content.push({ type: "text", text: buildPrompt({ videoNotes: notes, officer, badge, hasFrames: true }) });
    capturedFrames.forEach((f) => {
      content.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: f.split(",")[1] },
      });
    });
  }

  setGenerating(true);
  setStatus("Contacting Claude", "busy");
  try {
    const report = await callClaude(content);
    renderReport(report);
    setStatus("Draft generated. Review and edit every field before use.");
  } catch (err) {
    console.error(err);
    setStatus("Error: " + err.message, "error");
  } finally {
    setGenerating(false);
  }
}

function setGenerating(on) {
  $("generateBtn").disabled = on;
  $("generateBtn").textContent = on ? "Generating…" : "Generate report";
}

function buildPrompt({ narrative, videoNotes, officer, badge, hasFrames }) {
  const today = new Date().toISOString().slice(0, 10);
  let src;
  if (hasFrames) {
    src = "You are given still frames sampled in order from an incident video" +
      (videoNotes ? `. Additional context from the officer: "${videoNotes}"` : ".") +
      " Describe only what is visibly supported by the frames; do not invent details that are not observable.";
  } else {
    src = `Officer's brief account of the incident: "${narrative}"`;
  }

  return `You are a police records assistant that drafts incident reports for an officer to review.
Today's date is ${today}.
${officer ? `Reporting officer: ${officer}.` : ""}
${badge ? `Badge number: ${badge}.` : ""}

${src}

Produce a professional, neutral, factual draft incident report. Use clear, objective law-enforcement style.
Rules:
- Only state facts supported by the input. For anything unknown, use the literal placeholder "[UNKNOWN]" — never guess names, plates, times, or addresses.
- Write the narrative chronologically in third person, past tense.
- Do not fabricate a real case number; use "[UNKNOWN]" unless one was provided.

Respond with ONLY a JSON object (no markdown, no commentary) with exactly these string keys:
"incident_type", "case_number", "incident_datetime", "location", "reporting_officer",
"badge_number", "summary", "narrative", "involved_parties", "vehicles_property",
"evidence", "actions_taken", "disposition".`;
}

async function callClaude(content) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": store.key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: store.model,
      max_tokens: 2000,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    let detail = res.status + " " + res.statusText;
    try { const e = await res.json(); if (e.error && e.error.message) detail = e.error.message; } catch (_) {}
    throw new Error(detail);
  }
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  return parseReport(text);
}

function parseReport(text) {
  // Strip code fences if present, then locate the JSON object.
  let t = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1);
  try {
    return JSON.parse(t);
  } catch (_) {
    // Fallback: dump everything into the narrative.
    return { narrative: text };
  }
}

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
  el.value = value != null && String(value).trim() ? String(value) : "[UNKNOWN]";
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
  lines.push("AI-generated draft — must be reviewed and verified by a sworn officer before filing.");
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
