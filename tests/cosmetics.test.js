import { describe, it, expect } from "vitest";
import {
  SLOTS,
  ENABLED_SLOTS,
  ITEMS,
  itemsForSlot,
  getItem,
  defaultLoadout,
  unlockProgress,
  unlockLabel,
  earnedCosmetics,
  sanitizeCosmetics,
  spriteFor,
  pickReveal,
} from "../src/data/cosmetics.js";

const stats = (over = {}) => ({ wins: 0, matches: 0, losses: 0, ...over });
/** What a brand-new account wears, spread into an expectation. */
const DEFAULTS = { torso: "torso_standard", decal: "decal_plain", aura: "aura_none" };

describe("cosmetics catalog", () => {
  it("exposes torso, decals and auras, with special still to come", () => {
    expect(ENABLED_SLOTS).toEqual(["torso", "decal", "aura"]);
  });

  it("lists five torsos in browse order, standard first", () => {
    const torsos = itemsForSlot("torso");
    expect(torsos).toHaveLength(5);
    expect(torsos[0].id).toBe("torso_standard");
  });

  it("dresses a new account in the first item of each enabled slot", () => {
    expect(defaultLoadout()).toEqual(DEFAULTS);
  });

  it("starts every enabled slot with a free item", () => {
    // defaultLoadout() takes each slot's first entry, and setLoadout trusts a
    // `default` rule instead of the unlock table. A slot whose first item were
    // gated would hand new accounts a loadout they do not own.
    for (const slotId of ENABLED_SLOTS) {
      const first = itemsForSlot(slotId)[0];
      expect(first, `${slotId} has no items`).toBeTruthy();
      expect(first.unlock?.type, `${slotId} first item`).toBe("default");
    }
  });

  it("declares every item against a real slot", () => {
    const slotIds = new Set(SLOTS.map((s) => s.id));
    for (const [id, item] of Object.entries(ITEMS)) {
      expect(slotIds.has(item.slot), `${id} claims slot ${item.slot}`).toBe(true);
    }
  });

  it("gives every item a render token", () => {
    for (const [id, item] of Object.entries(ITEMS)) {
      expect(typeof item.sprite, `${id} sprite`).toBe("string");
    }
  });
});

describe("unlock rules", () => {
  it("gives the standard torso away for free", () => {
    expect(unlockProgress("torso_standard", stats()).unlocked).toBe(true);
  });

  it("gates the four new torsos at 3, 5, 10 and 50 wins", () => {
    const gates = [
      ["torso_plated", 3],
      ["torso_vented", 5],
      ["torso_reactor", 10],
      ["torso_chrome", 50],
    ];
    for (const [id, need] of gates) {
      const below = stats({ wins: need - 1 });
      const at = stats({ wins: need });
      expect(unlockProgress(id, below).unlocked, `${id} at ${need - 1} wins`).toBe(false);
      expect(unlockProgress(id, at).unlocked, `${id} at ${need} wins`).toBe(true);
      expect(unlockProgress(id, at).need).toBe(need);
    }
  });

  it("reports progress so the UI can show 2 / 5", () => {
    const p = unlockProgress("torso_vented", stats({ wins: 2 }));
    expect(p).toEqual({ unlocked: false, have: 2, need: 5 });
  });

  it("gates the century decal on matches played, not wins", () => {
    expect(unlockProgress("decal_century", stats({ wins: 99, matches: 99 })).unlocked).toBe(false);
    expect(unlockProgress("decal_century", stats({ matches: 100 })).unlocked).toBe(true);
  });

  it("gates the streak decal on the best run, not the current one", () => {
    // A streak decal must survive the loss that ended the run which earned it,
    // because unlocks are never revoked.
    expect(unlockProgress("decal_streak", stats({ winStreak: 5 })).unlocked).toBe(false);
    expect(unlockProgress("decal_streak", stats({ bestWinStreak: 4 })).unlocked).toBe(false);
    expect(unlockProgress("decal_streak", stats({ bestWinStreak: 5 })).unlocked).toBe(true);
  });

  it("gates the shutout and comeback decals on one occurrence each", () => {
    expect(unlockProgress("decal_shutout", stats({ perfectWins: 0 })).unlocked).toBe(false);
    expect(unlockProgress("decal_shutout", stats({ perfectWins: 1 })).unlocked).toBe(true);
    expect(unlockProgress("decal_comeback", stats({ comebacks: 0 })).unlocked).toBe(false);
    expect(unlockProgress("decal_comeback", stats({ comebacks: 1 })).unlocked).toBe(true);
  });

  it("reads snake_case stats rows as well as camelCase payloads", () => {
    // The Worker passes a raw D1 row straight in; the game passes the /me
    // payload. Both have to work or the server and client disagree.
    expect(unlockProgress("decal_streak", { best_win_streak: 5 }).unlocked).toBe(true);
    expect(unlockProgress("decal_shutout", { perfect_wins: 1 }).unlocked).toBe(true);
  });

  it("never derives a rank aura from stats, however good they are", () => {
    const stellar = stats({ wins: 9999, matches: 9999, bestWinStreak: 99 });
    expect(unlockProgress("aura_weekly_1", stellar).unlocked).toBe(false);
    expect(earnedCosmetics(stellar)).not.toContain("aura_weekly_1");
  });

  it("accepts a rank aura once it has actually been granted", () => {
    const owned = new Set(["aura_daily_3"]);
    expect(unlockProgress("aura_daily_3", stats(), owned).unlocked).toBe(true);
    expect(unlockProgress("aura_daily_1", stats(), owned).unlocked).toBe(false);
  });

  it("writes readable unlock text for every rule it supports", () => {
    expect(unlockLabel("torso_plated")).toBe("WIN 3 MATCHES");
    expect(unlockLabel("torso_standard")).toBe("");
    expect(unlockLabel("decal_century")).toBe("PLAY 100 MATCHES");
    expect(unlockLabel("decal_streak")).toBe("WIN 5 MATCHES IN A ROW");
    expect(unlockLabel("decal_shutout")).toBe("WIN A MATCH 5-0");
    expect(unlockLabel("decal_comeback")).toBe("WIN FROM 0-4 DOWN");
    expect(unlockLabel("aura_weekly_1")).toBe("REACH TOP 1 IN WEEKLY LEADERBOARD ONCE");
  });

  it("earns exactly the cosmetics the stats deserve", () => {
    expect(earnedCosmetics(stats()).sort()).toEqual(Object.values(DEFAULTS).sort());
    expect(earnedCosmetics(stats({ wins: 3 })).sort()).toEqual(
      [...Object.values(DEFAULTS), "torso_plated"].sort(),
    );
    expect(earnedCosmetics(stats({ comebacks: 1 }))).toContain("decal_comeback");
  });

  it("treats an unknown id as locked rather than throwing", () => {
    expect(unlockProgress("torso_does_not_exist", stats({ wins: 99 })).unlocked).toBe(false);
  });
});

describe("pickReveal", () => {
  it("shows the rarest of several unlocks landing together", () => {
    // Placing first grants every tier at or below, so this is the normal case
    // for a leaderboard rollover — not an edge case.
    expect(pickReveal(["aura_daily_10", "aura_daily_1", "aura_daily_3"])).toBe("aura_daily_1");
    expect(pickReveal(["aura_daily_1", "aura_weekly_10"])).toBe("aura_weekly_10");
  });

  it("ignores items that are not worth revealing", () => {
    expect(pickReveal(["torso_standard", "decal_plain", "aura_none"])).toBe(null);
    expect(pickReveal(["torso_standard", "decal_shutout"])).toBe("decal_shutout");
  });

  it("survives empty and missing input", () => {
    expect(pickReveal([])).toBe(null);
    expect(pickReveal(undefined)).toBe(null);
    expect(pickReveal(["nope"])).toBe(null);
  });

  it("ranks every reward item uniquely so the choice is never arbitrary", () => {
    const ranks = Object.values(ITEMS)
      .map((i) => i.reveal)
      .filter((r) => r != null);
    expect(new Set(ranks).size).toBe(ranks.length);
  });
});

describe("sanitizeCosmetics", () => {
  it("keeps a valid loadout intact", () => {
    expect(sanitizeCosmetics({ ...DEFAULTS, torso: "torso_chrome" })).toEqual({
      ...DEFAULTS,
      torso: "torso_chrome",
    });
  });

  it("drops unknown ids so a modified peer cannot inject values", () => {
    expect(sanitizeCosmetics({ torso: "../../etc/passwd" })).toEqual(DEFAULTS);
    expect(sanitizeCosmetics({ torso: "<script>" })).toEqual(DEFAULTS);
  });

  it("rejects an item worn in the wrong slot", () => {
    expect(sanitizeCosmetics({ torso: "aura_none" })).toEqual(DEFAULTS);
    expect(sanitizeCosmetics({ aura: "decal_shutout" })).toEqual(DEFAULTS);
  });

  it("survives null, junk and missing slots", () => {
    expect(sanitizeCosmetics(null)).toEqual(DEFAULTS);
    expect(sanitizeCosmetics("nope")).toEqual(DEFAULTS);
    expect(sanitizeCosmetics({})).toEqual(DEFAULTS);
    expect(sanitizeCosmetics({ torso: 42 })).toEqual(DEFAULTS);
  });

  it("ignores slots that are not enabled yet", () => {
    expect(sanitizeCosmetics({ ...DEFAULTS, special: "anything" })).toEqual(DEFAULTS);
  });

  it("carries a granted aura and decal through", () => {
    expect(
      sanitizeCosmetics({ torso: "torso_standard", decal: "decal_comeback", aura: "aura_weekly_1" }),
    ).toEqual({ torso: "torso_standard", decal: "decal_comeback", aura: "aura_weekly_1" });
  });
});

describe("spriteFor", () => {
  it("maps an equipped cosmetic to its sprite variant", () => {
    expect(spriteFor({ torso: "torso_reactor" }, "torso")).toBe("reactor");
    expect(spriteFor({ decal: "decal_comeback" }, "decal")).toBe("comeback");
    expect(spriteFor({ aura: "aura_weekly_3" }, "aura")).toBe("tempest");
  });

  it("falls back to the slot's first sprite when nothing is equipped", () => {
    expect(spriteFor({}, "torso")).toBe("standard");
    expect(spriteFor({ torso: "bogus" }, "torso")).toBe("standard");
    // The renderers treat these as "draw nothing", so the fallback matters.
    expect(spriteFor({}, "decal")).toBe("plain");
    expect(spriteFor({}, "aura")).toBe("none");
  });
});

describe("catalog and locale stay in step", () => {
  it("has an English name for every item and enabled slot", async () => {
    const { default: en } = await import("../src/i18n/locales/en.js");
    for (const id of Object.keys(ITEMS)) {
      expect(en[`cosmetic.item.${id}`], `cosmetic.item.${id}`).toBeTruthy();
    }
    for (const slot of SLOTS) {
      expect(en[`cosmetic.slot.${slot.id}`], `cosmetic.slot.${slot.id}`).toBeTruthy();
    }
  });

  it("has English text for every unlock rule in use", async () => {
    const { default: en } = await import("../src/i18n/locales/en.js");
    const keys = {
      wins: "unlock.wins",
      matches: "unlock.matches",
      streak: "unlock.streak",
      perfectWins: "unlock.perfect",
      comebacks: "unlock.comeback",
      rank: "unlock.rank",
    };
    for (const [id, item] of Object.entries(ITEMS)) {
      const type = item.unlock?.type ?? "default";
      if (type === "default") continue;
      expect(keys[type], `${id} uses unhandled unlock type ${type}`).toBeTruthy();
      expect(en[keys[type]], keys[type]).toBeTruthy();
    }
  });
});
