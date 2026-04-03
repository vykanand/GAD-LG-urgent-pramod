const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

// Main-process debug gate. Set process.env.APP_DEBUG=1 to enable verbose logs.
const APP_DEBUG = !!process.env.APP_DEBUG;
if (!APP_DEBUG) {
  try {
    console.log = function() {};
    console.info = function() {};
    console.warn = function() {};
  } catch (e) {}
}

// Function to read Excel file with original format preservation
async function readExcelFile(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // Get the range of the sheet
    const range = XLSX.utils.decode_range(firstSheet['!ref']);
    const data = [];
    const headers = [];

    // Find column headers
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = firstSheet[XLSX.utils.encode_cell({r: 0, c: C})];
      headers[C] = cell?.v?.toString().trim() || '';
    }
    data.push(headers);

    // Read data rows
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      const row = [];
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell = firstSheet[XLSX.utils.encode_cell({r: R, c: C})];
        row[C] = cell?.v?.toString().trim() || '';
      }
      if (row.some(cell => cell !== '')) { // Skip empty rows
        data.push(row);
      }
    }
    
    return data;
  } catch (error) {
    console.error('Error reading Excel file:', error);
    throw error;
  }
}

// Function to write Excel file with proper handling of existing data
async function writeExcelFile(filePath, newData) {
  try {
    let existingData = [];
    // Try to read existing file
    if (fs.existsSync(filePath)) {
      try {
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        existingData = XLSX.utils.sheet_to_json(sheet);
      } catch (err) {
        console.log('Could not read existing file, starting fresh');
      }
    }

    // Combine existing and new data, removing duplicates
    const combinedData = [...newData, ...existingData].filter((item, index, self) =>
      index === self.findIndex((t) => {
        try {
          const keyA = (t['Generated code 1'] || t['Scanned Code'] || '').toString();
          const keyB = (item['Generated code 1'] || item['Scanned Code'] || '').toString();
          return t['Time'] === item['Time'] && keyA === keyB;
        } catch (e) {
          try {
            const keyA = (t['Generated code 1'] || t['Scanned Code'] || '').toString();
            const keyB = (item['Generated code 1'] || item['Scanned Code'] || '').toString();
            return t['Time'] === item['Time'] && keyA === keyB;
          } catch (ee) {
            return t['Time'] === item['Time'] && t['Scanned Code'] === item['Scanned Code'];
          }
        }
      })
    );

    // Create and format worksheet
    const ws = XLSX.utils.json_to_sheet(combinedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Scan Logs');

    // Auto-size columns
    const colWidths = {};
    const columnNames = Object.keys(combinedData[0] || {});
    columnNames.forEach(col => {
      const allValues = combinedData.map(row => String(row[col] || ''));
      allValues.push(col); // Include header in width calculation
      colWidths[col] = Math.max(...allValues.map(v => v.length)) + 2;
    });
    ws['!cols'] = columnNames.map(col => ({ wch: colWidths[col] }));

    // Write file
    XLSX.writeFile(wb, filePath);
    return { success: true, count: combinedData.length };
  } catch (error) {
    console.error('Error writing Excel file:', error);
    throw error;
  }
}

// Register IPC handlers immediately on app start
// Use project working directory when running unpackaged so master.xlsx
// in the project root is picked up (same behaviour as before).
const rootPath = app.isPackaged
  ? path.dirname(app.getPath('exe'))
  : process.cwd();

// Web server service (local LAN HTTPS server)
const WebServerService = require('./main/services/WebServerService');
let webServerService = null;

// Register web-server IPC handlers early so renderer can call them before app.ready
ipcMain.handle('start-web-server', async (event, displayAddress) => {
  try {
    if (displayAddress && webServerService && typeof webServerService.setDisplayAddress === 'function') {
      webServerService.setDisplayAddress(displayAddress);
    }
    if (!webServerService) return { success: false, error: 'Service not ready' };
    return await webServerService.startServer();
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('stop-web-server', async () => {
  try {
    if (!webServerService) return { success: false, error: 'Service not ready' };
    return await webServerService.stopServer();
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('get-server-status', async () => {
  try { if (!webServerService) return { success: true, isRunning: false }; return await webServerService.getServerStatus(); } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('regenerate-web-server-tls', async () => {
  try { if (!webServerService) return { success: false, error: 'Service not ready' }; return await webServerService.regenerateTLS(); } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('set-web-server-tls', (event, tlsOptions) => {
  try { if (!webServerService) return { success: false, error: 'Service not ready' }; return webServerService.setTLSOptions(tlsOptions || {}); } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('get-local-ips', () => {
  try { if (!webServerService) return { success: false, error: 'Service not ready' }; return { success: true, ips: webServerService.getLocalIPAddresses() }; } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('get-ca-cert', () => {
  try { if (!webServerService) return { success: false, error: 'Service not ready' }; return webServerService.getCAcert(); } catch (err) { return { success: false, error: err.message }; }
});

// Persist auto-start setting for web server
ipcMain.handle('set-web-server-autostart', (event, flag) => {
  try {
    if (!webServerService) return { success: false, error: 'Service not ready' };
    return webServerService.setAutoStart(!!flag);
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('get-web-server-config', () => {
  try {
    if (!webServerService) return { success: false, error: 'Service not ready' };
    return webServerService.getConfig();
  } catch (err) { return { success: false, error: err.message }; }
});

// Handle barcode printing.
// Electron requires a webContents (hence a BrowserWindow) to call .print() —
// there is no lower-level print API. The window is hidden and the print goes
// silent (no dialog) directly to the printer, so the user experience is:
// click Print in the app → label comes out of the printer, nothing else appears.
ipcMain.handle('print-barcode', async (event, data) => {
  let printWindow = null;
  let tmpHtmlPath = null;
  try {
    const { barcode, printerName, dataUrl } = data;

    // CSS mm units in @media print are DPI-independent — exactly 1mm on paper
    // regardless of screen DPI or Windows display scaling. The img is positioned
    // absolutely at 0,0 and sized to the physical label dimensions, so it always
    // fills the full label no matter what screen DPI the machine runs at.
    const printHtml = `<!doctype html>
<html><head><meta charset="UTF-8"><style>
  @page { size: 58mm 15mm; margin: 0; }
  * { margin: 0; padding: 0; }
  body { background: #fff; }
  img { position: absolute; top: 0; left: 0; width: 58mm; height: 15mm; }
</style></head>
<body><img src="${dataUrl}"></body></html>`;

    tmpHtmlPath = path.join(app.getPath('temp'), `barcode-print-${Date.now()}.html`);
    fs.writeFileSync(tmpHtmlPath, printHtml, 'utf8');

    // Window is larger than the label so content is never viewport-clipped at
    // any Windows DPI scale. Print output uses CSS mm units, not viewport px,
    // so window dimensions do not affect the printed size.
    printWindow = new BrowserWindow({
      width: 800,
      height: 300,
      show: false,
      frame: false,
      paintWhenInitiallyHidden: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    await printWindow.loadFile(tmpHtmlPath);

    // Let the image paint fully before printing.
    await new Promise(r => setTimeout(r, 400));

    const printOptions = {
      silent: true,
      printBackground: true,
      margins: { marginType: 'none' },
      pageSize: { width: 58000, height: 15000 }, // 58mm x 15mm in micrometres
    };
    if (printerName) printOptions.deviceName = printerName;
    console.log('[print] sending to printer:', JSON.stringify(printOptions));

    const printResult = await new Promise((resolve) => {
      printWindow.webContents.print(printOptions, (success, failureReason) => {
        resolve({ success, failureReason });
      });
    });

    if (!printResult.success) {
      console.error('[print] failed:', printResult.failureReason);
      return { success: false, error: printResult.failureReason || 'Print failed' };
    }

    // Keep window alive 3s so the spooler fully receives the data.
    setTimeout(() => {
      try { if (printWindow && !printWindow.isDestroyed()) printWindow.close(); } catch (e) {}
      try { fs.unlinkSync(tmpHtmlPath); } catch (e) {}
    }, 3000);

    return { success: true };

  } catch (error) {
    console.error('Print barcode error:', error);
    try { if (printWindow && !printWindow.isDestroyed()) printWindow.close(); } catch (e) {}
    try { if (tmpHtmlPath) fs.unlinkSync(tmpHtmlPath); } catch (e) {}
    return { success: false, error: error.message };
  }
});

// Allow renderer to broadcast session updates (selected row / field info) to connected mobile clients
ipcMain.handle('broadcast-session-update', async (event, session) => {
  try {
    if (!webServerService) return { success: false, error: 'Service not ready' };
    return webServerService.broadcastSessionUpdate(session || {});
  } catch (err) { return { success: false, error: err.message }; }
});

// Handle reading master data
ipcMain.handle('read-master-data', async () => {
  // Only look for master.xlsx in the application/project root (previous behaviour)
  const masterFilePath = path.join(rootPath, 'master.xlsx');
  console.log('[IPC] read-master-data invoked. rootPath=', rootPath);
  console.log('[IPC] master path =', masterFilePath);

  try {
    if (!fs.existsSync(masterFilePath)) {
      console.error('[IPC] master.xlsx not found at', masterFilePath);
      dialog.showErrorBox(
        'File Not Found',
        'master.xlsx not found in the application root.\n\nPlease place master.xlsx in the project root and restart the app.'
      );
      return null;
    }

    console.log('[IPC] reading master file at', masterFilePath);
    return await readExcelFile(masterFilePath);
  } catch (error) {
    console.error('[IPC] error reading master file:', error);
    dialog.showErrorBox(
      'Error Reading Master Data',
      `Could not read master.xlsx:\n${error.message}\n\nPlease ensure the file is not open in Excel.`
    );
    return null;
  }
});

// Handle writing logs (for manual export)
ipcMain.handle('write-logs', async (event, data) => {
  const d = new Date();
  const today = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  // Use the same history-<date>.xlsx filename pattern as real-time saves
  const logFilePath = path.join(rootPath, `history-${today}.xlsx`);
  try {
    const result = await writeExcelFile(logFilePath, data);
    return { success: true, filePath: logFilePath, ...result };
  } catch (error) {
    dialog.showErrorBox(
      'Error Saving Logs',
      `Could not save logs:\n${error.message}\n\nPlease ensure the file is not open in Excel and you have write permissions.`
    );
    return { success: false, error: error.message };
  }
});

// Handle reading logs for a specific date
ipcMain.handle('read-logs', async (event, data) => {
  const { date } = data;
  const logFilePath = path.join(rootPath, `history-${date}.xlsx`);

  console.log('read-logs called for date:', date);
  console.log('Log file path:', logFilePath);

  try {
    if (!fs.existsSync(logFilePath)) {
      console.log('Log file does not exist for date:', date);
      return [];
    }

    console.log('Reading log file...');
    const workbook = XLSX.readFile(logFilePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const logsData = XLSX.utils.sheet_to_json(sheet);

    console.log('Loaded logs data:', logsData.length, 'entries');
    return logsData;
  } catch (error) {
    console.error('Error reading logs file:', error);
    return [];
  }
});

// Handle writing single log entry in real-time
ipcMain.handle('write-single-log', async (event, data) => {
  const { log, date } = data;
  const logFilePath = path.join(rootPath, `history-${date}.xlsx`);

  console.log('write-single-log called for date:', date);
  console.log('Log file path:', logFilePath);
  console.log('Log entry:', log);

  try {
    let existingData = [];

    // Try to read existing file
    if (fs.existsSync(logFilePath)) {
      try {
        console.log('Reading existing log file...');
        const workbook = XLSX.readFile(logFilePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        existingData = XLSX.utils.sheet_to_json(sheet);
        console.log('Existing data loaded:', existingData.length, 'entries');
      } catch (err) {
        console.log('Could not read existing file, starting fresh:', err.message);
      }
    } else {
      console.log('No existing file found, creating new one');
    }

    // Add new log entry at the beginning (newest first)
    const combinedData = [log, ...existingData];
    console.log('Total entries after adding new log:', combinedData.length);

    // Create and format worksheet
    const ws = XLSX.utils.json_to_sheet(combinedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Scan Logs');

    // Auto-size columns
    const colWidths = {};
    const columnNames = Object.keys(log);
    columnNames.forEach(col => {
      const allValues = combinedData.map(row => String(row[col] || ''));
      allValues.push(col); // Include header in width calculation
      colWidths[col] = Math.max(...allValues.map(v => v.length)) + 2;
    });
    ws['!cols'] = columnNames.map(col => ({ wch: colWidths[col] }));

    // Write file
    XLSX.writeFile(wb, logFilePath);
    console.log('Log file written successfully');

    return { success: true, filePath: logFilePath, count: combinedData.length };
  } catch (error) {
    console.error('Error writing single log:', error);
    // Don't show error dialog for real-time saves to avoid interrupting workflow
    return { success: false, error: error.message };
  }
});

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  // Load the index.html file
  // (previously switched to print-test.html for testing)
  mainWindow.loadFile('index.html');

  // Maximize the window
  mainWindow.maximize();

  // Open DevTools in development
  // mainWindow.webContents.openDevTools();
}

// Accept self-signed certs for the local web server (development convenience)
// This prevents ERR_CERT_AUTHORITY_INVALID when loading the app's mobile page
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');

    // Build a dynamic allowlist: localhost + any IPs/hosts returned by webServerService
    const allowList = new Set(['localhost', '127.0.0.1', '::1']);
    if (webServerService) {
      try {
        if (webServerService.mobileUrl) {
          const m = new URL(webServerService.mobileUrl);
          if (m.hostname) allowList.add(m.hostname);
          if (m.port) allowList.add(String(m.port));
        }
      } catch (e) {}

      try {
        const ips = webServerService.getLocalIPAddresses();
        (ips || []).forEach(i => { if (i && i.address) allowList.add(i.address); });
      } catch (e) {}

      try {
        if (webServerService.displayAddress) allowList.add(webServerService.displayAddress);
      } catch (e) {}
    }

    // If the request host is in the allowlist and the port matches our web server
    if ((allowList.has(host) || allowList.has(`${host}`)) &&
        (!webServerService || !webServerService.port || String(port) === String(webServerService.port))) {
      event.preventDefault();
      try { callback(true); } catch (e) {}
      return;
    }
  } catch (e) {
    // ignore parsing errors
  }

  try { callback(false); } catch (e) {}
});

// Handle app exit
ipcMain.on('close-app', () => {
  app.quit();
});

// When Electron is ready
app.whenReady().then(() => {
  createWindow();

  // Instantiate WebServerService with minimal dependencies (nulls are acceptable)
  try {
    webServerService = new WebServerService(null, null, null, null);
  } catch (e) {
    console.error('Failed to initialize WebServerService:', e && e.message);
  }

  // If the service was configured to auto-start, start it now (best-effort)
  (async () => {
    try {
      if (webServerService && webServerService.autoStart) {
        try { await webServerService.startServer(); } catch (e) { console.warn('Auto-start server failed:', e && e.message); }
      }
    } catch (e) {}
  })();

  // webServerService is instantiated above; nothing else to do here

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
