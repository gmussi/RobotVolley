/**
 * Steamworks integration — lives entirely in the main process.
 *
 * Design rule: **Steam is optional.** The game must boot and play whether or not
 * the Steam client is running (dev, direct-launch, or the web build). Every entry
 * point is wrapped so a missing/unavailable Steam never throws into the app.
 *
 * `steamworks.init()` reads the app id from `steam_appid.txt` in the working
 * directory (we ship `480` — Valve's public "Spacewar" test app — for local
 * testing), or from `STEAM_APP_ID`. Swap in the real app id at publish time.
 */
let client = null;
let available = false;
let initTried = false;

/**
 * Attempt to initialize Steam. Safe to call once, early, before app "ready"
 * (the overlay appends command-line switches that must precede GPU init).
 * @returns {boolean} whether Steam is available this session.
 */
function tryInit() {
  if (initTried) return available;
  initTried = true;
  try {
    const steamworks = require("steamworks.js");
    const envId = process.env.STEAM_APP_ID ? Number(process.env.STEAM_APP_ID) : undefined;
    // With no arg, steamworks reads steam_appid.txt from cwd.
    client = envId ? steamworks.init(envId) : steamworks.init();
    available = true;
    // Overlay needs command-line switches set before the window's GPU comes up.
    try {
      steamworks.electronEnableSteamOverlay();
    } catch (err) {
      console.warn("[steam] overlay enable failed:", err?.message ?? err);
    }
    console.log("[steam] initialized; player:", safePlayerName());
  } catch (err) {
    available = false;
    client = null;
    console.log("[steam] not available (running without Steam):", err?.message ?? err);
  }
  return available;
}

function isAvailable() {
  return available;
}

function safePlayerName() {
  try {
    return client?.localplayer?.getName?.() ?? null;
  } catch {
    return null;
  }
}

function getPlayer() {
  if (!available) return null;
  try {
    return {
      name: client.localplayer.getName(),
      steamId: client.localplayer.getSteamId().steamId64.toString(),
    };
  } catch {
    return null;
  }
}

/**
 * Mint a session ticket proving this Steam user owns the app, as a hex string.
 *
 * Only the Steamworks Web API can tell our server whether a ticket is genuine,
 * so this is just the "please issue one" half — verification happens in
 * server/src/auth/providers/steam.js. Returns null whenever Steam is absent, so
 * the caller falls back to the anonymous device identity.
 */
async function getAuthTicket() {
  if (!available) return null;
  try {
    const ticket = await client.auth.getSessionTicket();
    const bytes = ticket.getBytes();
    return Buffer.from(bytes).toString("hex");
  } catch (err) {
    console.warn("[steam] auth ticket failed:", err?.message ?? err);
    return null;
  }
}

/** Unlock (activate) an achievement by its Steam API name. Returns success. */
function unlockAchievement(apiName) {
  if (!available || !apiName) return false;
  try {
    return !!client.achievement.activate(apiName);
  } catch (err) {
    console.warn("[steam] activate failed:", apiName, err?.message ?? err);
    return false;
  }
}

function isAchievementUnlocked(apiName) {
  if (!available || !apiName) return false;
  try {
    return !!client.achievement.isActivated(apiName);
  } catch {
    return false;
  }
}

/** Clear an achievement — for development/testing only. */
function clearAchievement(apiName) {
  if (!available || !apiName) return false;
  try {
    return !!client.achievement.clear(apiName);
  } catch {
    return false;
  }
}

module.exports = {
  tryInit,
  isAvailable,
  getPlayer,
  getAuthTicket,
  unlockAchievement,
  isAchievementUnlocked,
  clearAchievement,
};
