/**
 * Who gets matched with whom, and in what order.
 *
 * The queue holds two kinds of player: humans, and the bots in `tools/bot/`
 * that keep it from ever being empty. Bots are ordinary accounts everywhere
 * else in the system — they rank, they move Elo — but here they are strictly
 * second class, because a bot's whole purpose is to be the opponent you get
 * when there is no better option:
 *
 *   1. Humans pair with humans first, with no restrictions at all.
 *   2. A human is only offered a bot after waiting `humanBotGraceMs`. That
 *      pause is the point: without it the first human to queue is instantly
 *      eaten by a bot and two humans who arrived seconds apart never meet.
 *   3. Bots pair with each other only when the queue holds no human whatsoever
 *      — not even one still inside their grace period. Two bots grabbing each
 *      other while somebody real is 3 seconds into their wait would leave that
 *      human facing an empty queue at second 5.
 *
 * Within each of those steps geography still decides, via `chooseOpponent` —
 * this is peer-to-peer, so distance is latency and latency is the game.
 *
 * Pure and side-effect free so the rules can be tested without a Durable
 * Object; `server/src/matchmaker.js` supplies the entries and acts on the
 * pairs. Note that rule 2 is time-based, which means the caller must re-run
 * this on a timer and not only when someone joins.
 */
import { chooseOpponent, START_ELO, GEO_TIEBREAK_KM } from "./ranking.js";

/** How long a human waits for another human before a bot becomes eligible. */
export const HUMAN_BOT_GRACE_MS = 5000;

/**
 * How many bots to leave sitting in the queue rather than pairing off.
 *
 * Rule 3 on its own has a hole: with an idle queue the bots pair up, and a
 * human arriving a second later finds *nothing* — every bot is busy for the
 * next couple of minutes, which is the precise failure this whole feature
 * exists to prevent. Holding a couple back keeps a standing supply of instant
 * opponents. Set to 0 to let the fleet consume itself (useful when the point
 * is to generate load rather than to cover players).
 */
export const RESERVE_BOTS = 2;

function haversineKm(lat1, lon1, lat2, lon2) {
  if (
    lat1 == null || lon1 == null || lat2 == null || lon2 == null ||
    Number.isNaN(lat1) || Number.isNaN(lon1) || Number.isNaN(lat2) || Number.isNaN(lon2)
  ) {
    return Number.POSITIVE_INFINITY;
  }
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Pick the best opponent for `seeker` out of `pool`, then remove both.
 * @returns {[string, string]|null} the pair, seeker first (they become host)
 */
function takeBestPair(seeker, pool, remaining, tiebreakKm) {
  const candidates = pool
    .filter((c) => c.id !== seeker.id && remaining.has(c.id))
    .map((c) => ({
      id: c.id,
      distanceKm: haversineKm(seeker.lat, seeker.lon, c.lat, c.lon),
      elo: c.elo ?? START_ELO,
    }));
  const bestId = chooseOpponent(candidates, seeker.elo ?? START_ELO, tiebreakKm);
  if (!bestId) return null;
  remaining.delete(seeker.id);
  remaining.delete(bestId);
  return [seeker.id, bestId];
}

/**
 * Plan every match that should be formed right now.
 *
 * @param {{id: string, isBot?: boolean, queuedAt?: number,
 *          lat?: number|null, lon?: number|null, elo?: number}[]} entries
 *   everyone currently queued, in join order
 * @param {number} now epoch ms
 * @param {{humanBotGraceMs?: number, tiebreakKm?: number, reserveBots?: number}} [opts]
 * @returns {[string, string][]} pairs; the first id of each is the host (seat 0)
 */
export function planPairings(entries, now, opts = {}) {
  const graceMs = opts.humanBotGraceMs ?? HUMAN_BOT_GRACE_MS;
  const tiebreakKm = opts.tiebreakKm ?? GEO_TIEBREAK_KM;
  const reserveBots = opts.reserveBots ?? RESERVE_BOTS;

  const queue = Array.isArray(entries) ? entries : [];
  if (queue.length < 2) return [];

  const remaining = new Set(queue.map((e) => e.id));
  const humans = queue.filter((e) => !e.isBot);
  const bots = queue.filter((e) => e.isBot);
  const pairs = [];

  // 1. Humans first. Both the seeker order and the candidate order run
  //    longest-wait-first: `chooseOpponent` keeps the earliest of several
  //    equally good candidates, so with an odd group the player left over is
  //    the one who just arrived rather than someone already waiting.
  const byWait = [...humans].sort((a, b) => (a.queuedAt ?? 0) - (b.queuedAt ?? 0));
  for (const seeker of byWait) {
    if (!remaining.has(seeker.id)) continue;
    const pair = takeBestPair(seeker, byWait, remaining, tiebreakKm);
    if (pair) pairs.push(pair);
  }

  // 2. Humans who waited out the grace period may now take a bot.
  for (const seeker of byWait) {
    if (!remaining.has(seeker.id)) continue;
    if (now - (seeker.queuedAt ?? now) < graceMs) continue;
    const pair = takeBestPair(seeker, bots, remaining, tiebreakKm);
    if (pair) pairs.push(pair);
  }

  // 3. Bots fill each other in only when no human is left waiting at all —
  //    including one still inside their grace period, who will need a partner
  //    the moment it expires — and never so completely that the queue empties.
  const humanStillWaiting = humans.some((h) => remaining.has(h.id));
  if (!humanStillWaiting) {
    const idle = bots.filter((b) => remaining.has(b.id));
    let budget = Math.max(0, Math.floor((idle.length - reserveBots) / 2));
    for (const seeker of idle) {
      if (budget <= 0) break;
      if (!remaining.has(seeker.id)) continue;
      const pair = takeBestPair(seeker, bots, remaining, tiebreakKm);
      if (pair) {
        pairs.push(pair);
        budget--;
      }
    }
  }

  return pairs;
}
