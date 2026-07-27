/**
 * Profile routes — everything the home screen and Profile view need.
 *
 * GET /me is deliberately one round trip returning name, stats, unlocks and
 * loadout together: the client renders from its cache immediately and swaps in
 * this response when it lands, so a slow network shows a stale robot rather
 * than a spinner.
 */
import { getProfile, setLoadout, setDisplayName } from "../db.js";
import { json, fail, readJson, requireAuth } from "./http.js";

/** GET /me */
export async function handleGetMe(request, env) {
  const [accountId, denied] = await requireAuth(request, env);
  if (denied) return denied;

  const profile = await getProfile(env.DB, accountId);
  if (!profile) return fail(request, "no_account", 404);
  return json(request, profile);
}

/** PUT /me/loadout { loadout: { torso: "torso_plated", ... } } */
export async function handlePutLoadout(request, env) {
  const [accountId, denied] = await requireAuth(request, env);
  if (denied) return denied;

  const body = await readJson(request);
  const result = await setLoadout(env.DB, accountId, body?.loadout);
  if (!result.ok) return fail(request, result.error, 403, { cosmeticId: result.cosmeticId });
  return json(request, { loadout: result.loadout });
}

/** PUT /me/name { name: "Clanker" } */
export async function handlePutName(request, env) {
  const [accountId, denied] = await requireAuth(request, env);
  if (denied) return denied;

  const body = await readJson(request);
  const result = await setDisplayName(env.DB, accountId, body?.name);
  if (!result.ok) {
    const status = result.error === "name_taken" || result.error === "rename_cooldown" ? 409 : 400;
    return fail(request, result.error, status, { retryAt: result.retryAt });
  }
  return json(request, { displayName: result.displayName });
}
