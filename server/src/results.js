/**
 * Match result recording — the dual-report cross-check.
 *
 * Neither client is trusted. The host owns the score during play and the guest
 * only mirrors it, so a modified host could claim anything; instead both peers
 * report independently and a result is only recorded when the two agree. A
 * disagreement is discarded and counted against both accounts.
 *
 * This stops casual tampering. It does not stop two people who agree to lie —
 * catching that needs replay verification, which is deliberately out of scope.
 *
 * The `matches` row is keyed by room id, which makes replaying an old report a
 * no-op rather than a double count.
 */
import { nextElo, winPoints, START_ELO } from "../../shared/ranking.js";
import { dailyKey, weeklyKey } from "../../shared/periods.js";
import { getStats, syncUnlocks } from "./db.js";

/** A match must be plausible before it is worth cross-checking at all. */
export const WIN_SCORE = 5;
const MIN_DURATION_MS = 5_000;
const MAX_DURATION_MS = 60 * 60 * 1000;

/**
 * Is this report internally consistent? Rejecting here keeps obvious nonsense
 * out of the audit table entirely.
 */
export function isPlausible(report) {
  if (!report) return false;
  const { winnerSeat, score, durationMs, maxDeficit } = report;
  if (winnerSeat !== 0 && winnerSeat !== 1) return false;
  if (!Array.isArray(score) || score.length !== 2) return false;
  const [a, b] = score;
  if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
  if (a < 0 || b < 0 || a > WIN_SCORE || b > WIN_SCORE) return false;
  // Exactly one side reached the target, and it is the side that won.
  if (Math.max(a, b) !== WIN_SCORE) return false;
  if ((a > b ? 0 : 1) !== winnerSeat) return false;
  if (!Number.isFinite(durationMs)) return false;
  if (durationMs < MIN_DURATION_MS || durationMs > MAX_DURATION_MS) return false;
  // Optional (older clients omit it). The winner's deficit can never exceed
  // WIN_SCORE - 1: at WIN_SCORE the match was already over. It also cannot
  // exceed what the loser actually scored.
  if (maxDeficit !== undefined && maxDeficit !== null) {
    if (!Number.isInteger(maxDeficit)) return false;
    if (maxDeficit < 0 || maxDeficit > WIN_SCORE - 1) return false;
    if (maxDeficit > Math.min(a, b)) return false;
  }
  return true;
}

/** Was the winner ever a full match-point behind? Only 0-4 gets you there. */
export const COMEBACK_DEFICIT = WIN_SCORE - 1;

/** Two reports describe the same match if every claim matches. */
export function reportsAgree(a, b) {
  return (
    a.winnerSeat === b.winnerSeat &&
    a.score[0] === b.score[0] &&
    a.score[1] === b.score[1]
  );
}

/**
 * Record one peer's view of a finished match.
 *
 * First report → 'pending'. Second matching report → 'recorded' and stats move.
 * Second conflicting report → 'disputed' and nothing moves.
 *
 * @returns {Promise<{status: string, reason?: string}>}
 */
export async function reportResult(db, { roomId, accountId, seat, report, seats }) {
  if (!roomId || !accountId) return { status: "rejected", reason: "bad_request" };
  if (!isPlausible(report)) return { status: "rejected", reason: "implausible" };

  const existing = await db.prepare(`SELECT * FROM matches WHERE room_id = ?`).bind(roomId).first();
  const ts = Date.now();

  if (!existing) {
    await db
      .prepare(
        `INSERT INTO matches
           (room_id, a_account, b_account, winner_seat, score_a, score_b,
            duration_ms, max_deficit, reported_by, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .bind(
        roomId,
        seats?.[0] ?? null,
        seats?.[1] ?? null,
        report.winnerSeat,
        report.score[0],
        report.score[1],
        report.durationMs,
        report.maxDeficit ?? null,
        accountId,
        ts,
      )
      .run();
    return { status: "pending" };
  }

  // Already settled — a replayed report changes nothing.
  if (existing.status !== "pending") return { status: existing.status, reason: "already_settled" };
  // The same peer reporting twice is not corroboration.
  if (existing.reported_by === accountId) return { status: "pending", reason: "duplicate_report" };

  const first = {
    winnerSeat: existing.winner_seat,
    score: [existing.score_a, existing.score_b],
  };
  if (!reportsAgree(first, report)) {
    await db
      .prepare(`UPDATE matches SET status = 'disputed', recorded_at = ? WHERE room_id = ?`)
      .bind(ts, roomId)
      .run();
    await db
      .prepare(`UPDATE accounts SET disputes = disputes + 1 WHERE id IN (?, ?)`)
      .bind(existing.a_account, existing.b_account)
      .run();
    return { status: "disputed" };
  }

  const winnerAccount = report.winnerSeat === 0 ? existing.a_account : existing.b_account;
  const loserAccount = report.winnerSeat === 0 ? existing.b_account : existing.a_account;
  if (!winnerAccount || !loserAccount) {
    await db
      .prepare(`UPDATE matches SET status = 'disputed', recorded_at = ? WHERE room_id = ?`)
      .bind(ts, roomId)
      .run();
    return { status: "disputed", reason: "missing_account" };
  }

  // Deficit is deliberately outside reportsAgree(): it decides a cosmetic, not
  // the result. Letting a mismatch reach the disputed branch would cost both
  // players a dispute strike over a decal, so a disagreement just forfeits the
  // milestone and the match records normally.
  const agreedDeficit =
    existing.max_deficit !== null && existing.max_deficit === (report.maxDeficit ?? null)
      ? existing.max_deficit
      : null;

  const unlocks = await applyOutcome(db, winnerAccount, loserAccount, ts, {
    perfect: Math.min(report.score[0], report.score[1]) === 0,
    comeback: agreedDeficit !== null && agreedDeficit >= COMEBACK_DEFICIT,
  });
  await db
    .prepare(
      `UPDATE matches SET status = 'recorded', recorded_at = ?, max_deficit = ? WHERE room_id = ?`,
    )
    .bind(ts, agreedDeficit, roomId)
    .run();
  return { status: "recorded", unlocks };
}

/**
 * Server-observed forfeit: the matchmaker itself saw the loser's socket close
 * while the room was marked "started" (see Matchmaker#forfeitIfStarted) — this
 * is written directly as 'recorded' rather than 'pending' because the server
 * is the one asserting it happened, not a client report waiting on a second
 * peer to corroborate (there is no second peer left to ask).
 *
 * Guarded against two concurrent forfeits for the same room (e.g. both sockets
 * drop together) by the `room_id` primary key: the loser of that race gets a
 * constraint failure here and is treated as a no-op, same as any other replay
 * of an already-settled room.
 *
 * @returns {Promise<{status: string, reason?: string}>}
 */
export async function recordForfeit(db, { roomId, seats, winnerAccount, loserAccount }) {
  if (!winnerAccount || !loserAccount || winnerAccount === loserAccount) {
    return { status: "rejected", reason: "bad_accounts" };
  }

  const existing = await db.prepare(`SELECT status FROM matches WHERE room_id = ?`).bind(roomId).first();
  // Any existing row — pending, recorded, or disputed — means either a real
  // dual-report is already in flight or this room was already settled. A
  // forfeit never overrides that.
  if (existing) return { status: existing.status, reason: "already_settled" };

  const winnerSeat = seats.indexOf(winnerAccount);
  const ts = Date.now();
  try {
    await db
      .prepare(
        `INSERT INTO matches
           (room_id, a_account, b_account, winner_seat, score_a, score_b,
            duration_ms, reported_by, status, created_at, recorded_at)
         VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, 'recorded', ?, ?)`,
      )
      .bind(roomId, seats[0] ?? null, seats[1] ?? null, winnerSeat, ts, ts)
      .run();
  } catch {
    // Lost the race to a concurrent forfeit/report for the same room.
    return { status: "already_settled" };
  }

  // No score to reason about, so no scoreline milestones — a walkover is not a
  // 5-0 and not a comeback.
  const unlocks = await applyOutcome(db, winnerAccount, loserAccount, ts, {});
  return { status: "recorded", unlocks };
}

/**
 * Move stats, Elo, unlocks and both leaderboard periods for one settled match.
 *
 * `flags` carries the scoreline milestones the caller was able to establish:
 * `perfect` for a 5-0, `comeback` for a win both peers agreed started 0-4. A
 * forfeit passes neither.
 *
 * Returns the cosmetics each account newly owns as a result, keyed by account
 * id — the post-match reveal announces these, and only the server is in a
 * position to know them for both players at once.
 */
async function applyOutcome(db, winnerAccount, loserAccount, ts, flags = {}) {
  const [winnerStats, loserStats] = await Promise.all([
    getStats(db, winnerAccount),
    getStats(db, loserAccount),
  ]);

  const elo = nextElo(winnerStats.elo ?? START_ELO, loserStats.elo ?? START_ELO);
  const points = winPoints(winnerStats.elo ?? START_ELO, loserStats.elo ?? START_ELO);

  await db.batch([
    // best_win_streak is a high-water mark rather than a live counter: unlocks
    // are never revoked, so the cosmetic has to survive the loss that ends the
    // run that earned it.
    db
      .prepare(
        `UPDATE stats SET
           wins = wins + 1, matches = matches + 1, elo = ?,
           win_streak = win_streak + 1,
           best_win_streak = MAX(best_win_streak, win_streak + 1),
           perfect_wins = perfect_wins + ?,
           comebacks = comebacks + ?,
           updated_at = ?
         WHERE account_id = ?`,
      )
      .bind(elo.winner, flags.perfect ? 1 : 0, flags.comeback ? 1 : 0, ts, winnerAccount),
    db
      .prepare(
        `UPDATE stats SET losses = losses + 1, matches = matches + 1, elo = ?,
           win_streak = 0, updated_at = ?
         WHERE account_id = ?`,
      )
      .bind(elo.loser, ts, loserAccount),
  ]);

  // Both boards move on every match. A loss scores no points but still counts
  // as played, so the board can show participation as well as wins.
  const keys = [dailyKey(ts), weeklyKey(ts)];
  await db.batch(
    keys.flatMap((key) => [
      db
        .prepare(
          `INSERT INTO leaderboard (period_key, account_id, points, wins, matches)
           VALUES (?, ?, ?, 1, 1)
           ON CONFLICT(period_key, account_id) DO UPDATE SET
             points = points + excluded.points,
             wins = wins + 1,
             matches = matches + 1`,
        )
        .bind(key, winnerAccount, points),
      db
        .prepare(
          `INSERT INTO leaderboard (period_key, account_id, points, wins, matches)
           VALUES (?, ?, 0, 0, 1)
           ON CONFLICT(period_key, account_id) DO UPDATE SET
             matches = matches + 1`,
        )
        .bind(key, loserAccount),
    ]),
  );

  // Recompute unlocks so a cosmetic earned by this win is owned before the
  // client's post-match refresh lands.
  const fresh = await getStats(db, winnerAccount);
  const winnerUnlocks = await syncUnlocks(db, winnerAccount, fresh);
  const loserUnlocks = await syncUnlocks(db, loserAccount, await getStats(db, loserAccount));
  return { [winnerAccount]: winnerUnlocks, [loserAccount]: loserUnlocks };
}
