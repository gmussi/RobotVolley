/**
 * Electron main process — the native shell that hosts the Vite-built game.
 *
 * Kept deliberately thin: it owns the window lifecycle, a single-instance guard,
 * and a small allow-listed IPC surface (app info, quit, JSON save file). Steam
 * integration (steamworks.js) will be wired in here in a later milestone.
 *
 * CommonJS on purpose — independent of the game package's ESM `"type": "module"`,
 * and the well-trodden path for Electron preload/sandbox compatibility.
 */
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { loadWindowState, saveWindowState } = require("./windowState.cjs");
const steam = require("./steam.cjs");

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const DIST_INDEX = path.join(__dirname, "..", "dist", "index.html");
const SAVE_FILE = path.join(app.getPath("userData"), "robotvolley-save.json");

/** @type {BrowserWindow | null} */
let mainWindow = null;

async function readSave() {
  try {
    return JSON.parse(await fsp.readFile(SAVE_FILE, "utf8"));
  } catch {
    return {}; // missing/corrupt save → empty; caller applies defaults
  }
}

// Synchronous read for the startup hydration path (see preload `loadSaveSync`),
// so the renderer's import-time settings reads see persisted values immediately.
function readSaveSync() {
  try {
    return JSON.parse(fs.readFileSync(SAVE_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function writeSave(data) {
  await fsp.mkdir(path.dirname(SAVE_FILE), { recursive: true });
  await fsp.writeFile(SAVE_FILE, JSON.stringify(data ?? {}, null, 2), "utf8");
  return true;
}

function createWindow() {
  const state = loadWindowState(app.getPath("userData"));

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 640,
    minHeight: 400,
    backgroundColor: "#0a0e1a", // matches --bg so there's no white flash
    title: "Robot Volley",
    show: false,
    autoHideMenuBar: true,
    fullscreen: true, // the game always launches fullscreen; width/height/x/y are
    // the bounds Electron restores to if the player exits fullscreen via the OS.
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("close", () => saveWindowState(app.getPath("userData"), mainWindow));
  mainWindow.on("closed", () => { mainWindow = null; });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(DIST_INDEX);
  }
}

// Single-instance: focus the existing window instead of opening a second one.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.on("app:quit", () => app.quit());
  ipcMain.handle("save:load", () => readSave());
  ipcMain.handle("save:write", (_event, data) => writeSave(data));
  ipcMain.on("save:load-sync", (event) => { event.returnValue = readSaveSync(); });

  // Steam: init BEFORE app "ready" so the overlay's command-line switches apply.
  // Safe no-op when Steam isn't running.
  steam.tryInit();
  ipcMain.handle("steam:status", () => ({ available: steam.isAvailable(), player: steam.getPlayer() }));
  ipcMain.handle("steam:auth-ticket", () => steam.getAuthTicket());
  ipcMain.handle("steam:unlock", (_event, apiName) => steam.unlockAchievement(apiName));
  ipcMain.handle("steam:is-unlocked", (_event, apiName) => steam.isAchievementUnlocked(apiName));
  ipcMain.handle("steam:clear", (_event, apiName) => steam.clearAchievement(apiName));

  app.whenReady().then(createWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
