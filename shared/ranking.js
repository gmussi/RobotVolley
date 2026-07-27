/**
 * Ladder maths: hidden Elo, and the points a match is worth.
 *
 * Elo is deliberately *hidden*. It exists to scale points and break ties, not
 * to be shown as a rank — a visible rating punishes new players for learning in
 * public, and this is a game people are meant to bounce off for ten minutes.
 *
 * Points are what the daily/weekly boards rank by. A win is worth ~10, nudged
 * by how much of an upset it was, with a floor so beating a weaker opponent is
 * never worthless. A loss is worth nothing but still counts as a match played,
 * so `matches`-type unlocks are never gated behind winning.
 */

export const START_ELO = 1200;
export const K_FACTOR = 32;

const WIN_POINTS_BASE = 10;
const WIN_POINTS_SWING = 5;
const WIN_POINTS_FLOOR = 3;

/** Probability `eloA` beats `eloB` under the standard logistic curve. */
export function expectedScore(eloA, eloB) {
  return 1 / (1 + 10 ** ((eloB - eloA) / 400));
}

/**
 * New ratings after a decided match.
 * @param {number} winnerElo
 * @param {number} loserElo
 * @returns {{winner: number, loser: number}} rounded ratings
 */
export function nextElo(winnerElo, loserElo) {
  const expected = expectedScore(winnerElo, loserElo);
  const delta = K_FACTOR * (1 - expected);
  return {
    winner: Math.round(winnerElo + delta),
    loser: Math.round(loserElo - delta),
  };
}

/**
 * Leaderboard points for a win. Beating someone stronger pays more; the floor
 * keeps farming-down from paying nothing at all.
 */
export function winPoints(winnerElo, loserElo) {
  const expected = expectedScore(winnerElo, loserElo);
  // expected 0.5 → base; a certain win → base - swing; a big upset → base + swing.
  const raw = WIN_POINTS_BASE + WIN_POINTS_SWING * (1 - 2 * expected);
  return Math.max(WIN_POINTS_FLOOR, Math.round(raw));
}

/**
 * Matchmaking cost. **Geography dominates by design** — this is peer-to-peer
 * WebRTC, so distance is latency, and latency is the game. Rating only breaks
 * ties between opponents who are already about as close as each other.
 *
 * Concretely: any candidate more than `tiebreakKm` further away than the best
 * one loses outright, no matter how well matched their rating is.
 */
export const GEO_TIEBREAK_KM = 300;

/**
 * Pick an opponent from `candidates` — geography first, Elo only inside the band.
 * @param {{id: string, distanceKm: number, elo: number}[]} candidates
 * @param {number} elo the searching player's rating
 * @param {number} tiebreakKm
 * @returns {string|null} the chosen candidate's id
 */
export function chooseOpponent(candidates, elo, tiebreakKm = GEO_TIEBREAK_KM) {
  if (!candidates?.length) return null;

  let bestDistance = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    if (c.distanceKm < bestDistance) bestDistance = c.distanceKm;
  }

  // Unknown geography (no GeoIP) yields Infinity for everyone; in that case the
  // band is meaningless and rating is all we have to go on.
  const band = Number.isFinite(bestDistance)
    ? candidates.filter((c) => c.distanceKm <= bestDistance + tiebreakKm)
    : candidates;

  let best = band[0];
  let bestGap = Math.abs((best.elo ?? START_ELO) - elo);
  for (const c of band.slice(1)) {
    const gap = Math.abs((c.elo ?? START_ELO) - elo);
    if (gap < bestGap) {
      best = c;
      bestGap = gap;
    }
  }
  return best.id;
}
