/**
 * Authentication routes.
 *
 * Login exchanges a *platform* ticket (device secret, Steam session ticket, …)
 * for a short-lived session JWT plus a long-lived refresh token. Everything
 * downstream — the REST API and the matchmaking WebSocket — only ever sees the
 * JWT, so none of it knows or cares which platform the player came from.
 */
import { getProvider } from "../auth/providers/index.js";
import { signJwt, signOpaque, verifyOpaque, JWT_TTL_SECONDS } from "../auth/jwt.js";
import {
  findOrCreateAccount, getAccount, getProfile,
  createLinkCode, linkIdentity, redeemLinkCode,
} from "../db.js";
import { json, fail, readJson, requireAuth } from "./http.js";

async function issueSession(env, account) {
  const jwt = await signJwt({ sub: account.id }, env.JWT_SIGNING_KEY);
  const refreshToken = await signOpaque(account.id, env.DEVICE_SIGNING_KEY);
  return { jwt, refreshToken, expiresIn: JWT_TTL_SECONDS };
}

function missingSecrets(env) {
  return !env.JWT_SIGNING_KEY || !env.DEVICE_SIGNING_KEY;
}

/** POST /auth/login { provider, ticket } */
export async function handleLogin(request, env) {
  if (missingSecrets(env)) return fail(request, "server_misconfigured", 500);

  const body = await readJson(request);
  const provider = getProvider(body?.provider);
  if (!provider) return fail(request, "unknown_provider");

  const identity = await provider.verify(body.ticket, env);
  if (!identity?.uid) return fail(request, "invalid_ticket", 401);

  const account = await findOrCreateAccount(
    env.DB,
    provider.id,
    identity.uid,
    identity.suggestedName,
  );
  if (account.banned) return fail(request, "banned", 403);

  const session = await issueSession(env, account);
  return json(request, { ...session, profile: await getProfile(env.DB, account.id) });
}

/**
 * POST /auth/link { provider, ticket } — attach another platform to this
 * account, so the same progression follows the player across stores.
 */
export async function handleLink(request, env) {
  const [accountId, denied] = await requireAuth(request, env);
  if (denied) return denied;

  const body = await readJson(request);
  const provider = getProvider(body?.provider);
  if (!provider) return fail(request, "unknown_provider");

  const identity = await provider.verify(body.ticket, env);
  if (!identity?.uid) return fail(request, "invalid_ticket", 401);

  const result = await linkIdentity(env.DB, accountId, provider.id, identity.uid);
  if (!result.ok) return fail(request, result.error, 409);
  return json(request, { linked: true, provider: provider.id });
}

/** POST /auth/link-code — mint a transfer code to type on another device. */
export async function handleLinkCode(request, env) {
  const [accountId, denied] = await requireAuth(request, env);
  if (denied) return denied;
  return json(request, await createLinkCode(env.DB, accountId));
}

/**
 * POST /auth/redeem-link-code { code, provider, ticket }
 *
 * Deliberately unauthenticated: the whole point is that the new device has no
 * session on the target account yet. The code is the credential.
 */
export async function handleRedeemLinkCode(request, env) {
  if (missingSecrets(env)) return fail(request, "server_misconfigured", 500);

  const body = await readJson(request);
  const provider = getProvider(body?.provider);
  if (!provider) return fail(request, "unknown_provider");

  const identity = await provider.verify(body.ticket, env);
  if (!identity?.uid) return fail(request, "invalid_ticket", 401);

  const result = await redeemLinkCode(env.DB, body.code, provider.id, identity.uid);
  if (!result.ok) {
    return fail(request, result.error, result.error === "identity_already_linked" ? 409 : 400);
  }

  const account = await getAccount(env.DB, result.accountId);
  if (account.banned) return fail(request, "banned", 403);
  const session = await issueSession(env, account);
  return json(request, { ...session, profile: await getProfile(env.DB, account.id) });
}

/** POST /auth/refresh { refreshToken } */
export async function handleRefresh(request, env) {
  if (missingSecrets(env)) return fail(request, "server_misconfigured", 500);

  const body = await readJson(request);
  const accountId = await verifyOpaque(body?.refreshToken, env.DEVICE_SIGNING_KEY);
  if (!accountId) return fail(request, "invalid_refresh_token", 401);

  const account = await getAccount(env.DB, accountId);
  if (!account) return fail(request, "invalid_refresh_token", 401);
  if (account.banned) return fail(request, "banned", 403);

  const session = await issueSession(env, account);
  return json(request, { ...session, profile: await getProfile(env.DB, account.id) });
}
