import { describe, it, expect } from "vitest";
import { planPairings, HUMAN_BOT_GRACE_MS } from "../shared/pairing.js";

const NOW = 1_700_000_000_000;

/** A queue entry; everyone is in the same place unless a test says otherwise. */
function entry(id, { bot = false, waitedMs = 0, lat = 52.5, lon = 13.4, elo = 1200 } = {}) {
  return { id, isBot: bot, queuedAt: NOW - waitedMs, lat, lon, elo };
}

/** Pairs as unordered sets, for assertions that don't care who hosts. */
function asSets(pairs) {
  return pairs.map((p) => [...p].sort().join("+")).sort();
}

describe("planPairings — nothing to do", () => {
  it("returns no pairs for an empty queue", () => {
    expect(planPairings([], NOW)).toEqual([]);
  });

  it("returns no pairs for a lone player", () => {
    expect(planPairings([entry("h1")], NOW)).toEqual([]);
  });

  it("tolerates a missing queue", () => {
    expect(planPairings(undefined, NOW)).toEqual([]);
  });
});

describe("planPairings — humans first", () => {
  it("pairs two humans immediately, with no grace period", () => {
    const pairs = planPairings([entry("h1"), entry("h2")], NOW);
    expect(asSets(pairs)).toEqual(["h1+h2"]);
  });

  it("prefers a human opponent over a bot that has been waiting longer", () => {
    // Both humans are brand new; the bot is long-waiting and co-located. The
    // humans must still find each other.
    const pairs = planPairings(
      [entry("bot1", { bot: true, waitedMs: 60_000 }), entry("h1"), entry("h2")],
      NOW,
    );
    expect(asSets(pairs)).toEqual(["h1+h2"]);
  });

  it("pairs the longest-waiting humans first when the count is odd", () => {
    const pairs = planPairings(
      [
        entry("fresh", { waitedMs: 0 }),
        entry("oldest", { waitedMs: 30_000 }),
        entry("older", { waitedMs: 20_000 }),
      ],
      NOW,
    );
    // The freshest arrival is the one left over, not someone already waiting.
    expect(asSets(pairs)).toEqual(["older+oldest"]);
  });

  it("still respects geography between humans", () => {
    const pairs = planPairings(
      [
        entry("berlin-a", { lat: 52.5, lon: 13.4 }),
        entry("berlin-b", { lat: 52.4, lon: 13.5 }),
        entry("sydney", { lat: -33.9, lon: 151.2 }),
      ],
      NOW,
    );
    expect(asSets(pairs)).toEqual(["berlin-a+berlin-b"]);
  });
});

describe("planPairings — the human/bot grace period", () => {
  it("makes a freshly queued human wait rather than handing them a bot", () => {
    const pairs = planPairings([entry("h1", { waitedMs: 0 }), entry("bot1", { bot: true })], NOW);
    expect(pairs).toEqual([]);
  });

  it("still withholds the bot one tick before the grace expires", () => {
    const pairs = planPairings(
      [entry("h1", { waitedMs: HUMAN_BOT_GRACE_MS - 1 }), entry("bot1", { bot: true })],
      NOW,
    );
    expect(pairs).toEqual([]);
  });

  it("hands over the bot once the human has waited out the grace", () => {
    const pairs = planPairings(
      [entry("h1", { waitedMs: HUMAN_BOT_GRACE_MS }), entry("bot1", { bot: true })],
      NOW,
    );
    expect(asSets(pairs)).toEqual(["bot1+h1"]);
  });

  it("honours a caller-supplied grace period", () => {
    const queue = [entry("h1", { waitedMs: 1000 }), entry("bot1", { bot: true })];
    expect(planPairings(queue, NOW, { humanBotGraceMs: 5000 })).toEqual([]);
    expect(asSets(planPairings(queue, NOW, { humanBotGraceMs: 500 }))).toEqual(["bot1+h1"]);
  });

  it("gives each waiting human their own bot", () => {
    const pairs = planPairings(
      [
        entry("h1", { waitedMs: 9000 }),
        entry("h2", { waitedMs: 8000 }),
        entry("bot1", { bot: true }),
        entry("bot2", { bot: true }),
      ],
      NOW,
    );
    // Two humans present means they pair with *each other* first — the bots are
    // only reached when a human is left over.
    expect(asSets(pairs)).toEqual(["h1+h2"]);
  });

  it("pairs the leftover human of an odd group with a bot", () => {
    const pairs = planPairings(
      [
        entry("h1", { waitedMs: 9000 }),
        entry("h2", { waitedMs: 8000 }),
        entry("h3", { waitedMs: 7000 }),
        entry("bot1", { bot: true }),
      ],
      NOW,
    );
    expect(asSets(pairs)).toEqual(["bot1+h3", "h1+h2"]);
  });
});

describe("planPairings — bots yield to humans", () => {
  it("pairs bots with each other when the queue holds nobody real", () => {
    const bots = ["b1", "b2", "b3", "b4"].map((id) => entry(id, { bot: true }));
    expect(planPairings(bots, NOW)).toHaveLength(1); // one pair, two held in reserve
    expect(planPairings(bots, NOW, { reserveBots: 0 })).toHaveLength(2);
  });

  it("REFUSES to pair bots while a human is still inside their grace period", () => {
    // This is the guarantee that makes the grace period worth having: if the
    // bots consumed each other during those 5 seconds, the human would reach
    // the end of their wait facing an empty queue — the exact situation the
    // whole feature exists to prevent.
    const pairs = planPairings(
      [
        entry("h1", { waitedMs: 1000 }),
        entry("bot1", { bot: true }),
        entry("bot2", { bot: true }),
        entry("bot3", { bot: true }),
      ],
      NOW,
    );
    expect(pairs).toEqual([]);
  });

  it("holds every remaining bot back for one unmatched human", () => {
    const pairs = planPairings(
      [
        entry("h1", { waitedMs: 9000 }),
        entry("h2", { waitedMs: 9000 }),
        entry("h3", { waitedMs: 9000 }),
        entry("bot1", { bot: true }),
        entry("bot2", { bot: true }),
        entry("bot3", { bot: true }),
      ],
      NOW,
    );
    // h1+h2 pair; h3 takes a bot; the two surviving bots must NOT pair off,
    // because they are the standing supply for the next human to arrive.
    expect(pairs).toHaveLength(2);
    expect(asSets(pairs)).toContain("h1+h2");
  });

  it("lets bots pair once every human has been matched", () => {
    const pairs = planPairings(
      [
        entry("h1", { waitedMs: 9000 }),
        entry("h2", { waitedMs: 9000 }),
        ...["b1", "b2", "b3", "b4"].map((id) => entry(id, { bot: true })),
      ],
      NOW,
    );
    expect(pairs).toHaveLength(2);
    expect(asSets(pairs)).toContain("h1+h2");
  });
});

describe("planPairings — the idle bot reserve", () => {
  it("always leaves the reserve unpaired, however large the fleet", () => {
    const bots = Array.from({ length: 21 }, (_, i) => entry(`b${i}`, { bot: true }));
    const pairs = planPairings(bots, NOW);
    expect(pairs).toHaveLength(9); // floor((21 - 2) / 2)
    expect(21 - pairs.flat().length).toBeGreaterThanOrEqual(2);
  });

  it("refuses to pair a fleet smaller than the reserve", () => {
    const bots = ["b1", "b2"].map((id) => entry(id, { bot: true }));
    expect(planPairings(bots, NOW)).toEqual([]);
  });

  it("consumes the whole fleet when the reserve is disabled", () => {
    const bots = ["b1", "b2", "b3", "b4", "b5", "b6"].map((id) => entry(id, { bot: true }));
    const pairs = planPairings(bots, NOW, { reserveBots: 0 });
    expect(pairs).toHaveLength(3);
    expect(new Set(pairs.flat()).size).toBe(6);
  });

  it("does not let the reserve keep a human waiting", () => {
    // The reserve protects future humans, not present ones: a human past their
    // grace period takes a bot even if that drops the fleet below the reserve.
    const pairs = planPairings(
      [entry("h1", { waitedMs: 9000 }), entry("b1", { bot: true }), entry("b2", { bot: true })],
      NOW,
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toContain("h1");
  });
});

describe("planPairings — nobody is matched twice", () => {
  it("never repeats an id across pairs", () => {
    const queue = [
      entry("h1", { waitedMs: 9000 }),
      entry("h2", { waitedMs: 9000 }),
      entry("h3", { waitedMs: 9000 }),
      entry("h4", { waitedMs: 9000 }),
      entry("bot1", { bot: true }),
      entry("bot2", { bot: true }),
    ];
    const pairs = planPairings(queue, NOW);
    const ids = pairs.flat();
    expect(new Set(ids).size).toBe(ids.length);
  });
});
