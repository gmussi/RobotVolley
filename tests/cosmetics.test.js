import { describe, it, expect } from "vitest";
import {
  ENABLED_SLOTS,
  itemsForSlot,
  defaultLoadout,
  unlockProgress,
  unlockLabel,
  earnedCosmetics,
  sanitizeCosmetics,
  spriteFor,
} from "../src/data/cosmetics.js";

const stats = (wins = 0, matches = 0) => ({ wins, matches, losses: 0 });

describe("cosmetics catalog", () => {
  it("exposes torso as the only playable slot for now", () => {
    expect(ENABLED_SLOTS).toEqual(["torso"]);
  });

  it("lists five torsos in browse order, standard first", () => {
    const torsos = itemsForSlot("torso");
    expect(torsos).toHaveLength(5);
    expect(torsos[0].id).toBe("torso_standard");
  });

  it("dresses a new account in the first item of each enabled slot", () => {
    expect(defaultLoadout()).toEqual({ torso: "torso_standard" });
  });
});

describe("unlock rules", () => {
  it("gives the standard torso away for free", () => {
    expect(unlockProgress("torso_standard", stats(0)).unlocked).toBe(true);
  });

  it("gates the four new torsos at 1, 3, 5 and 10 wins", () => {
    const gates = [
      ["torso_plated", 1],
      ["torso_vented", 3],
      ["torso_reactor", 5],
      ["torso_chrome", 10],
    ];
    for (const [id, need] of gates) {
      expect(unlockProgress(id, stats(need - 1)).unlocked, `${id} at ${need - 1} wins`).toBe(false);
      expect(unlockProgress(id, stats(need)).unlocked, `${id} at ${need} wins`).toBe(true);
      expect(unlockProgress(id, stats(need)).need).toBe(need);
    }
  });

  it("reports progress so the UI can show 2 / 3", () => {
    const p = unlockProgress("torso_vented", stats(2));
    expect(p).toEqual({ unlocked: false, have: 2, need: 3 });
  });

  it("writes readable unlock text, singular for one win", () => {
    expect(unlockLabel("torso_plated")).toBe("WIN 1 MATCH");
    expect(unlockLabel("torso_vented")).toBe("WIN 3 MATCHES");
    expect(unlockLabel("torso_standard")).toBe("");
  });

  it("earns exactly the torsos the win count deserves", () => {
    expect(earnedCosmetics(stats(0))).toEqual(["torso_standard"]);
    expect(earnedCosmetics(stats(3)).sort()).toEqual(
      ["torso_plated", "torso_standard", "torso_vented"].sort(),
    );
    expect(earnedCosmetics(stats(10))).toHaveLength(5);
  });

  it("treats an unknown id as locked rather than throwing", () => {
    expect(unlockProgress("torso_does_not_exist", stats(99)).unlocked).toBe(false);
  });
});

describe("sanitizeCosmetics", () => {
  it("keeps a valid loadout intact", () => {
    expect(sanitizeCosmetics({ torso: "torso_chrome" })).toEqual({ torso: "torso_chrome" });
  });

  it("drops unknown ids so a modified peer cannot inject values", () => {
    expect(sanitizeCosmetics({ torso: "../../etc/passwd" })).toEqual({ torso: "torso_standard" });
    expect(sanitizeCosmetics({ torso: "<script>" })).toEqual({ torso: "torso_standard" });
  });

  it("rejects an item worn in the wrong slot", () => {
    expect(sanitizeCosmetics({ torso: "aura_whatever" })).toEqual({ torso: "torso_standard" });
  });

  it("survives null, junk and missing slots", () => {
    expect(sanitizeCosmetics(null)).toEqual({ torso: "torso_standard" });
    expect(sanitizeCosmetics("nope")).toEqual({ torso: "torso_standard" });
    expect(sanitizeCosmetics({})).toEqual({ torso: "torso_standard" });
    expect(sanitizeCosmetics({ torso: 42 })).toEqual({ torso: "torso_standard" });
  });

  it("ignores slots that are not enabled yet", () => {
    expect(sanitizeCosmetics({ torso: "torso_standard", aura: "anything" })).toEqual({
      torso: "torso_standard",
    });
  });
});

describe("spriteFor", () => {
  it("maps an equipped cosmetic to its sprite variant", () => {
    expect(spriteFor({ torso: "torso_reactor" }, "torso")).toBe("reactor");
  });

  it("falls back to the slot's first sprite when nothing is equipped", () => {
    expect(spriteFor({}, "torso")).toBe("standard");
    expect(spriteFor({ torso: "bogus" }, "torso")).toBe("standard");
  });
});
