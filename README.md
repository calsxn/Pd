# PD Incident Report Maker

A lightweight, browser-based tool that turns a **brief description** or an **uploaded video**
into a structured, editable police incident report draft.

![status](https://img.shields.io/badge/type-static%20web%20app-blue)

## What it does

- **Describe** — type a short account of what happened and get a full, formatted report.
- **Upload video** — samples frames from the video *in your browser* and drafts a report from
  what's visible, plus any notes you add.
- Fills standard report fields: incident type, case #, date/time, location, officer/badge,
  summary, narrative, persons involved, vehicles/property, evidence, actions taken, disposition.
- Every field is **editable** before you **Copy**, **Print/PDF**, or **Download** the report.

## How to run it

It's a static site — no build step, no server required.

**Option A — open locally:** download the repo and open `index.html` in a browser.

**Option B — GitHub Pages:** in the repo settings, enable Pages for this branch/root and visit
the published URL.

## Setup (one time)

1. Click **⚙️ Settings**.
2. Paste an **Anthropic API key** (create one at `console.anthropic.com`).
3. Pick a model. Click **Save**.

Your key is stored **only in your browser** (`localStorage`) and is sent directly to Anthropic's
API from your browser — it never passes through any other server.

## Privacy

- The **video file is never uploaded** anywhere. Frames are extracted locally with a `<canvas>`,
  and only those still images (plus your text) are sent to the Claude API to draft the report.
- No analytics, no backend, no database.

## ⚠️ Important

This tool produces an **AI-generated draft only**. It can be wrong or incomplete. A sworn officer
must independently verify every fact, correct errors, and complete all required fields before the
report is used as, or filed as, an official record. It is a drafting aid, not a system of record.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App structure & UI |
| `styles.css` | Styling (dark theme + print styles) |
| `app.js` | Frame extraction, Claude API call, report rendering/export |
