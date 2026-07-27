/**
 * Which platform identity this build logs in with — the client half of the
 * multiplatform account model.
 *
 * Mirrors the `host.js` shim: game code asks for "a ticket" and never learns
 * which platform produced it. Adding PlayStation/Xbox/Nintendo later means one
 * more branch in `getPlatformTicket()` and a matching verifier on the server;
 * no caller changes.
 *
 * Steam is preferred when it is actually running, because a Steam identity is
 * recoverable (reinstall, new PC) while the device identity is not. The device
 * secret is still generated and kept either way, so a player who launches
 * without Steam once does not silently start a second account.
 */
import { getSteamStatus, getSteamAuthTicket } from "./host.js";
import { getItem, setItem } from "./save.js";

const DEVICE_SECRET_KEY = "robotvolley_device_secret";
/** 32 bytes of hex — comfortably above the server's minimum. */
const DEVICE_SECRET_BYTES = 32;

function randomHex(bytes) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The anonymous device secret, created once and then never changed. This is the
 * only thing standing between a player and a lost account on the web build, so
 * it is written before it is first used, not after.
 */
export function getDeviceSecret() {
  let secret = getItem(DEVICE_SECRET_KEY, null);
  if (!secret || secret.length < DEVICE_SECRET_BYTES) {
    secret = randomHex(DEVICE_SECRET_BYTES);
    setItem(DEVICE_SECRET_KEY, secret);
  }
  return secret;
}

/**
 * Best available login credential for this platform.
 * @returns {Promise<{provider: string, ticket: string}>}
 */
export async function getPlatformTicket() {
  const steam = await getSteamStatus();
  if (steam.available) {
    const ticket = await getSteamAuthTicket();
    if (ticket) return { provider: "steam", ticket };
    // Steam is running but wouldn't issue a ticket (offline mode, family
    // sharing, a transient failure). Fall through rather than block the player.
  }
  return { provider: "device", ticket: getDeviceSecret() };
}
