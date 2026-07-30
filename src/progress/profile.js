/**
 * The player's account as the game sees it: name, stats, unlocks, equipped
 * cosmetics — plus how fresh that picture is.
 *
 * Two rules shape this module:
 *
 *  1. **Cache first, reconcile after.** The last known profile is written to the
 *     save file and rendered immediately on boot. The network response replaces
 *     it when it lands. That is what makes "you played on another PC" feel like
 *     a refresh rather than a loading screen.
 *  2. **Offline is a normal outcome, not an error.** The web build is served
 *     from GitHub Pages and must stay playable with no backend at all, so a
 *     failed sync leaves the cached profile in place and says so quietly.
 *
 * The server is authoritative for stats and unlocks; the loadout is the only
 * field the client pushes, and even that is re-validated server-side.
 */
import { getJSON, setJSON } from "../platform/save.js";
import { apiFetch, isApiConfigured } from "../net/api.js";
import { defaultLoadout, sanitizeCosmetics } from "../data/cosmetics.js";
import { reconcileUnlocks } from "../ui/unlockReveal.js";

const CACHE_KEY = "robotvolley_profile_cache";

/** @typedef {"idle"|"loading"|"ready"|"offline"} SyncState */

/** @type {SyncState} */
let syncState = "idle";
let profile = null;
let inFlight = null;
/**
 * Bumped on every local optimistic write to the loadout. A `/me` GET can be
 * outstanding for a while (slow network, a boot-time sync still settling) and
 * land *after* the player has since equipped something new — without this, a
 * late response would silently overwrite that fresher choice with whatever
 * the loadout was when the GET was sent. `syncProfile()` snapshots this
 * before firing and keeps the local loadout if it no longer matches.
 */
let loadoutGeneration = 0;

const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(syncState, profile);
}

function setSyncState(next) {
  if (syncState === next) return;
  syncState = next;
  notify();
}

/** Subscribe to sync/profile changes (the menu redraws on these). */
export function onProfileChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** A placeholder profile so the UI always has something to draw. */
function blankProfile() {
  return {
    accountId: null,
    displayName: "ROBOT",
    stats: {
      wins: 0, losses: 0, matches: 0, elo: 1200,
      // Milestone counters. Present here so the Profile screen can show
      // progress toward a decal before the first sync lands.
      winStreak: 0, bestWinStreak: 0, perfectWins: 0, comebacks: 0,
    },
    unlocks: [],
    loadout: defaultLoadout(),
    updatedAt: 0,
  };
}

function normalize(raw) {
  if (!raw || typeof raw !== "object") return blankProfile();
  const base = blankProfile();
  return {
    ...base,
    ...raw,
    stats: { ...base.stats, ...(raw.stats ?? {}) },
    unlocks: Array.isArray(raw.unlocks) ? raw.unlocks : [],
    loadout: sanitizeCosmetics(raw.loadout),
  };
}

/** Load the cached profile. Safe to call at import time. */
export function hydrate() {
  if (profile) return profile;
  profile = normalize(getJSON(CACHE_KEY, null));
  return profile;
}

function cache() {
  setJSON(CACHE_KEY, profile);
}

export function getProfile() {
  return profile ?? hydrate();
}

export function getSyncState() {
  return syncState;
}

export function getDisplayName() {
  return getProfile().displayName;
}

export function getStats() {
  return getProfile().stats;
}

export function getLoadout() {
  return getProfile().loadout;
}

export function isUnlocked(cosmeticId) {
  return getProfile().unlocks.includes(cosmeticId);
}

/**
 * Pull the authoritative profile. Concurrent calls share one request. Never
 * throws and never clears the cache on failure — a bad network leaves the
 * player looking at their robot, not at nothing.
 */
export function syncProfile() {
  if (inFlight) return inFlight;
  hydrate();

  if (!isApiConfigured()) {
    setSyncState("offline");
    return Promise.resolve(profile);
  }

  setSyncState("loading");
  const startGeneration = loadoutGeneration;
  inFlight = (async () => {
    const res = await apiFetch("/me");
    if (res.ok && res.data) {
      const fresh = normalize(res.data);
      // Two GETs (e.g. the boot-time sync and a post-match refresh) can
      // resolve out of order. `updatedAt` is monotonic server-side, so a
      // response older than what we're already showing is a stale straggler
      // — applying it would roll wins/unlocks backward. Drop it instead.
      if (fresh.updatedAt >= (getProfile().updatedAt ?? 0)) {
        // A newer local equip happened while this request was in flight —
        // this response's loadout predates it, so keep what's on screen and
        // only take the fields the server is always authoritative for
        // (stats, unlocks, name). The equip's own request settles the
        // loadout for real.
        profile = loadoutGeneration === startGeneration
          ? fresh
          : { ...fresh, loadout: getProfile().loadout };
        cache();
      }
      setSyncState("ready");
      // Leaderboard auras are granted by the nightly rollover, long after the
      // match that earned them, so a profile sync is the first time this client
      // can possibly learn about one.
      reconcileUnlocks(profile.unlocks);
    } else {
      setSyncState("offline");
    }
    notify();
    return profile;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Rename. Applied locally only after the server accepts it, because names are
 * unique and rate-limited — an optimistic rename would routinely have to be
 * taken back.
 * @returns {Promise<{ok: boolean, error?: string, retryAt?: number}>}
 */
export async function updateName(name) {
  const res = await apiFetch("/me/name", { method: "PUT", body: { name } });
  if (!res.ok) return { ok: false, error: res.error ?? "offline", retryAt: res.data?.retryAt };
  profile = { ...getProfile(), displayName: res.data.displayName };
  cache();
  notify();
  return { ok: true };
}

/**
 * Equip cosmetics. Applied optimistically — the Profile screen only offers
 * items the player owns, so the server agreeing is the overwhelmingly likely
 * case and the preview should not lag behind the arrow key. A rejection rolls
 * back and resyncs.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function updateLoadout(loadout) {
  const clean = sanitizeCosmetics(loadout);
  const previous = getProfile().loadout;
  loadoutGeneration++;
  profile = { ...getProfile(), loadout: clean };
  cache();
  notify();

  const res = await apiFetch("/me/loadout", { method: "PUT", body: { loadout: clean } });
  if (res.ok) return { ok: true };

  // "offline" is not a rejection — keep the choice and let the next sync settle
  // it. Anything else means the server refused, so put it back.
  if (res.error !== "offline" && res.error !== "not_configured") {
    loadoutGeneration++;
    profile = { ...getProfile(), loadout: previous };
    cache();
    notify();
    return { ok: false, error: res.error };
  }
  return { ok: true };
}

/** Re-read after a match so a freshly unlocked cosmetic appears immediately. */
export function refreshAfterMatch() {
  return syncProfile();
}
