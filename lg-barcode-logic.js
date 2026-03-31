/**
 * lg-barcode-logic.js  —  GAD-ikit LG Barcode Decode Module
 *
 * LG Barcode Format (17+4 = 21 chars, partNoLength=11 default):
 *   [Part No of LGE (11)] [National Code (1)] [Supplier Code (2)] [Year (1)] [Month (1)] [Date (1)] [Serial (4)]
 *
 * Example:  EAY62889401  K  SH  5  1  B  0022
 *           ───────────  ─  ──  ─  ─  ─  ────
 *           Part No     Nat Sup  Y  M  D  Serial
 *   → Part: EAY62889401 | Nation: Korea | Supplier: SH | Date: 2015-01-11 | Serial: #22
 *
 * This module is fully standalone.
 * It loads config from lg-logic-config.json (same directory, synchronous XHR).
 * It exposes window.LGBarcodeLogic.
 * It requires nodeIntegration:true (uses require('electron').ipcRenderer).
 */
(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────────────────

  let cfg = null;

  function loadConfig() {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', 'lg-logic-config.json', false); // synchronous, same as scan-manager.js pattern
      xhr.send(null);
      if (xhr.status === 200) cfg = JSON.parse(xhr.responseText);
    } catch (e) {
      console.error('[LGBarcodeLogic] Failed to load lg-logic-config.json:', e);
    }
    if (!cfg) {
      // Hard-coded fallback so the app never silently breaks
      cfg = {
        enabled: true, supplierCode: 'GA', validateSupplier: true, nationalCode: 'I', validateNational: true,
        partNoLength: 11, serialLength: 4, yearDecadeStart: 2020,
        nationalCodes: { K: 'Korea', C: 'China', M: 'Malaysia', T: 'Thailand', V: 'Vietnam', I: 'India', P: 'Philippines' },
        monthCodes: { '1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'O':10,'N':11,'D':12 },
        dateCodes: { '1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'A':10,'B':11,'C':12,'D':13,'E':14,'F':15,'G':16,'H':17,'I':18,'J':19,'K':20,'L':21,'M':22,'N':23,'O':24,'P':25,'Q':26,'R':27,'S':28,'T':29,'U':30,'V':31 }
      };
    }
  }

  // ── Serial tracking ──────────────────────────────────────────────────────────
  // Resets automatically at midnight (date rollover). Scoped to today only.

  const _usedSerials = new Set();
  let _trackedDate = _todayStr();

  function _todayStr() {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  }

  function _rolloverCheck() {
    const today = _todayStr();
    if (today !== _trackedDate) {
      _trackedDate = today;
      _usedSerials.clear(); // new day — serials reset
    }
  }

  function isSerialUnique(serial) {
    _rolloverCheck();
    return !_usedSerials.has(serial);
  }

  function registerSerial(serial) {
    _rolloverCheck();
    if (serial) _usedSerials.add(serial);
  }

  /** Extracts serial from a raw LG barcode string and registers it if valid format. */
  function registerSerialFromCode(code) {
    if (!isLGFormat(code)) return;
    const d = decode(code);
    if (d) registerSerial(d.serial);
  }

  /**
   * Load today's used serials from history on app startup.
   * Uses existing read-logs IPC — no new main.js handler needed.
   */
  async function loadTodaySerials() {
    try {
      const { ipcRenderer } = require('electron');
      const today = _todayStr();
      const entries = await ipcRenderer.invoke('read-logs', { date: today });
      if (!Array.isArray(entries)) return;
      let count = 0;
      entries.forEach(entry => {
        Object.values(entry).forEach(val => {
          if (typeof val === 'string' && isLGFormat(val)) {
            const d = decode(val);
            if (d) { registerSerial(d.serial); count++; }
          }
        });
      });
      console.info('[LGBarcodeLogic] Loaded', count, 'used serial(s) from today\'s history.');
    } catch (e) {
      console.warn('[LGBarcodeLogic] Could not load today\'s serials from history:', e);
    }
  }

  // ── Core decode ──────────────────────────────────────────────────────────────

  /**
   * Returns true if the code matches the LG barcode structure defined in config.
   * Checks: length, national code, supplier (optional), year digit, month code, date code, serial digits.
   */
  function isLGFormat(code) {
    if (!cfg || !cfg.enabled) return false;
    if (!code || typeof code !== 'string') return false;

    const pnLen = cfg.partNoLength;
    const supLen = (cfg.supplierCode || '').length || 2;
    const expectedLen = pnLen + 1 + supLen + 1 + 1 + 1 + cfg.serialLength;
    if (code.length !== expectedLen) return false;

    const nationChar = code[pnLen];
    const supplierStr = code.slice(pnLen + 1, pnLen + 1 + supLen);
    const yearChar   = code[pnLen + 1 + supLen];
    const monthChar  = code[pnLen + 2 + supLen];
    const dateChar   = code[pnLen + 3 + supLen];
    const serial     = code.slice(pnLen + 4 + supLen);

    if (!cfg.nationalCodes[nationChar]) return false;
    if (cfg.validateNational && cfg.nationalCode && nationChar !== cfg.nationalCode) return false;
    if (cfg.validateSupplier && cfg.supplierCode && supplierStr !== cfg.supplierCode) return false;
    if (!(/^[0-9]$/.test(yearChar))) return false;
    if (!(monthChar in cfg.monthCodes)) return false;
    if (!(dateChar in cfg.dateCodes)) return false;
    if (!(/^\d{4}$/.test(serial))) return false;

    return true;
  }

  /**
   * Decode a validated LG barcode string into a structured object.
   * Returns null for invalid format.
   */
  function decode(code) {
    if (!isLGFormat(code)) return null;

    const pnLen  = cfg.partNoLength;
    const supLen = (cfg.supplierCode || '').length || 2;

    const partNo      = code.slice(0, pnLen);
    const nationChar  = code[pnLen];
    const supplierStr = code.slice(pnLen + 1, pnLen + 1 + supLen);
    const yearChar    = code[pnLen + 1 + supLen];
    const monthChar   = code[pnLen + 2 + supLen];
    const dateChar    = code[pnLen + 3 + supLen];
    const serial      = code.slice(pnLen + 4 + supLen);

    const year   = cfg.yearDecadeStart + parseInt(yearChar, 10);
    const month  = cfg.monthCodes[monthChar];
    const day    = cfg.dateCodes[dateChar];
    const nation = cfg.nationalCodes[nationChar] || nationChar;

    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');

    return {
      raw:          code,
      partNo,
      nationalChar: nationChar,
      nation,
      supplier:     supplierStr,
      yearChar,
      year,
      monthChar,
      month,
      dateChar,
      day,
      serial,
      serialInt:    parseInt(serial, 10),
      dateStr:      `${year}-${mm}-${dd}`,      // YYYY-MM-DD
      dateDisplay:  `${year}/${mm}/${dd}`,       // human readable
    };
  }

  // ── UI Panel ─────────────────────────────────────────────────────────────────

  let _panel = null;
  let _hideTimer = null;

  function _getPanel() {
    if (!_panel) _panel = document.getElementById('lg-decode-panel');
    return _panel;
  }

  /** Month names for human-readable display. */
  var MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

  function _ordinal(n) {
    var s = ['th','st','nd','rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /**
   * Show the decoded info panel with full character-by-character barcode
   * breakdown. Each segment is colour-coded with a matching label beneath.
   * Auto-hides after 12 s.
   */
  function showPanel(decoded) {
    const el = _getPanel();
    if (!el || !decoded) return;

    var monthName  = MONTH_NAMES[(decoded.month - 1)] || decoded.month;
    var dayOrdinal = _ordinal(decoded.day);

    // Colour-coded barcode segments definition
    var segs = [
      { val: decoded.partNo,       label: 'Part No (11)',  title: 'LGE Part Number',    cls: 'lgs-pn'  },
      { val: decoded.nationalChar, label: 'Nation (1)',    title: decoded.nation,        cls: 'lgs-nat' },
      { val: decoded.supplier,     label: 'Supplier (2)',  title: 'Supplier Code',       cls: 'lgs-sup' },
      { val: decoded.yearChar,     label: 'Year (1)',      title: String(decoded.year),  cls: 'lgs-yr'  },
      { val: decoded.monthChar,    label: 'Month (1)',     title: monthName,             cls: 'lgs-mo'  },
      { val: decoded.dateChar,     label: 'Date (1)',      title: dayOrdinal,            cls: 'lgs-dt'  },
      { val: decoded.serial,       label: 'Serial (4)',    title: 'Item #' + decoded.serialInt, cls: 'lgs-ser' },
    ];

    var bkCells = segs.map(function(s) {
      return '<div class="lg-bk-cell ' + s.cls + '">' +
               '<span class="lg-bk-val">' + s.val + '</span>' +
               '<span class="lg-bk-sub">' + s.label + '</span>' +
             '</div>';
    }).join('');

    var detailRows =
      _drow('Part No (LGE)',  decoded.partNo,       'lgs-pn',  decoded.partNo) +
      _drow('National Code',  decoded.nationalChar, 'lgs-nat', decoded.nation) +
      _drow('Supplier Code',  decoded.supplier,     'lgs-sup', decoded.supplier) +
      _drow('Mfg Year',       decoded.yearChar,     'lgs-yr',  String(decoded.year)) +
      _drow('Mfg Month',      decoded.monthChar,    'lgs-mo',  monthName) +
      _drow('Mfg Day',        decoded.dateChar,     'lgs-dt',  dayOrdinal) +
      '<div class="lg-row lg-date-hi">' +
        '<span class="lg-lbl">Full Mfg Date</span>' +
        '<span class="lg-val"><strong style="font-size:15px;letter-spacing:1px">' + decoded.dateDisplay + '</strong></span>' +
      '</div>' +
      '<div class="lg-row lg-ser-hi">' +
        '<span class="lg-lbl">Serial No.</span>' +
        '<span class="lg-val"><strong style="font-size:15px">#' + decoded.serial + '</strong>' +
        ' <span style="color:#aaa;font-size:11px">(item ' + decoded.serialInt + ' today)</span></span>' +
      '</div>';

    el.className = 'lg-panel-ok';
    el.style.display = '';
    el.innerHTML =
      '<div class="lg-ph">' +
        '<span class="lg-ph-icon">&#10004;</span> LG BARCODE — PASS' +
        '<button class="lg-close" onclick="window.LGBarcodeLogic.hidePanel()">&#x2715;</button>' +
      '</div>' +
      '<div class="lg-bk-wrap">' + bkCells + '</div>' +
      '<div class="lg-bk-full">' + decoded.raw + '</div>' +
      '<div class="lg-pb">' + detailRows + '</div>';

    clearTimeout(_hideTimer);
    _hideTimer = null; // static panel — no auto-hide on success
  }

  /** Detail row: code char (coloured badge) → decoded value */
  function _drow(label, code, cls, value) {
    return '<div class="lg-row">' +
      '<span class="lg-lbl">' + label + '</span>' +
      '<span class="lg-val"><span class="lg-badge ' + cls + '">' + code + '</span>' +
      ' <span style="color:#ddd">→</span> ' + value + '</span>' +
    '</div>';
  }

  /** Show an error message in the panel (auto-hides after 10 s). */
  function showError(message) {
    const el = _getPanel();
    if (!el) return;

    el.className = 'lg-panel-err';
    el.style.display = '';
    el.innerHTML =
      '<div class="lg-ph lg-ph-err">' +
        '<span>&#9888;</span> LG Barcode Error' +
      '</div>' +
      '<div class="lg-pb"><div class="lg-errmsg">' + message + '</div></div>';
    clearTimeout(_hideTimer);
    _hideTimer = null; // static panel — stays visible until next scan
  }

  function hidePanel() {
    const el = _getPanel();
    if (el) { el.className = 'lg-panel-blank'; el.innerHTML = ''; el.style.display = ''; }
  }

  function _row(label, value) {
    return '<div class="lg-row"><span class="lg-lbl">' + label + '</span><span class="lg-val">' + value + '</span></div>';
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  window.LGBarcodeLogic = {
    isLGFormat,
    decode,
    isSerialUnique,
    registerSerial,
    registerSerialFromCode,
    loadTodaySerials,
    showPanel,
    showError,
    hidePanel,
    getUsedSerials: function () { return new Set(_usedSerials); },
    getConfig:      function () { return cfg; },
  };

  // ── Auto-init ────────────────────────────────────────────────────────────────

  loadConfig();

  // Load today's history serials once DOM/IPC is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadTodaySerials);
  } else {
    loadTodaySerials();
  }

})();
