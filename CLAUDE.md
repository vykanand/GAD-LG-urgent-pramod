# CLAUDE.md — GAD-ikit Project Configuration

## Project Overview

**GAD QR Scanner** is a Windows desktop Electron app for QC/part-tracking workflows on a factory floor.
- Scans barcodes/QR codes and validates them against a master Excel database
- Logs every scan to daily Excel history files (`history-YYYY-MM-DD.xlsx`)
- Generates unique time-based barcodes on successful scan completion
- Hosts a local HTTPS/WebSocket web server so mobile phones can scan via browser on the same LAN

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop runtime | Electron 25.3.1 |
| UI | Vanilla HTML/CSS/JS (no framework) |
| Local server | Express 4 + Socket.io 4 |
| Excel I/O | SheetJS (xlsx 0.18.5) |
| Barcode rendering | JsBarcode (CDN-loaded in HTML) |
| QR code gen | qrcode 1.5.1 |
| TLS certs | selfsigned 1.10.11 |
| Build | electron-builder 24 → Windows NSIS installer |

---

## File Map (what lives where and why)

```
GAD-ikit/
├── main.js                  ← Electron main process. All IPC handlers, Excel read/write, print, web server control
├── index.html               ← Primary desktop UI (very large; vanilla JS inline)
├── scan-manager.js          ← All scan session logic, modal UX, barcode trigger on success (72KB)
├── mobile.html              ← Browser-based scanning for phones on LAN
├── master.html              ← Viewer for master.xlsx
├── settings.json            ← Field config: which Excel columns map to which scan fields
├── master.xlsx              ← Master parts database (source of truth for validation)
│
├── barcode-generator.js     ← Core barcode math: 13-digit EAN-style from timestamp + Luhn check
├── barcode-display.js       ← Canvas rendering via JsBarcode, print dialog integration
├── barcode-editor.html      ← Barcode editing UI
├── barcode-gen.html         ← Barcode generation tester
├── barcode-print.html       ← Print layout
│
├── load-master-data.js      ← Loads master.xlsx, returns structured JS object
├── JsBarcode.js             ← Local fallback copy of JsBarcode library
│
├── main/
│   └── services/
│       └── WebServerService.js  ← Express HTTPS server + Socket.io + QR code for mobile URL
│
├── scripts/
│   ├── make-ico.js          ← Converts PNG → ICO for Windows
│   ├── copy-build.js        ← Post-build file copy operations
│   └── patch-icon.js        ← Patches icon into built EXE
│
├── build/                   ← electron-builder resources (icon, installer script, sounds)
├── logs/                    ← App runtime logs
├── user-data/               ← Electron userData path override
└── history-*.xlsx           ← Daily scan logs (auto-created, date-stamped)
```

---

## Settings Schema (`settings.json`)

```json
{
  "fields": [
    { "id": "field_0", "label": "Manual code", "header": "Manual code", "headerCol": "A" },
    { "id": "field_1", "label": "Part Code",   "header": "Part Code",   "headerCol": "B" }
  ],
  "primaryFields": ["field_0"],
  "scanOperation": "equals",
  "displayField": "field_0",
  "displayFields": ["field_0", "field_1"],
  "showMultiScanPanel": true
}
```

To add a new scan field: add an entry to `fields[]` with a unique `id`, matching `header` (Excel column name), and `headerCol` (A/B/C…).

---

## IPC Handlers (main.js)

| Channel | Direction | Purpose |
|---|---|---|
| `read-master-data` | renderer → main | Load master.xlsx, return rows |
| `write-logs` | renderer → main | Append scan record to history Excel |
| `read-logs` | renderer → main | Read today's history Excel |
| `write-single-log` | renderer → main | Write one log entry |
| `print-barcode` | renderer → main | Silent print to label printer |
| `start-web-server` | renderer → main | Start Express/Socket.io server |
| `stop-web-server` | renderer → main | Stop server |
| `regenerate-tls` | renderer → main | New self-signed cert |
| `broadcast-session-update` | renderer → main | Push session state to mobile clients |

---

## Barcode Algorithm (`barcode-generator.js`)

- **Format:** 13-digit EAN-style
- **Structure:** `[10-digit time offset][2-digit ms][1-digit Luhn checksum]`
- **Epoch:** 2021-01-01 00:00:00 UTC
- **Uniqueness:** 10 ms resolution
- **Key functions:**
  - `generateBarcode(dateTime)` → barcode string
  - `decodeBarcode(barcode)` → original timestamp
  - `verifyBarcode(barcode)` → boolean
  - `formatBarcode(barcode)` → `XXXX-XXXX-XXXXX` display format

---

## Dev Commands

```bash
npm start          # Run in Electron (development)
npm run dist       # Build Windows installer (.exe)
npm run build      # Full build: icon gen → dist → patch icon → copy
npm run pack       # Build without installer (dir only)
npm run make-icon  # Regenerate .ico from logo.png
npm run copy-build # Copy built files to deployment location
```

---

## Scan Flow (end-to-end)

1. App loads → `load-master-data.js` reads `master.xlsx` via IPC → rows stored in memory
2. User scans a barcode → `scan-manager.js` receives input
3. Value compared against master data using `scanOperation` (default: `equals`)
4. **Pass:** Green success modal shown → `barcode-generator.js` creates time-based barcode → displayed via `barcode-display.js` → user can Print or Proceed
5. **Fail:** Error modal shown, error sound plays, logged to `history-error-YYYY-MM-DD.xlsx`
6. On Proceed → scan session reset, new barcode saved to `history-YYYY-MM-DD.xlsx`

Mobile flow mirrors this via WebSocket (`broadcast-session-update`).

---

## Current TODO (`todo.md`)

- [ ] Generate 2 barcodes instead of 1
- [ ] Display 2 barcodes in the success modal
- [ ] Print 2 barcodes
- [ ] Save both barcodes to history Excel

---

## Architecture Rules

- **No frontend framework** — keep everything vanilla JS/HTML. Do not introduce React/Vue/etc.
- **IPC boundary** — all file system, Excel, and print operations go through Electron IPC (`ipcMain`/`ipcRenderer`). Never do file I/O directly in renderer HTML files.
- **Settings-driven** — field configuration lives in `settings.json`. Do not hardcode column names or field IDs in logic.
- **Excel is the database** — `master.xlsx` is the source of truth. History files are append-only logs. Do not add SQLite or other DBs.
- **Local HTTPS only** — the web server is LAN-only with self-signed certs. Do not expose externally.

---

## Code Conventions

- Vanilla ES6+ (const/let, arrow functions, async/await, template literals)
- IPC handlers in `main.js` follow pattern: `ipcMain.handle('channel-name', async (event, ...args) => { ... })`
- Excel rows indexed from 1 (SheetJS convention); always account for header row
- Use `APP_DEBUG` environment variable to enable verbose logging: `const debug = process.env.APP_DEBUG ? console.log : () => {}`
- Audio feedback: `beep.mp3` = success, `error.mp3` = failure

---

## Common Gotchas

- `master.xlsx` must be in the app root directory at runtime (not in `build/`)
- Self-signed TLS cert is regenerated on first run; mobile browsers will show a security warning — users must accept it
- `scan-manager.js` is large (72KB) — search for specific sections using the comment headers inside the file
- History Excel files are date-stamped; a new file is auto-created at midnight
- `window.currentSelectedRow` holds the active master data row during a scan session

---

## Cross-File Dependency Graph

```
index.html (loads in order)
  ├── barcode-generator.js  → exports window.BarcodeGenerator (pure, no deps)
  ├── barcode-display.js    → exports window.BarcodeDisplay (needs JsBarcode + ipcRenderer)
  ├── JsBarcode.js          → local fallback for barcode rendering
  ├── load-master-data.js   → writes window.masterData, window.masterRawRows, window.settings
  └── scan-manager.js       → exports window.scanManager
                               reads: window.settings, window.currentSelectedRow,
                                      window.BarcodeGenerator, window.BarcodeDisplay,
                                      window.saveScanLogRealtime, window.getValueFromRow,
                                      window.renderFailureRecordBox, window.hideFailureRecordBox
```

## Key window.* Globals (set by whom, read by whom)

| Global | Set By | Read By |
|---|---|---|
| `window.settings` | load-master-data.js / index.html | scan-manager.js, all files |
| `window.masterData` | load-master-data.js | index.html, scan-manager.js |
| `window.currentSelectedRow` | index.html (parts modal) | scan-manager.js |
| `window.BarcodeGenerator` | barcode-generator.js | scan-manager.js |
| `window.BarcodeDisplay` | barcode-display.js | scan-manager.js |
| `window.scanManager` | scan-manager.js | index.html handleScan() |
| `window.saveScanLogRealtime` | index.html | scan-manager.js |
| `window.renderFailureRecordBox` | index.html | scan-manager.js |
| `window.hideFailureRecordBox` | index.html | scan-manager.js, index.html |
| `window.getValueFromRow` | index.html | scan-manager.js |

## Key DOM IDs

- `#field_0`, `#field_1` — Scan input fields (dynamic from settings)
- `#pass-status` — READY / PASS / FAILED
- `#scan-data-value` — Last scanned code
- `#final-pass-modal` — Green success modal (z:100000) with 2 barcodes
- `#final-pass-barcode-container` — Holds the 2 barcode SVGs
- `#blink-overlay` — Full-screen red flash on failure
- `#failure-record-box` — Red details box at bottom on failure
- `#parts-modal` — Master parts search modal
- `#pin-modal` — Supervisor PIN modal
- `#multi-scan-panel` — Multi-field scan progress panel (dynamic)

## Known Bug Log

| Date | Bug | Fix |
|---|---|---|
| 2026-03-18 | Red error dialog box not showing on scan failure | `renderFailureRecordBox` and `hideFailureRecordBox` were not exposed on `window`; added `window.renderFailureRecordBox = renderFailureRecordBox` etc. in index.html after function definitions |

## Environment

- **Platform:** Windows 10/11
- **Build target:** Windows x64 NSIS installer
- **Node:** via Electron (do not assume system Node version for runtime code)
- **No internet required at runtime** (JsBarcode CDN calls gracefully degrade to local fallback)
