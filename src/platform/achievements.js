/**
 * Achievements — logical game achievements mapped to Steam API names.
 *
 * A local record (persisted via the save layer) gates duplicate work and lets
 * the web build track progress too; when running on Steam, unlocking also fires
 * the real Steam achievement. Idempotent: unlocking an already-unlocked
 * achievement is a no-op.
 *
 * NOTE: the Steam IDs below map to Valve's "Spacewar" (App 480) test achievements
 * so `activate()` actually succeeds during local testing. Replace the right-hand
 * values with this game's real achievement IDs once the Steam app is created.
 */
import { unlockSteamAchievement } from "./host.js";
import { getItem, setItem } from "./save.js";

/** logical key → Steam achievement API name (Spacewar placeholders for testing). */
export const STEAM_IDS = {
  FIRST_WIN: "ACH_WIN_ONE_GAME",
  FLAWLESS: "ACH_WIN_100_GAMES",
  ONLINE_WIN: "ACH_TRAVEL_FAR_ACCUM",
  CUSTOMIZE: "ACH_TRAVEL_FAR_SINGLE",
};

const RECORD_KEY = "robotvolley_achievements";
let unlocked = null;

function record() {
  if (unlocked) return unlocked;
  try {
    unlocked = new Set(JSON.parse(getItem(RECORD_KEY) || "[]"));
  } catch {
    unlocked = new Set();
  }
  return unlocked;
}

/** Unlock a logical achievement (idempotent). Persists locally + fires on Steam. */
export function unlock(key) {
  if (!(key in STEAM_IDS)) return;
  const set = record();
  if (set.has(key)) return;
  set.add(key);
  setItem(RECORD_KEY, JSON.stringify([...set]));
  unlockSteamAchievement(STEAM_IDS[key]);
}

export function isUnlocked(key) {
  return record().has(key);
}

/**
 * Evaluate match-end achievements.
 * @param {{ mode: string, winner: number, scores: number[], localSeat: number }} result
 */
export function onMatchEnd({ mode, winner, scores, localSeat }) {
  if (winner == null) return;
  const localWon =
    mode === "online" ? winner === localSeat
      : mode === "1p" ? winner === 0 // human is P1 vs CPU
        : true; // 2p local: a human always wins

  if (localWon) {
    unlock("FIRST_WIN");
    const loser = winner === 0 ? 1 : 0;
    if (scores && scores[winner] >= 5 && scores[loser] === 0) unlock("FLAWLESS");
    if (mode === "online") unlock("ONLINE_WIN");
  }
}

/** Unlock the customization achievement (call when a robot part is changed). */
export function onCustomize() {
  unlock("CUSTOMIZE");
}
