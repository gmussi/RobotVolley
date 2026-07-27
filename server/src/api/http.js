/**
 * Small HTTP helpers shared by the API routes: JSON responses, CORS, body
 * parsing, and turning an `Authorization: Bearer` header into an account id.
 */
import { verifyJwt } from "../auth/jwt.js";

export function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export function json(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(request) },
  });
}

export function fail(request, error, status = 400, extra = {}) {
  return json(request, { error, ...extra }, status);
}

/** Parse a JSON body, returning null rather than throwing on malformed input. */
export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * Resolve the caller's account id from the bearer token, or null. Routes decide
 * for themselves whether null is fatal — some endpoints are public.
 */
export async function authenticate(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token || !env.JWT_SIGNING_KEY) return null;
  const payload = await verifyJwt(token, env.JWT_SIGNING_KEY);
  return payload?.sub ?? null;
}

/** Guard for routes that require a login; returns [accountId, null] or [null, Response]. */
export async function requireAuth(request, env) {
  const accountId = await authenticate(request, env);
  if (!accountId) return [null, fail(request, "unauthenticated", 401)];
  return [accountId, null];
}
