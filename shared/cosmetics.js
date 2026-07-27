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
 * Progress toward an item's unlock, given a stats row.
 * Returns { unlocked, have, need } — `need` is 0 for always-available items.
 */
export function unlockProgress(itemId, stats = {}) {
  const item = getItem(itemId);
  if (!item) return { unlocked: false, have: 0, need: 0 };
  const rule = item.unlock ?? { type: "default" };

  switch (rule.type) {
    case "default":
      return { unlocked: true, have: 0, need: 0 };
    case "wins":
      return { unlocked: (stats.wins ?? 0) >= rule.n, have: stats.wins ?? 0, need: rule.n };
    case "matches":
      return { unlocked: (stats.matches ?? 0) >= rule.n, have: stats.matches ?? 0, need: rule.n };
    // Rank rewards are granted by the leaderboard rollover job, not derived
    // from stats — they are only ever unlocked by an explicit grant.
    case "rank":
      return { unlocked: false, have: 0, need: 0 };
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
    case "rank":
      return `TOP ${rule.top} ${String(rule.board).toUpperCase()}`;
    default:
      return "LOCKED";
  }
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
