import { describe, it, expect } from "vitest";
import {
  expectedScore, nextElo, winPoints, chooseOpponent, START_ELO, GEO_TIEBREAK_KM,
} from "../shared/ranking.js";

describe("elo", () => {
  it("gives even odds to equal ratings", () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5, 6);
  });

  it("favours the higher rating", () => {
    expect(expectedScore(1600, 1200)).toBeGreaterThan(0.9);
    expect(expectedScore(1200, 1600)).toBeLessThan(0.1);
  });

  it("moves both players by the same amount", () => {
    const { winner, loser } = nextElo(1200, 1200);
    expect(winner - 1200).toBe(1200 - loser);
    expect(winner).toBeGreaterThan(1200);
  });

  it("pays little for beating someone far weaker", () => {
    const gain = nextElo(1800, 1000).winner - 1800;
    expect(gain).toBeLessThanOrEqual(2);
  });

  it("pays a lot for an upset", () => {
    const gain = nextElo(1000, 1800).winner - 1000;
    expect(gain).toBeGreaterThan(28);
  });
});

describe("leaderboard points", () => {
  it("pays the base for an even match", () => {
    expect(winPoints(1200, 1200)).toBe(10);
  });

  it("pays more for an upset than for a favoured win", () => {
    expect(winPoints(1000, 1600)).toBeGreaterThan(winPoints(1600, 1000));
  });

  it("never pays less than the floor, however lopsided", () => {
    expect(winPoints(3000, 100)).toBeGreaterThanOrEqual(3);
  });

  it("always awards a whole number", () => {
    for (const [a, b] of [[1200, 1200], [900, 1700], [1700, 900], [1234, 1198]]) {
      expect(Number.isInteger(winPoints(a, b))).toBe(true);
    }
  });
});

describe("chooseOpponent — geography first", () => {
  it("returns null with nobody waiting", () => {
    expect(chooseOpponent([], 1200)).toBe(null);
  });

  it("picks the nearby player over a far-away one with identical rating", () => {
    const chosen = chooseOpponent(
      [
        { id: "far", distanceKm: 5000, elo: 1200 },
        { id: "near", distanceKm: 20, elo: 1200 },
      ],
      1200,
    );
    expect(chosen).toBe("near");
  });

  it("REFUSES to trade distance for a better rating match", () => {
    // The far player is a perfect rating match and the near one is 600 apart —
    // geography must still win, because distance is latency and latency is the
    // game. This is the guarantee the whole matchmaking design rests on.
    const chosen = chooseOpponent(
      [
        { id: "far-perfect", distanceKm: 8000, elo: 1500 },
        { id: "near-mismatched", distanceKm: 10, elo: 900 },
      ],
      1500,
    );
    expect(chosen).toBe("near-mismatched");
  });

  it("uses rating to separate players who are similarly close", () => {
    const chosen = chooseOpponent(
      [
        { id: "close-bad-elo", distanceKm: 30, elo: 2000 },
        { id: "close-good-elo", distanceKm: 30 + GEO_TIEBREAK_KM - 1, elo: 1210 },
      ],
      1200,
    );
    expect(chosen).toBe("close-good-elo");
  });

  it("drops a candidate that falls outside the proximity band", () => {
    const chosen = chooseOpponent(
      [
        { id: "in-band", distanceKm: 10, elo: 2000 },
        { id: "out-of-band", distanceKm: 10 + GEO_TIEBREAK_KM + 1, elo: 1200 },
      ],
      1200,
    );
    expect(chosen).toBe("in-band");
  });

  it("still matches a lone player rather than making them wait", () => {
    expect(chooseOpponent([{ id: "only", distanceKm: 12000, elo: 2400 }], 1000)).toBe("only");
  });

  it("falls back to rating when nobody has geolocation", () => {
    // Cloudflare GeoIP can come back empty; haversine then yields Infinity for
    // everyone and the band means nothing, so rating is all we have.
    const chosen = chooseOpponent(
      [
        { id: "wrong-elo", distanceKm: Infinity, elo: 2000 },
        { id: "right-elo", distanceKm: Infinity, elo: 1205 },
      ],
      1200,
    );
    expect(chosen).toBe("right-elo");
  });

  it("treats a missing rating as the starting rating", () => {
    const chosen = chooseOpponent(
      [
        { id: "unrated", distanceKm: 10 },
        { id: "rated", distanceKm: 10, elo: 2000 },
      ],
      START_ELO,
    );
    expect(chosen).toBe("unrated");
  });
});
