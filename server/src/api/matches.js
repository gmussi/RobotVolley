/**
 * Recent match history — the "LAST MATCHES" tab on the leaderboard screen.
 *
 * Only 'recorded' matches are returned: 'pending' rows are waiting on a second
 * report and 'disputed' rows never happened as far as either player's history
 * is concerned (see server/src/results.js).
 */
import { json, requireAuth } from "./http.js";

const RECENT_LIMIT = 10;

/** GET /matches/recent */
export async function handleRecentMatches(request, env) {
  const [accountId, denied] = await requireAuth(request, env);
  if (denied) return denied;

  const rows = await env.DB.prepare(
    `SELECT m.a_account, m.b_account, m.winner_seat, m.score_a, m.score_b, m.recorded_at,
            ma.display_name AS a_name, mb.display_name AS b_name
     FROM matches m
     LEFT JOIN accounts ma ON ma.id = m.a_account
     LEFT JOIN accounts mb ON mb.id = m.b_account
     WHERE m.status = 'recorded' AND (m.a_account = ? OR m.b_account = ?)
     ORDER BY m.recorded_at DESC
     LIMIT ?`,
  )
    .bind(accountId, accountId, RECENT_LIMIT)
    .all();

  const matches = (rows.results ?? []).map((row) => {
    const mySeat = row.a_account === accountId ? 0 : 1;
    return {
      opponentName: (mySeat === 0 ? row.b_name : row.a_name) ?? null,
      won: row.winner_seat === mySeat,
      myScore: mySeat === 0 ? row.score_a : row.score_b,
      opponentScore: mySeat === 0 ? row.score_b : row.score_a,
      recordedAt: row.recorded_at,
    };
  });

  return json(request, { matches });
}
