/**
 * Credentials for one bot.
 *
 * The game signs in through `src/platform/identity.js`, which keeps a device
 * secret in the save file. A bot has no save file and there are many of them on
 * one machine, so each keeps its own credential file instead — which also means
 * a restarted fleet reclaims the *same* accounts rather than littering the
 * database with a fresh set of orphans on every run.
 *
 * The ticket is `<BOT_SECRET>:<label>`; see server/src/auth/providers/bot.js.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CREDENTIALS_DIR = join(HERE, ".credentials");

const REQUEST_TIMEOUT_MS = 15000;

async function readStore(label) {
  try {
    return JSON.parse(await readFile(join(CREDENTIALS_DIR, `${label}.json`), "utf8"));
  } catch {
    return {};
  }
}

async function writeStore(label, data) {
  await mkdir(CREDENTIALS_DIR, { recursive: true });
  await writeFile(join(CREDENTIALS_DIR, `${label}.json`), JSON.stringify(data, null, 2));
}

async function post(apiBase, path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON body — the status still tells us what happened */
    }
    return { ok: res.ok, status: res.status, data, error: data?.error ?? null };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err?.name === "AbortError" ? "timeout" : "offline" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Derive the REST origin from the matchmaking URL, exactly as `src/net/api.js`
 * does — both live on the same Worker.
 */
export function apiBaseFrom(matchmakingUrl, explicit) {
  if (explicit) return String(explicit).replace(/\/$/, "");
  return String(matchmakingUrl)
    .replace(/^ws:/, "http:")
    .replace(/^wss:/, "https:")
    .replace(/\/ws\/?$/, "");
}

/**
 * A `getToken` for `configureNet`. Reuses the cached JWT until it is close to
 * expiring, then refreshes; falls back to a full login if the refresh token is
 * rejected (BOT_SECRET rotated, account deleted).
 *
 * @returns {{ getToken: () => Promise<string|null>, describe: () => object }}
 */
export function createBotAuth({ label, apiBase, botSecret, log = () => {} }) {
  let jwt = null;
  let expiresAt = 0;
  let profile = null;
  let inFlight = null;

  async function establish() {
    const store = await readStore(label);

    if (store.refreshToken) {
      const res = await post(apiBase, "/auth/refresh", { refreshToken: store.refreshToken });
      if (res.ok) return accept(store, res.data);
      // A dead token is worth discarding; a network failure is not.
      if (res.status !== 401 && res.status !== 403) {
        log("auth_retry", { reason: res.error ?? res.status });
        return null;
      }
      log("auth_stale_token", { status: res.status });
    }

    if (!botSecret) {
      log("auth_failed", { reason: "no_bot_secret" });
      return null;
    }
    const res = await post(apiBase, "/auth/login", {
      provider: "bot",
      ticket: `${botSecret}:${label}`,
    });
    if (!res.ok) {
      log("auth_failed", { reason: res.error ?? res.status });
      return null;
    }
    return accept(store, res.data);
  }

  async function accept(store, data) {
    if (!data?.jwt) return null;
    jwt = data.jwt;
    // Refresh a minute early rather than racing the server's clock.
    expiresAt = Date.now() + Math.max(0, (data.expiresIn ?? 3600) - 60) * 1000;
    profile = data.profile ?? null;
    if (data.refreshToken && data.refreshToken !== store.refreshToken) {
      await writeStore(label, { ...store, label, refreshToken: data.refreshToken });
    }
    return jwt;
  }

  return {
    async getToken() {
      if (jwt && Date.now() < expiresAt) return jwt;
      // Concurrent callers share one attempt so a bot never logs in twice.
      inFlight ??= establish().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    describe: () => ({
      accountId: profile?.accountId ?? null,
      displayName: profile?.displayName ?? null,
      stats: profile?.stats ?? null,
    }),
  };
}
