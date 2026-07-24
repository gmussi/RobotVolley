/**
 * Headless smoke test — run with `electron electron/smoke.cjs`.
 * Loads the built game in a hidden window and asserts:
 *   - the page finishes loading (no did-fail-load / render crash),
 *   - no renderer console errors,
 *   - NO outbound requests to external font/CDN hosts (offline-safe).
 * Exits 0 on PASS, 1 on FAIL. Not shipped in packaged builds.
 */
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");

// Mirror the save IPC the real main process provides — the preload's
// `loadSaveSync` does a blocking sendSync at renderer startup, which would
// otherwise hang forever here and the page would never finish loading.
ipcMain.on("save:load-sync", (event) => { event.returnValue = {}; });
ipcMain.handle("save:write", () => true);
ipcMain.handle("save:load", () => ({}));
ipcMain.handle("app:version", () => "0.0.0-smoke");

const DIST_INDEX = path.join(__dirname, "..", "dist", "index.html");
const BLOCKED_HOST_RE = /(fonts\.googleapis\.com|fonts\.gstatic\.com|googleapis|gstatic|cdn\.)/i;

const consoleErrors = [];
const externalRequests = [];
let failed = false;

function fail(msg) {
  failed = true;
  console.error("FAIL:", msg);
}

app.whenReady().then(() => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Flag any external font/CDN fetch — the app must be fully self-contained.
  win.webContents.session.webRequest.onBeforeRequest((details, cb) => {
    if (/^https?:/i.test(details.url) && BLOCKED_HOST_RE.test(details.url)) {
      externalRequests.push(details.url);
    }
    cb({});
  });

  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 3) consoleErrors.push(message); // 3 = error
  });
  win.webContents.on("render-process-gone", (_e, d) => fail(`render process gone: ${d.reason}`));
  win.webContents.on("did-fail-load", (_e, code, desc) => fail(`did-fail-load ${code}: ${desc}`));

  win.webContents.on("did-finish-load", () => {
    // Give the module entry a moment to run (asset preload, audio init, first frame).
    setTimeout(() => {
      if (consoleErrors.length) fail(`console errors:\n  - ${consoleErrors.join("\n  - ")}`);
      if (externalRequests.length) fail(`external requests:\n  - ${externalRequests.join("\n  - ")}`);
      if (!failed) console.log("PASS: game loaded in Electron, no console errors, no external requests.");
      app.exit(failed ? 1 : 0);
    }, 2500);
  });

  win.loadFile(DIST_INDEX);
});

// Hard timeout so a hang doesn't wedge the run.
setTimeout(() => {
  fail("timeout — did-finish-load never fired");
  app.exit(1);
}, 20000);
