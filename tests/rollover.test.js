/**
 * Leaderboard rollover rules.
 *
 * Covers the decisions, not the writes: the award plan, the tier table derived
 * from the catalog, and the period arithmetic that decides *which* board is
 * being settled. Those are where a mistake silently hands out the wrong
 * cosmetic, or none at all.
 *
 * The D1 path in settleKey (idempotency, the eligibility filter, board
 * ordering) is deliberately not faked here — a stubbed database would assert
 * the shape of the code rather than the behaviour of the SQL. It is exercised
 * against real D1 via `wrangler dev --test-scheduled`.
 */
import { describe, it, expect } from "vitest";
import { plannedAwards, previousKeys, tiersFor, MIN_MATCHES } from "../server/src/rollover.js";
import { getItem } from "../src/data/cosmetics.js";

const ids = (plan) => plan.map((p) => p.cosmeticId);

describe("tiersFor", () => {
  it("derives each board's tiers from the catalog, richest last", () => {
    expect(tiersFor("daily")).toEqual([
      { id: "aura_daily_1", top: 1 },
      { id: "aura_daily_3", top: 3 },
      { id: "aura_daily_10", top: 10 },
    ]);
    expect(tiersFor("weekly")).toEqual([
      { id: "aura_weekly_1", top: 1 },
      { id: "aura_weekly_3", top: 3 },
      { id: "aura_weekly_10", top: 10 },
    ]);
  });

  it("keeps the two boards' rewards completely separate", () => {
    const daily = new Set(tiersFor("daily").map((t) => t.id));
    for (const tier of tiersFor("weekly")) expect(daily.has(tier.id)).toBe(false);
  });

  it("only ever returns rank-type items", () => {
    for (const period of ["daily", "weekly"]) {
      for (const tier of tiersFor(period)) {
        expect(getItem(tier.id).unlock.type).toBe("rank");
        expect(getItem(tier.id).unlock.board).toBe(period);
      }
    }
  });

  it("has no tiers for a board that does not exist", () => {
    expect(tiersFor("monthly")).toEqual([]);
  });
});

describe("plannedAwards", () => {
  const tiers = tiersFor("daily");

  it("gives first place every tier at or below it", () => {
    const plan = plannedAwards(tiers, ["alice"]);
    expect(ids(plan).sort()).toEqual(["aura_daily_1", "aura_daily_10", "aura_daily_3"]);
    expect(plan.every((p) => p.accountId === "alice" && p.rank === 1)).toBe(true);
  });

  it("gives third place the top-3 and top-10 tiers but not the crown", () => {
    const plan = plannedAwards(tiers, ["a", "b", "carol"]).filter((p) => p.accountId === "carol");
    expect(ids(plan).sort()).toEqual(["aura_daily_10", "aura_daily_3"]);
    expect(plan[0].rank).toBe(3);
  });

  it("gives fourth place only the top-10 tier", () => {
    const plan = plannedAwards(tiers, ["a", "b", "c", "dave"]).filter((p) => p.accountId === "dave");
    expect(ids(plan)).toEqual(["aura_daily_10"]);
  });

  it("stops rewarding past the deepest tier", () => {
    const board = Array.from({ length: 12 }, (_, i) => `p${i + 1}`);
    const plan = plannedAwards(tiers, board);
    expect(plan.some((p) => p.accountId === "p10")).toBe(true);
    expect(plan.some((p) => p.accountId === "p11")).toBe(false);
    expect(plan.some((p) => p.accountId === "p12")).toBe(false);
  });

  it("records the finishing rank, not the tier, for the audit log", () => {
    const plan = plannedAwards(tiers, ["a", "b", "c", "d", "e"]);
    for (const p of plan) {
      expect(p.rank).toBe(["a", "b", "c", "d", "e"].indexOf(p.accountId) + 1);
    }
  });

  it("awards nothing for an empty board", () => {
    expect(plannedAwards(tiers, [])).toEqual([]);
  });

  it("awards nothing when a board has no tiers configured", () => {
    expect(plannedAwards([], ["alice"])).toEqual([]);
  });
});

describe("previousKeys", () => {
  // A Wednesday, mid-morning UTC — deliberately not near a boundary, since the
  // cron fires just *after* one and must still name the period that just ended.
  const wed = Date.UTC(2026, 6, 29, 10, 0, 0);

  it("names yesterday, not today, for a daily settle", () => {
    expect(previousKeys("daily", wed)).toEqual(["d:2026-07-28"]);
  });

  it("walks back one day at a time, most recent first", () => {
    expect(previousKeys("daily", wed, 3)).toEqual(["d:2026-07-28", "d:2026-07-27", "d:2026-07-26"]);
  });

  it("names last week, not this one, for a weekly settle", () => {
    // The Wednesday above falls in W31, so a settle run then must not touch it.
    expect(previousKeys("weekly", wed, 2)).toEqual(["w:2026-W30", "w:2026-W29"]);
  });

  it("settles the right day when the cron fires just after midnight", () => {
    // 00:05 UTC on the 1st must settle the last day of the previous month.
    const justAfterMidnight = Date.UTC(2026, 7, 1, 0, 5, 0);
    expect(previousKeys("daily", justAfterMidnight)).toEqual(["d:2026-07-31"]);
  });

  it("settles the right week when the cron fires just after Monday midnight", () => {
    const mondayEarly = Date.UTC(2026, 7, 3, 0, 10, 0); // Monday, ISO week 32
    expect(previousKeys("weekly", mondayEarly)).toEqual(["w:2026-W31"]);
  });

  it("crosses a year boundary without jumping backwards", () => {
    // 2027-01-01 is a Friday in ISO week 53 of 2026, so the week before it is
    // W52 of 2026 — not W52 of 2027, which is the trap a calendar year hits.
    const newYear = Date.UTC(2027, 0, 1, 0, 5, 0);
    expect(previousKeys("daily", newYear)).toEqual(["d:2026-12-31"]);
    expect(previousKeys("weekly", newYear)).toEqual(["w:2026-W52"]);
  });
});

describe("eligibility floor", () => {
  it("asks for more participation from a week than from a day", () => {
    expect(MIN_MATCHES.daily).toBeGreaterThan(0);
    expect(MIN_MATCHES.weekly).toBeGreaterThan(MIN_MATCHES.daily);
  });
});
