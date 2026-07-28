/**
 * Runtime overrides for the network layer.
 *
 * The game reads everything from build-time env and signs in through
 * `platform/identity.js` (Steam ticket or a device secret in the save file).
 * Headless clients — the matchmaking bots in `tools/bot/` — need neither: they
 * carry their own credentials and are pointed at a server from the command line.
 *
 * Rather than fork the netcode for them, they set these overrides before
 * connecting. Every getter falls back to exactly what shipped before, so with
 * nothing configured the browser behaves identically.
 */
import { ENV } from "../platform/env.js";

let overrides = {};

/**
 * @param {{matchmakingUrl?: string, iceServers?: RTCIceServer[],
 *          getToken?: () => Promise<string|null>}} next
 */
export function configureNet(next = {}) {
  overrides = { ...overrides, ...next };
}

export function matchmakingUrl() {
  return overrides.matchmakingUrl || ENV.VITE_MATCHMAKING_URL || "";
}

/**
 * STUN alone can't traverse symmetric NAT / restrictive firewalls, which is
 * common on Steam's broad player base. A TURN relay is optional and configured
 * the same way as VITE_MATCHMAKING_URL: unset by default (STUN-only, unchanged
 * behavior), or provided at build time. VITE_TURN_URL accepts a comma-separated
 * list of URLs (e.g. a UDP and a TCP/TLS fallback) sharing one credential pair.
 */
export function iceServers() {
  if (overrides.iceServers) return overrides.iceServers;

  const servers = [{ urls: "stun:stun.l.google.com:19302" }];
  const turnUrl = ENV.VITE_TURN_URL;
  if (turnUrl) {
    const urls = String(turnUrl)
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length) {
      servers.push({
        urls,
        username: ENV.VITE_TURN_USERNAME || undefined,
        credential: ENV.VITE_TURN_CREDENTIAL || undefined,
      });
    }
  }
  return servers;
}

/**
 * A caller-supplied source of session tokens, or null to use the account API's
 * own sign-in (`ensureSessionToken`).
 * @returns {(() => Promise<string|null>)|null}
 */
export function tokenProvider() {
  return overrides.getToken || null;
}
