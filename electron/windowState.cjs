/**
 * Window bounds persistence — remembers size/position/maximized across launches.
 * Stored as a tiny JSON file in userData, separate from the game save so a
 * corrupt layout never risks player data.
 */
const path = require("node:path");
const fs = require("node:fs");

const FILE = "window-state.json";
const DEFAULTS = { width: 1000, height: 640, x: undefined, y: undefined, maximized: false };

function filePath(userDataDir) {
  return path.join(userDataDir, FILE);
}

function loadWindowState(userDataDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath(userDataDir), "utf8"));
    return {
      width: Number(raw.width) || DEFAULTS.width,
      height: Number(raw.height) || DEFAULTS.height,
      x: Number.isFinite(raw.x) ? raw.x : undefined,
      y: Number.isFinite(raw.y) ? raw.y : undefined,
      maximized: !!raw.maximized,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveWindowState(userDataDir, win) {
  if (!win || win.isDestroyed()) return;
  try {
    const maximized = win.isMaximized();
    // Use normal (unmaximized) bounds so restore size survives a maximized close.
    const bounds = win.getNormalBounds();
    fs.writeFileSync(
      filePath(userDataDir),
      JSON.stringify({ ...bounds, maximized }, null, 2),
      "utf8",
    );
  } catch {
    /* best-effort; a failed layout write must never crash shutdown */
  }
}

module.exports = { loadWindowState, saveWindowState };
