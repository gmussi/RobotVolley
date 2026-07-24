/**
 * Preload — the ONLY bridge between the sandboxed renderer (the game) and Node.
 *
 * Exposes a minimal, allow-listed `window.desktop` API via contextBridge. The
 * renderer can never reach `ipcRenderer`, `require`, or the filesystem directly;
 * it can only call the specific channels enumerated here. New capabilities
 * (Steam achievements, etc.) get added as explicit methods, never a raw invoke.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  platform: process.platform,
  version: () => ipcRenderer.invoke("app:version"),
  quit: () => ipcRenderer.send("app:quit"),
  // Persistent save (settings, bindings, loadout) as a single JSON blob in userData.
  // loadSaveSync hydrates the in-renderer cache at startup, before the game's
  // import-time settings reads run; writes go back asynchronously via saveSave.
  loadSaveSync: () => ipcRenderer.sendSync("save:load-sync"),
  loadSave: () => ipcRenderer.invoke("save:load"),
  saveSave: (data) => ipcRenderer.invoke("save:write", data),
  // Steamworks — all calls proxy to the main process; each is a safe no-op when
  // Steam isn't available. `unlock`/`clear` take a Steam achievement API name.
  steam: {
    status: () => ipcRenderer.invoke("steam:status"),
    unlock: (apiName) => ipcRenderer.invoke("steam:unlock", apiName),
    isUnlocked: (apiName) => ipcRenderer.invoke("steam:is-unlocked", apiName),
    clear: (apiName) => ipcRenderer.invoke("steam:clear", apiName),
  },
});
