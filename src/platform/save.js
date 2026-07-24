/**
 * Persistent settings façade — one synchronous get/set API over two backends:
 *   - Web: localStorage passthrough (unchanged behavior from before this layer).
 *   - Desktop (Electron/Steam): a single JSON file in userData, Steam-Cloud-synced.
 *
 * The desktop cache is hydrated synchronously at module import (via the preload
 * `loadSaveSync` bridge) so the game's import-time reads — e.g. accessibility
 * flags, audio volumes — see persisted values immediately, exactly like
 * localStorage. Writes update the cache synchronously and flush to disk on a
 * short debounce so rapid slider drags don't thrash the file.
 *
 * Game code must go through this module, never `localStorage` or `window.desktop`
 * directly, so the same source runs on web and desktop.
 */
import { isDesktop, loadDesktopSaveSync, saveDesktopSave } from "./host.js";

const WRITE_DEBOUNCE_MS = 300;

/** @type {Record<string, string>} in-memory cache; values are strings (localStorage-compatible). */
let cache = {};
let flushTimer = null;

function hydrate() {
  if (isDesktop) {
    const blob = loadDesktopSaveSync();
    cache = blob && typeof blob === "object" ? { ...blob } : {};
    // One-time migration: if a browser build previously wrote localStorage keys
    // (e.g. a user who played on the web then installed the desktop app in the
    // same profile), fold them in without overwriting existing file values.
    migrateFromLocalStorage();
  } else {
    cache = null; // web mode reads/writes localStorage live (see getItem/setItem)
  }
}

/** Copy any legacy localStorage keys into the desktop cache once. */
function migrateFromLocalStorage() {
  try {
    if (typeof localStorage === "undefined") return;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("robotvolley_") && !(key in cache)) {
        cache[key] = localStorage.getItem(key);
      }
    }
  } catch {
    /* private-mode / no storage — ignore */
  }
}

function scheduleFlush() {
  if (!isDesktop) return;
  if (flushTimer != null) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void saveDesktopSave(cache);
  }, WRITE_DEBOUNCE_MS);
}

/** Read a string value, or `fallback` (default null) if absent. */
export function getItem(key, fallback = null) {
  if (isDesktop) return key in cache ? cache[key] : fallback;
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

/** Write a string value and persist it. */
export function setItem(key, value) {
  const str = String(value);
  if (isDesktop) {
    cache[key] = str;
    scheduleFlush();
    return;
  }
  try {
    localStorage.setItem(key, str);
  } catch {
    /* ignore quota/private-mode failures */
  }
}

/** Convenience: read + JSON.parse, returning `fallback` on absence or parse error. */
export function getJSON(key, fallback = null) {
  const raw = getItem(key, null);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Convenience: JSON.stringify + write. */
export function setJSON(key, value) {
  setItem(key, JSON.stringify(value));
}

/** Force an immediate flush (e.g. before quit). No-op on web. */
export function flushNow() {
  if (!isDesktop) return;
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  void saveDesktopSave(cache);
}

hydrate();
