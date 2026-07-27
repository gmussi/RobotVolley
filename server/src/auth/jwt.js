/**
 * Minimal HS256 JWT + HMAC helpers built on WebCrypto.
 *
 * Two token kinds share this module:
 *   - session JWTs (short-lived, sent on every API call and on the matchmaking
 *     WebSocket), signed with JWT_SIGNING_KEY;
 *   - device refresh tokens (long-lived, the anonymous provider's only secret),
 *     signed with DEVICE_SIGNING_KEY.
 *
 * Keeping the two keys separate means leaking one never mints the other.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Session JWT lifetime. Short — the client refreshes transparently. */
export const JWT_TTL_SECONDS = 3600;

function b64urlEncode(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Constant-time-ish comparison. WebCrypto's verify does the real work. */
async function hmacSign(secret, data) {
  const key = await hmacKey(secret);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

async function hmacVerify(secret, data, signature) {
  const key = await hmacKey(secret);
  return crypto.subtle.verify("HMAC", key, signature, enc.encode(data));
}

/** Sign an arbitrary payload as an HS256 JWT. `ttlSeconds` sets `exp`. */
export async function signJwt(payload, secret, ttlSeconds = JWT_TTL_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const header = b64urlEncode(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const claims = b64urlEncode(enc.encode(JSON.stringify(body)));
  const data = `${header}.${claims}`;
  const sig = await hmacSign(secret, data);
  return `${data}.${b64urlEncode(sig)}`;
}

/**
 * Verify an HS256 JWT and return its payload, or null if the token is
 * malformed, wrongly signed, or expired. Never throws — callers treat null as
 * "not authenticated".
 */
export async function verifyJwt(token, secret) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, claims, sig] = parts;
  try {
    const ok = await hmacVerify(secret, `${header}.${claims}`, b64urlDecode(sig));
    if (!ok) return null;
    const payload = JSON.parse(dec.decode(b64urlDecode(claims)));
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Sign a value into a `<value>.<sig>` opaque token. Used for device refresh
 * tokens, which carry no expiry — losing the device secret is the only way to
 * lose an anonymous account, so we do not add a clock to that failure mode.
 */
export async function signOpaque(value, secret) {
  const sig = await hmacSign(secret, value);
  return `${b64urlEncode(enc.encode(value))}.${b64urlEncode(sig)}`;
}

/** Verify a token from signOpaque and return the original value, or null. */
export async function verifyOpaque(token, secret) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  try {
    const value = dec.decode(b64urlDecode(parts[0]));
    const ok = await hmacVerify(secret, value, b64urlDecode(parts[1]));
    return ok ? value : null;
  } catch {
    return null;
  }
}
