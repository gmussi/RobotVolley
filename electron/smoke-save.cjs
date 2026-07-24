/**
 * Desktop save round-trip test — run with `electron electron/smoke-save.cjs`.
 * Exercises the real bridge: renderer → preload → IPC → JSON file → back.
 * Uses a temp userData dir so it never touches a real profile. Exits 0/1.
 */
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const fsp = require("node:fs/promises");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "rv-save-"));
app.setPath("userData", TMP);
const SAVE_FILE = path.join(TMP, "robotvolley-save.json");

async function readSave() {
  try { return JSON.parse(await fsp.readFile(SAVE_FILE, "utf8")); } catch { return {}; }
}
async function writeSave(data) {
  await fsp.mkdir(path.dirname(SAVE_FILE), { recursive: true });
  await fsp.writeFile(SAVE_FILE, JSON.stringify(data ?? {}, null, 2), "utf8");
  return true;
}
function readSaveSync() {
  try { return JSON.parse(fs.readFileSync(SAVE_FILE, "utf8")); } catch { return {}; }
}

ipcMain.on("save:load-sync", (e) => { e.returnValue = readSaveSync(); });
ipcMain.handle("save:load", () => readSave());
ipcMain.handle("save:write", (_e, data) => writeSave(data));

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

  const ok = await win.webContents.executeJavaScript(`(async () => {
    await window.desktop.saveSave({ "robotvolley_music_vol": "0.42", nested: { a: 1 } });
    const async = await window.desktop.loadSave();
    const sync = window.desktop.loadSaveSync();
    return async.robotvolley_music_vol === "0.42"
      && sync.robotvolley_music_vol === "0.42"
      && async.nested && async.nested.a === 1;
  })()`);

  const onDisk = readSaveSync().robotvolley_music_vol === "0.42";
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }

  if (ok && onDisk) {
    console.log("PASS: save round-trip (write → file → async+sync read) works.");
    app.exit(0);
  } else {
    console.error(`FAIL: bridge=${ok} onDisk=${onDisk}`);
    app.exit(1);
  }
});

setTimeout(() => { console.error("FAIL: timeout"); app.exit(1); }, 15000);
