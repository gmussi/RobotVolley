/**
 * Cosmetics catalog logic, shared verbatim by the game and the Worker.
 *
 * The client uses this to render the Profile screen (what's unlocked, what the
 * unlock text says, how far along you are). The server uses the exact same code
 * to decide what an account actually owns. One implementation means the greyed
 * -out tile and the rejected equip can never disagree.
 *
 * Cosmetics are purely visual: nothing here feeds physics, and the mid-match
 * lottery that hands out gameplay parts is untouched by any of it.
 */
import catalog from "./cosmetics.json" with { type: "json" };

export const SLOTS = catalog.slots;
export const ITEMS = catalog.items;

/** Slot ids that are actually playable today (others render "COMING SOON"). */
export const ENABLED_SLOTS = SLOTS.filter((s) => s.enabled).map((s) => s.id);

/** Catalog order is browse order, so a slot's list is a stable filter. */
export function itemsForSlot(slotId) {
  return Object.entries(ITEMS)
    .filter(([, item]) => item.slot === slotId)
    .map(([id, item]) => ({ id, ...item }));
}

export function getItem(id) {
  return Object.prototype.hasOwnProperty.call(ITEMS, id) ? ITEMS[id] : null;
}

/** The first item of each enabled slot — what a brand-new account wears. */
export function defaultLoadout() {
  const out = {};
  for (const slotId of ENABLED_SLOTS) {
    const first = itemsForSlot(slotId)[0];
    if (first) out[slotId] = first.id;
  }
  return out;
}

/**
 * Which stats row field backs each counter-style unlock type.
 *
 * Two spellings per entry on purpose: the Worker passes raw D1 rows
 * (snake_case) straight from `getStats`, while the game passes the `/me`
 * payload (camelCase). Accepting both is what lets one implementation stay
 * authoritative on the server and presentational on the client.
 */
const STAT_FIELDS = {
  wins: ["wins"],
  matches: ["matches"],
  streak: ["bestWinStreak", "best_win_streak"],
  perfectWins: ["perfectWins", "perfect_wins"],
  comebacks: ["comebacks"],
};

function statValue(stats, type) {
  for (const field of STAT_FIELDS[type] ?? []) {
    const v = stats?.[field];
    if (typeof v === "number") return v;
  }
  return 0;
}

/**
 * Progress toward an item's unlock, given a stats row.
 * Returns { unlocked, have, need } — `need` is 0 for always-available items.
 *
 * `owned` is an optional Set of ids the account already holds. It exists for
 * `rank` rewards, which cannot be derived from stats at all: pass it on the
 * client so a granted aura reads as unlocked, and omit it on the server so
 * `earnedCosmetics` never auto-grants one.
 */
export function unlockProgress(itemId, stats = {}, owned = null) {
  const item = getItem(itemId);
  if (!item) return { unlocked: false, have: 0, need: 0 };
  const rule = item.unlock ?? { type: "default" };

  switch (rule.type) {
    case "default":
      return { unlocked: true, have: 0, need: 0 };
    case "wins":
    case "matches":
    case "streak":
    case "perfectWins":
    case "comebacks": {
      const have = statValue(stats, rule.type);
      return { unlocked: have >= rule.n, have, need: rule.n };
    }
    // Rank rewards are granted by the leaderboard rollover job, not derived
    // from stats — the only evidence they were earned is the grant itself.
    case "rank":
      return { unlocked: !!owned?.has?.(itemId), have: 0, need: 0 };
    default:
      return { unlocked: false, have: 0, need: 0 };
  }
}

/** Human-readable unlock condition, shown under a locked tile. */
export function unlockLabel(itemId) {
  const item = getItem(itemId);
  const rule = item?.unlock ?? { type: "default" };
  switch (rule.type) {
    case "default":
      return "";
    case "wins":
      return rule.n === 1 ? "WIN 1 MATCH" : `WIN ${rule.n} MATCHES`;
    case "matches":
      return `PLAY ${rule.n} MATCHES`;
    case "streak":
      return `WIN ${rule.n} MATCHES IN A ROW`;
    case "perfectWins":
      return `WIN ${rule.n === 1 ? "A MATCH" : `${rule.n} MATCHES`} 5-0`;
    case "comebacks":
      return "WIN FROM 0-4 DOWN";
    case "rank":
      return `REACH TOP ${rule.top} IN ${String(rule.board).toUpperCase()} LEADERBOARD ONCE`;
    default:
      return "LOCKED";
  }
}

/**
 * Of several cosmetics unlocked at once, the one worth showing.
 *
 * A rank rollover grants every tier at or below your placement, so finishing
 * first hands over three auras in one go — the reveal screen shows only the
 * best of them. Items with no `reveal` rank are never revealed at all.
 */
export function pickReveal(ids) {
  let best = null;
  let bestRank = -Infinity;
  for (const id of ids ?? []) {
    const rank = getItem(id)?.reveal;
    if (typeof rank !== "number") continue;
    if (rank > bestRank) {
      bestRank = rank;
      best = id;
    }
  }
  return best;
}

/**
 * Every cosmetic a stats row earns. Rank rewards are excluded by design (see
 * unlockProgress) — the rollover job grants those directly.
 */
export function earnedCosmetics(stats) {
  return Object.keys(ITEMS).filter((id) => unlockProgress(id, stats).unlocked);
}

/**
 * Drop anything that isn't a real item in its claimed slot, and fill missing
 * enabled slots with the default. Applied to the *remote* peer's loadout as
 * well as our own, so a modified client cannot make us render arbitrary values.
 */
export function sanitizeCosmetics(loadout) {
  const out = defaultLoadout();
  if (!loadout || typeof loadout !== "object") return out;
  for (const slotId of ENABLED_SLOTS) {
    const id = loadout[slotId];
    if (typeof id === "string" && getItem(id)?.slot === slotId) out[slotId] = id;
  }
  return out;
}

/** The sprite variant name a slot's equipped cosmetic maps to. */
export function spriteFor(loadout, slotId) {
  const id = loadout?.[slotId];
  return getItem(id)?.sprite ?? itemsForSlot(slotId)[0]?.sprite ?? null;
}
