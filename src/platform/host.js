/**
 * Host capability shim — the single place the game asks "am I running inside the
 * desktop (Electron/Steam) shell, and what can it do?".
 *
 * Game code imports from here instead of touching `window.desktop` directly, so
 * the exact same source runs on the web (GitHub Pages) and in Electron. On the
 * web every capability is simply absent and callers fall back (e.g. save.js →
 * localStorage).
 */
const bridge = typeof window !== "undefined" ? window.desktop ?? null : null;

/** True only inside the Electron/Steam desktop build. */
export const isDesktop = !!bridge?.isDesktop;

/** "web" | "darwin" | "win32" | "linux" */
export function getPlatform() {
  return bridge?.platform ?? "web";
}

/**
 * Synchronously read the persisted save blob from the native shell (used to
 * hydrate the save cache at startup). Returns null on the web or on any error.
 */
export function loadDesktopSaveSync() {
  if (!bridge?.loadSaveSync) return null;
  try {
    return bridge.loadSaveSync() ?? null;
  } catch {
    return null;
  }
}

/** Load the persisted save blob from the native shell, or null on the web. */
export async function loadDesktopSave() {
  if (!bridge) return null;
  try {
    return await bridge.loadSave();
  } catch {
    return null;
  }
}

/** Persist the save blob through the native shell. No-op (false) on the web. */
export async function saveDesktopSave(data) {
  if (!bridge) return false;
  try {
    return await bridge.saveSave(data);
  } catch {
    return false;
  }
}

/** Quit the desktop app entirely. No-op on the web. */
export function quitApp() {
  bridge?.quit?.();
}

/**
 * Steam status: { available, player } — available is false on web or when the
 * Steam client isn't running. Never throws.
 */
export async function getSteamStatus() {
  if (!bridge?.steam) return { available: false, player: null };
  try {
    return await bridge.steam.status();
  } catch {
    return { available: false, player: null };
  }
}

/** Fire-and-forget Steam achievement unlock by API name. No-op off desktop. */
export function unlockSteamAchievement(apiName) {
  bridge?.steam?.unlock?.(apiName);
}
