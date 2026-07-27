/**
 * Leaderboard reads.
 *
 * `resetsAt` is computed and returned by the server rather than derived on the
 * client, so the countdown says the same thing to a player in Berlin and one in
 * São Paulo — periods are UTC, and a client-side guess would drift with the
 * device clock and the timezone.
 */
import { periodKey, resetsAt } from "../../../shared/periods.js";
import { json, fail, authenticate } from "./http.js";

const TOP_N = 50;

/** GET /leaderboard?period=daily|weekly */
export async function handleLeaderboard(request, env) {
  const url = new URL(request.url);
  const period = url.searchParams.get("period") === "weekly" ? "weekly" : "daily";
  const now = Date.now();
  const key = periodKey(period, now);

  const top = await env.DB.prepare(
    `SELECT l.account_id, l.points, l.wins, l.matches, a.display_name
     FROM leaderboard l JOIN accounts a ON a.id = l.account_id
     WHERE l.period_key = ?
     ORDER BY l.points DESC, l.wins DESC, a.display_name ASC
     LIMIT ?`,
  )
    .bind(key, TOP_N)
    .all();

  const entries = (top.results ?? []).map((row, i) => ({
    rank: i + 1,
    accountId: row.account_id,
    name: row.display_name,
    points: row.points,
    wins: row.wins,
    matches: row.matches,
  }));

  // The caller's own row, so a player outside the top N still sees where they
  // stand. Unauthenticated callers just get the board.
  let me = null;
  const accountId = await authenticate(request, env);
  if (accountId) {
    const inTop = entries.find((e) => e.accountId === accountId);
    if (inTop) {
      me = inTop;
    } else {
      const row = await env.DB.prepare(
        `SELECT l.points, l.wins, l.matches, a.display_name
         FROM leaderboard l JOIN accounts a ON a.id = l.account_id
         WHERE l.period_key = ? AND l.account_id = ?`,
      )
        .bind(key, accountId)
        .first();
      if (row) {
        // Rank by counting everyone strictly ahead — cheap and exact.
        const ahead = await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM leaderboard
           WHERE period_key = ? AND (points > ? OR (points = ? AND wins > ?))`,
        )
          .bind(key, row.points, row.points, row.wins)
          .first();
        me = {
          rank: (ahead?.n ?? 0) + 1,
          accountId,
          name: row.display_name,
          points: row.points,
          wins: row.wins,
          matches: row.matches,
        };
      }
    }
  }

  if (!entries && !me) return fail(request, "no_board", 404);
  return json(request, {
    period,
    periodKey: key,
    resetsAt: resetsAt(period, now),
    serverTime: now,
    entries,
    me,
  });
}
