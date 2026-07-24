/**
 * Quit IPC wiring test — run with `electron electron/smoke-quit.cjs`.
 * Verifies window.desktop.quit() (called from the new home-screen QUIT menu
 * item) reaches the main process over the real preload bridge. Intercepts
 * "app:quit" instead of calling the real app.quit() so the test can assert
 * and exit cleanly rather than actually terminating the process.
 */
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");

let quitReceived = false;
ipcMain.on("app:quit", () => { quitReceived = true; });
ipcMain.on("save:load-sync", (e) => { e.returnValue = {}; });
ipcMain.handle("save:load", () => ({}));
ipcMain.handle("save:write", () => true);
ipcMain.handle("app:version", () => "0.0.0-smoke");
ipcMain.handle("steam:status", () => ({ available: false, player: null }));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await win.loadURL("data:text/html,<title>rv</title>");

  const bridgeOk = await win.webContents.executeJavaScript(
    "typeof window.desktop === 'object' && typeof window.desktop.quit === 'function'",
  );
  win.webContents.executeJavaScript("window.desktop.quit()");
  await new Promise((r) => setTimeout(r, 200));

  if (bridgeOk && quitReceived) {
    console.log("PASS: window.desktop.quit() reached the main process.");
    app.exit(0);
  } else {
    console.error(`FAIL: bridgeOk=${bridgeOk} quitReceived=${quitReceived}`);
    app.exit(1);
  }
});

setTimeout(() => { console.error("FAIL: timeout"); app.exit(1); }, 15000);
