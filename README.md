# PD Incident Report Maker

A free, browser-based tool that builds a structured police incident report draft from a
**brief description** or an **uploaded video**. **No account, no API key, no cost** — everything
runs locally in your browser.

![status](https://img.shields.io/badge/type-static%20web%20app-blue)
![cost](https://img.shields.io/badge/cost-free%20%C2%B7%20no%20key-brightgreen)

## What it does

- **Describe** — type a short account of what happened, fill a few guided fields, and it composes
  a formatted report.
- **Upload video** — samples frames from the video *in your browser*, lets you write a note under
  each frame, then stitches them into a timestamped chronological narrative.
- Produces the standardized report layout: Name / Date, Arresting Officers, Summary, Evidence
  (Evidence Locker #), Weapon(s) with serial numbers, and Sentence (plea, months, fine).
- Copy / Print / Download output matches that template exactly.
- Auto-fills the current date and the default arresting agencies (both editable).
- Every field stays **editable** before you **Copy**, **Print/PDF**, or **Download**.
- Your draft **auto-saves** in the browser so you won't lose it on refresh.

## How to run it

It's a static site — no build step, no server, no key.

**Option A — open locally:** download the repo and open `index.html` in any browser.

**Option B — GitHub Pages (get a phone URL):** repo **Settings → Pages** → Branch `main` /
`(root)` → **Save**. After ~1 minute you get a URL like `https://calsxn.github.io/Pd/` that works
on your phone. Tip: use **Share → Add to Home Screen** to keep it like an app.

## Privacy

- The **video file is never uploaded** anywhere. Frames are drawn locally to a `<canvas>` and stay
  on your device.
- No API calls, no analytics, no backend, no database. Nothing leaves your browser.

## ⚠️ Important

This tool produces a **draft only**. A sworn officer must independently verify every fact, correct
errors, and complete all required fields before the report is used as, or filed as, an official
record. It is a drafting aid, not a system of record.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App structure & UI |
| `styles.css` | Styling (dark theme + print styles) |
| `app.js` | Frame sampling, local report assembly, export |
