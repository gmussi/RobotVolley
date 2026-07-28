/**
 * Account API client.
 *
 * One hard rule runs through this file: **every call is allowed to fail.** The
 * web build is served from GitHub Pages and must stay playable with no backend
 * reachable at all, so callers get `null`/`{ok:false}` and carry on rather than
 * seeing an exception. Nothing here ever blocks the game loop.
 *
 * Session handling is invisible to callers: the JWT is attached automatically,
 * and a 401 triggers one refresh-and-retry before giving up.
 */
import { getItem, setItem } from "../platform/save.js";
import { getPlatformTicket } from "../platform/identity.js";
import { ENV } from "../platform/env.js";
import { matchmakingUrl, tokenProvider } from "./config.js";

const TOKEN_KEY = "robotvolley_account_token";
const REQUEST_TIMEOUT_MS = 8000;

/** In-memory session; the refresh token is the only part worth persisting. */
let jwt = null;
let loginPromise = null;

/**
 * API origin. Explicit `VITE_API_URL` wins; otherwise it is derived from the
 * matchmaking URL, since both live on the same Worker — that keeps existing
 * deploys working without a new environment variable.
 */
export function apiBase() {
  const explicit = ENV.VITE_API_URL;
  if (explicit) return String(explicit).replace(/\/$/, "");
  const mm = matchmakingUrl();
  if (!mm) return null;
  return String(mm)
    .replace(/^ws:/, "http:")
    .replace(/^wss:/, "https:")
    .replace(/\/ws\/?$/, "");
}

export function isApiConfigured() {
  return !!apiBase();
}

function getRefreshToken() {
  return getItem(TOKEN_KEY, null);
}

function storeSession(data) {
  if (!data) return null;
  jwt = data.jwt ?? null;
  if (data.refreshToken) setItem(TOKEN_KEY, data.refreshToken);
  return data;
}

/** Forget the session — used when the server says our credentials are dead. */
export function clearSession() {
  jwt = null;
  setItem(TOKEN_KEY, "");
}

async function rawFetch(path, { method = "GET", body, token } = {}) {
  const base = apiBase();
  if (!base) return { ok: false, status: 0, error: "not_configured", data: null };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* empty or non-JSON body — status still tells us what happened */
    }
    return { ok: res.ok, status: res.status, error: res.ok ? null : data?.error ?? "http_error", data };
  } catch {
    // Offline, DNS failure, timeout, CORS — all the same to the caller.
    return { ok: false, status: 0, error: "offline", data: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Establish a session: refresh if we hold a token, otherwise log in with this
 * platform's ticket (which creates the account on first run). Concurrent
 * callers share one in-flight attempt so a cold start doesn't create two
 * accounts.
 */
export function login() {
  if (loginPromise) return loginPromise;
  loginPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      const res = await rawFetch("/auth/refresh", { method: "POST", body: { refreshToken } });
      if (res.ok) return storeSession(res.data);
      // A dead token is worth discarding; a network failure is not.
      if (res.status === 401 || res.status === 403) clearSession();
      else return null;
    }

    const { provider, ticket } = await getPlatformTicket();
    const res = await rawFetch("/auth/login", { method: "POST", body: { provider, ticket } });
    return res.ok ? storeSession(res.data) : null;
  })().finally(() => {
    loginPromise = null;
  });
  return loginPromise;
}

/**
 * Authenticated request. Logs in on demand, and retries once through a refresh
 * if the token expired mid-session.
 * @returns {Promise<{ok: boolean, status: number, error: string|null, data: any}>}
 */
export async function apiFetch(path, opts = {}) {
  if (!apiBase()) return { ok: false, status: 0, error: "not_configured", data: null };
  // Always via ensureSessionToken rather than the module's own `jwt`, so a
  // caller that supplied its own credentials (configureNet) is never sent
  // through platform sign-in behind its back.
  let token = await ensureSessionToken();
  if (!token) return { ok: false, status: 0, error: "offline", data: null };

  let res = await rawFetch(path, { ...opts, token });
  if (res.status === 401) {
    jwt = null;
    token = await ensureSessionToken();
    if (!token) return res;
    res = await rawFetch(path, { ...opts, token });
  }
  return res;
}

/** The current session JWT, or null. Used to authenticate the matchmaking socket. */
export function getSessionToken() {
  return jwt;
}

/**
 * Forget the cached JWT without discarding the refresh token — used when a
 * caller outside apiFetch's own 401-retry (e.g. the matchmaking socket) finds
 * out the token it was handed is dead, so the next `ensureSessionToken()`
 * re-authenticates instead of handing back the same rejected value forever.
 */
export function invalidateSessionToken() {
  jwt = null;
}

/** Ensure a session exists, then hand back its token. Null when offline. */
export async function ensureSessionToken() {
  // A caller-supplied provider owns its own credentials end to end — signing in
  // through this module as well would mint a second, unrelated account.
  const provider = tokenProvider();
  if (provider) return provider();
  if (!jwt) await login();
  return jwt;
}
