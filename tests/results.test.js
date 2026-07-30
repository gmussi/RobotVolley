/**
 * Match report validation.
 *
 * `isPlausible` is the outer gate on everything a client claims about a finished
 * match, and it now also gates the comeback milestone. `reportsAgree` decides
 * whether a match records or costs both players a dispute strike — so the tests
 * that matter most here are the ones pinning down what it does *not* consider.
 */
import { describe, it, expect } from "vitest";
import { isPlausible, reportsAgree, WIN_SCORE, COMEBACK_DEFICIT } from "../server/src/results.js";

/** A valid 5-3 win for seat 0, as a base to mutate. */
const report = (over = {}) => ({
  winnerSeat: 0,
  score: [5, 3],
  durationMs: 120_000,
  ...over,
});

describe("isPlausible", () => {
  it("accepts an ordinary win", () => {
    expect(isPlausible(report())).toBe(true);
    expect(isPlausible(report({ winnerSeat: 1, score: [2, 5] }))).toBe(true);
  });

  it("rejects nothing at all", () => {
    expect(isPlausible(null)).toBe(false);
    expect(isPlausible(undefined)).toBe(false);
  });

  it("rejects a score that disagrees with the claimed winner", () => {
    expect(isPlausible(report({ winnerSeat: 1 }))).toBe(false);
  });

  it("rejects a match nobody won, or that ran past the target", () => {
    expect(isPlausible(report({ score: [4, 3] }))).toBe(false);
    expect(isPlausible(report({ score: [6, 3] }))).toBe(false);
    expect(isPlausible(report({ score: [5, 5] }))).toBe(false);
  });

  it("rejects an implausible duration", () => {
    expect(isPlausible(report({ durationMs: 500 }))).toBe(false);
    expect(isPlausible(report({ durationMs: 5 * 60 * 60 * 1000 }))).toBe(false);
    expect(isPlausible(report({ durationMs: NaN }))).toBe(false);
  });

  // ---- maxDeficit -------------------------------------------------------
  //
  // Optional, because a client from before this field existed still reports a
  // perfectly valid match; it just cannot earn the comeback decal.

  it("accepts a report with no deficit claim at all", () => {
    expect(isPlausible(report({ maxDeficit: undefined }))).toBe(true);
    expect(isPlausible(report({ maxDeficit: null }))).toBe(true);
  });

  it("accepts a genuine comeback claim", () => {
    expect(isPlausible(report({ score: [5, 4], maxDeficit: COMEBACK_DEFICIT }))).toBe(true);
  });

  it("rejects a deficit the winner could not have survived", () => {
    // Being WIN_SCORE behind means the match was already over.
    expect(isPlausible(report({ score: [5, 4], maxDeficit: WIN_SCORE }))).toBe(false);
    expect(isPlausible(report({ maxDeficit: -1 }))).toBe(false);
  });

  it("rejects a deficit larger than the loser ever scored", () => {
    // You cannot have been 4 behind against someone who only reached 3.
    expect(isPlausible(report({ score: [5, 3], maxDeficit: 4 }))).toBe(false);
    expect(isPlausible(report({ score: [5, 0], maxDeficit: 1 }))).toBe(false);
    expect(isPlausible(report({ score: [5, 0], maxDeficit: 0 }))).toBe(true);
  });

  it("rejects a non-integer deficit", () => {
    expect(isPlausible(report({ maxDeficit: 2.5 }))).toBe(false);
    expect(isPlausible(report({ maxDeficit: "4" }))).toBe(false);
  });

  it("only lets a 5-4 finish claim the full comeback deficit", () => {
    // The milestone is "won from 0-4 down", and 5-4 is the only scoreline that
    // can carry it.
    for (let loser = 0; loser < WIN_SCORE; loser++) {
      const ok = isPlausible(report({ score: [5, loser], maxDeficit: COMEBACK_DEFICIT }));
      expect(ok, `5-${loser}`).toBe(loser === COMEBACK_DEFICIT);
    }
  });
});

describe("reportsAgree", () => {
  it("agrees when both peers saw the same match", () => {
    expect(reportsAgree(report(), report())).toBe(true);
  });

  it("disagrees on winner or score", () => {
    expect(reportsAgree(report(), report({ winnerSeat: 1, score: [3, 5] }))).toBe(false);
    expect(reportsAgree(report(), report({ score: [5, 2] }))).toBe(false);
  });

  it("ignores duration, which the two peers time independently", () => {
    expect(reportsAgree(report(), report({ durationMs: 121_000 }))).toBe(true);
  });

  it("ignores the deficit claim", () => {
    // Load-bearing: a deficit mismatch must not reach the disputed branch, or a
    // disagreement about a cosmetic would cost both players a dispute strike.
    // reportResult forfeits the milestone instead and records the match.
    expect(reportsAgree(report({ maxDeficit: 4 }), report({ maxDeficit: 0 }))).toBe(true);
  });
});
