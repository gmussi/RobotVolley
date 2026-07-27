/**
 * D1 data access. Every function here takes the `DB` binding first and returns
 * plain objects — no ORM, no caching, no hidden state.
 *
 * The one invariant worth stating: an account's unlock set is *derived* from
 * its stats (see shared/cosmetics.js) and re-synced whenever stats change, so
 * the client can never talk us into granting something. `rank`-type rewards are
 * the exception and are granted explicitly by the leaderboard rollover.
 */
import { earnedCosmetics, defaultLoadout, sanitizeCosmetics, getItem } from "../../shared/cosmetics.js";
import { NAME_MAX, RENAME_COOLDOWN_MS, validateName } from "../../shared/nameRules.js";

export { RENAME_COOLDOWN_MS };

const now = () => Date.now();

function newId() {
  return crypto.randomUUID();
}

/** Placeholder name so the home screen always has something to draw. */
function suggestName() {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return `ROBOT-${(n[0] % 9000) + 1000}`;
}

export async function findAccountByIdentity(db, provider, uid) {
  const row = await db
    .prepare(
      `SELECT a.* FROM accounts a
       JOIN identities i ON i.account_id = a.id
       WHERE i.provider = ? AND i.provider_uid = ?`,
    )
    .bind(provider, uid)
    .first();
  return row ?? null;
}

export async function getAccount(db, accountId) {
  return (await db.prepare(`SELECT * FROM accounts WHERE id = ?`).bind(accountId).first()) ?? null;
}

/**
 * Create an account and bind the given identity to it. Retries the generated
 * name on collision, then gives up and appends part of the account id — a
 * player can always rename, so a slightly ugly placeholder beats a failed login.
 */
export async function createAccount(db, provider, uid, suggested) {
  const id = newId();
  const ts = now();

  let name = null;
  const candidates = [suggested, ...Array.from({ length: 4 }, suggestName)].filter(Boolean);
  for (const candidate of candidates) {
    const clean = String(candidate).slice(0, NAME_MAX);
    const taken = await db
      .prepare(`SELECT 1 FROM accounts WHERE name_lower = ?`)
      .bind(clean.toLowerCase())
      .first();
    if (!taken) {
      name = clean;
      break;
    }
  }
  if (!name) name = `ROBOT-${id.slice(0, 6)}`;

  await db.batch([
    db
      .prepare(
        `INSERT INTO accounts (id, display_name, name_lower, created_at) VALUES (?, ?, ?, ?)`,
      )
      .bind(id, name, name.toLowerCase(), ts),
    db
      .prepare(
        `INSERT INTO identities (provider, provider_uid, account_id, linked_at) VALUES (?, ?, ?, ?)`,
      )
      .bind(provider, uid, id, ts),
    db.prepare(`INSERT INTO stats (account_id, updated_at) VALUES (?, ?)`).bind(id, ts),
    db
      .prepare(`INSERT INTO account_loadout (account_id, json, updated_at) VALUES (?, ?, ?)`)
      .bind(id, JSON.stringify(defaultLoadout()), ts),
  ]);

  await syncUnlocks(db, id, { wins: 0, losses: 0, matches: 0 });
  return await getAccount(db, id);
}

export async function findOrCreateAccount(db, provider, uid, suggested) {
  return (await findAccountByIdentity(db, provider, uid)) ?? (await createAccount(db, provider, uid, suggested));
}

export async function getStats(db, accountId) {
  const row = await db.prepare(`SELECT * FROM stats WHERE account_id = ?`).bind(accountId).first();
  return row ?? { account_id: accountId, wins: 0, losses: 0, matches: 0, elo: 1200, updated_at: 0 };
}

export async function getUnlocks(db, accountId) {
  const res = await db
    .prepare(`SELECT cosmetic_id FROM account_unlocks WHERE account_id = ?`)
    .bind(accountId)
    .all();
  return (res.results ?? []).map((r) => r.cosmetic_id);
}

/**
 * Insert any cosmetics the current stats have earned. Idempotent — existing
 * rows are ignored, and nothing is ever revoked (a rollback of stats must not
 * take a cosmetic away from someone who already saw it unlock).
 */
export async function syncUnlocks(db, accountId, stats) {
  const earned = earnedCosmetics(stats);
  if (!earned.length) return;
  const ts = now();
  await db.batch(
    earned.map((cosmeticId) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO account_unlocks (account_id, cosmetic_id, unlocked_at)
           VALUES (?, ?, ?)`,
        )
        .bind(accountId, cosmeticId, ts),
    ),
  );
}

/** Explicit grant, used by leaderboard rollover for `rank`-type rewards. */
export async function grantUnlock(db, accountId, cosmeticId) {
  if (!getItem(cosmeticId)) return false;
  await db
    .prepare(
      `INSERT OR IGNORE INTO account_unlocks (account_id, cosmetic_id, unlocked_at) VALUES (?, ?, ?)`,
    )
    .bind(accountId, cosmeticId, now())
    .run();
  return true;
}

export async function getLoadout(db, accountId) {
  const row = await db
    .prepare(`SELECT json FROM account_loadout WHERE account_id = ?`)
    .bind(accountId)
    .first();
  if (!row) return defaultLoadout();
  try {
    return sanitizeCosmetics(JSON.parse(row.json));
  } catch {
    return defaultLoadout();
  }
}

/**
 * Persist a loadout, rejecting any item the account has not unlocked. This is
 * the authoritative check — the client's greyed-out tile is only presentation.
 */
export async function setLoadout(db, accountId, loadout) {
  const clean = sanitizeCosmetics(loadout);
  const owned = new Set(await getUnlocks(db, accountId));
  for (const id of Object.values(clean)) {
    if (!owned.has(id)) return { ok: false, error: "locked_cosmetic", cosmeticId: id };
  }
  await db
    .prepare(
      `INSERT INTO account_loadout (account_id, json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(account_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
    )
    .bind(accountId, JSON.stringify(clean), now())
    .run();
  return { ok: true, loadout: clean };
}

export async function setDisplayName(db, accountId, name) {
  const err = validateName(name);
  if (err) return { ok: false, error: err };
  const trimmed = name.trim();

  const account = await getAccount(db, accountId);
  if (!account) return { ok: false, error: "no_account" };

  // A rename to the same name is a no-op rather than a cooldown violation.
  if (account.name_lower === trimmed.toLowerCase()) {
    return { ok: true, displayName: account.display_name };
  }
  if (account.name_changed_at && now() - account.name_changed_at < RENAME_COOLDOWN_MS) {
    return {
      ok: false,
      error: "rename_cooldown",
      retryAt: account.name_changed_at + RENAME_COOLDOWN_MS,
    };
  }

  const taken = await db
    .prepare(`SELECT 1 FROM accounts WHERE name_lower = ? AND id != ?`)
    .bind(trimmed.toLowerCase(), accountId)
    .first();
  if (taken) return { ok: false, error: "name_taken" };

  await db
    .prepare(`UPDATE accounts SET display_name = ?, name_lower = ?, name_changed_at = ? WHERE id = ?`)
    .bind(trimmed, trimmed.toLowerCase(), now(), accountId)
    .run();
  return { ok: true, displayName: trimmed };
}

// ------------------------------------------------------- cross-device linking

/** Ambiguous glyphs are excluded — these codes get read aloud and retyped. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const CODE_TTL_MS = 10 * 60 * 1000;

function randomCode() {
  const buf = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** Mint a short-lived code that another device can redeem to join this account. */
export async function createLinkCode(db, accountId) {
  const code = randomCode();
  const expiresAt = now() + CODE_TTL_MS;
  await db
    .prepare(`INSERT INTO link_codes (code, account_id, expires_at) VALUES (?, ?, ?)`)
    .bind(code, accountId, expiresAt)
    .run();
  return { code, expiresAt };
}

/**
 * Attach a platform identity to an existing account.
 *
 * The conflict case matters: if this identity already belongs to a *different*
 * account we refuse rather than merge. Merging two progression histories is
 * genuinely ambiguous (whose wins? whose name?), and silently picking one would
 * destroy the other. The client offers the player the choice instead.
 */
export async function linkIdentity(db, accountId, provider, uid) {
  const existing = await db
    .prepare(`SELECT account_id FROM identities WHERE provider = ? AND provider_uid = ?`)
    .bind(provider, uid)
    .first();

  if (existing) {
    if (existing.account_id === accountId) return { ok: true, alreadyLinked: true };
    return { ok: false, error: "identity_already_linked", otherAccountId: existing.account_id };
  }

  await db
    .prepare(
      `INSERT INTO identities (provider, provider_uid, account_id, linked_at) VALUES (?, ?, ?, ?)`,
    )
    .bind(provider, uid, accountId, now())
    .run();
  return { ok: true };
}

/** Redeem a link code: this device's identity joins the code's account. */
export async function redeemLinkCode(db, code, provider, uid) {
  const row = await db
    .prepare(`SELECT account_id, expires_at FROM link_codes WHERE code = ?`)
    .bind(String(code ?? "").toUpperCase())
    .first();
  if (!row) return { ok: false, error: "bad_code" };
  if (row.expires_at < now()) {
    await db.prepare(`DELETE FROM link_codes WHERE code = ?`).bind(code).run();
    return { ok: false, error: "expired_code" };
  }

  const linked = await linkIdentity(db, row.account_id, provider, uid);
  if (!linked.ok) return linked;

  // Single use — a code that has been spent must not be replayable.
  await db.prepare(`DELETE FROM link_codes WHERE code = ?`).bind(String(code).toUpperCase()).run();
  return { ok: true, accountId: row.account_id };
}

/** The full client-facing profile: one round trip populates the whole UI. */
export async function getProfile(db, accountId) {
  const account = await getAccount(db, accountId);
  if (!account) return null;
  const [stats, unlocks, loadout] = await Promise.all([
    getStats(db, accountId),
    getUnlocks(db, accountId),
    getLoadout(db, accountId),
  ]);
  return {
    accountId: account.id,
    displayName: account.display_name,
    nameChangedAt: account.name_changed_at ?? null,
    renameCooldownMs: RENAME_COOLDOWN_MS,
    stats: {
      wins: stats.wins,
      losses: stats.losses,
      matches: stats.matches,
      elo: stats.elo,
    },
    unlocks,
    loadout,
    updatedAt: Math.max(stats.updated_at ?? 0, account.name_changed_at ?? 0, account.created_at),
  };
}
