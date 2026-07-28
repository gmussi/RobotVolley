/**
 * Platform identity providers.
 *
 * Every provider is `{ id, async verify(ticket, env) -> { uid } | null }`, and
 * `uid` is whatever that platform calls an account (steamID64, a hashed device
 * secret, later a PSN/XBL/NSA account id). The rest of the server only ever
 * sees `(provider, uid)` pairs, which is what makes adding a platform a new
 * file plus a line here — no schema change, no migration, no backfill.
 *
 * A provider returning null means "this ticket is not valid"; it must never
 * mean "I could not check". Fail closed.
 */
import { deviceProvider } from "./device.js";
import { steamProvider } from "./steam.js";
import { botProvider } from "./bot.js";

export const PROVIDERS = {
  device: deviceProvider,
  steam: steamProvider,
  bot: botProvider,
};

export function getProvider(id) {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, id) ? PROVIDERS[id] : null;
}
