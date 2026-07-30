/**
 * Leaderboard rollover — the job that turns a finished period's standings into
 * cosmetics.
 *
 * Periods themselves need no job: a board "resets" because the next match writes
 * under a new key (see shared/periods.js). Awards are the one thing that does,
 * because "who finished top 3 on Tuesday" is only answerable once Tuesday is
 * over, and `rank` unlocks are the single cosmetic type that cannot be derived
 * from an account's own stats.
 *
 * Two properties matter more than speed here:
 *
 *   Idempotent. A period is settled at most once, recorded in
 *   `leaderboard_settlements`. Cloudflare may retry a cron, two crons may
 *   overlap, and a deploy may replay one — none of that may double-award.
 *
 *   Self-healing. Each run also sweeps the few periods before the last one. A
 *   silently missed cron would otherwise lose a day's awards permanently, and
 *   nobody would notice until a player asked where their aura went.
 *
 * Bots are deliberately *not* excluded. They are normal accounts that rank and
 * appear on the boards by design (see migrations/0002_bot_accounts.sql), so they
 * place and they earn like anyone else.
 */
import { ITEMS } from "../../shared/cosmetics.js";
import { dailyKey, weeklyKey } from "../../shared/periods.js";
import { grantUnlock } from "./db.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Matches required *within the period* to be eligible for its rewards.
 *
 * Without a floor the top of a quiet board is whoever happened to play once,
 * and the rarest cosmetic in the game would be minted on a slow Tuesday. The
 * weekly figure is higher than 7x daily on purpose: a week-long board should
 * reward turning up repeatedly, not one good evening.
 */
export const MIN_MATCHES = { daily: 5, weekly: 20 };

/** How many periods back each run re-checks, to survive a missed cron. */
const LOOKBACK = { daily: 3, weekly: 2 };

/**
 * The reward tiers for a board, richest first.
 *
 * Derived from the catalog rather than listed here, so adding a tier is a pure
 * data change in shared/cosmetics.json.
 */
export function tiersFor(period) {
  return Object.entries(ITEMS)
    .filter(([, item]) => item.unlock?.type === "rank" && item.unlock.board === period)
    .map(([id, item]) => ({ id, top: item.unlock.top }))
    .sort((a, b) => a.top - b.top);
}

/** The period keys immediately before `ts`, most recent first. */
export function previousKeys(period, ts, count = 1) {
  const step = period === "weekly" ? 7 * DAY_MS : DAY_MS;
  const keyFor = period === "weekly" ? weeklyKey : dailyKey;
  return Array.from({ length: count }, (_, i) => keyFor(ts - (i + 1) * step));
}

/**
 * Who gets what, given a board already filtered and ordered.
 *
 * Kept pure and separate from the writes so the rule that actually matters —
 * placing first earns the top-3 and top-10 tiers too — can be checked without a
 * database standing in the way.
 *
 * @param {{id: string, top: number}[]} tiers ascending by `top`
 * @param {string[]} accountIds board order, best first
 */
export function plannedAwards(tiers, accountIds) {
  const out = [];
  for (const [i, accountId] of accountIds.entries()) {
    const rank = i + 1;
    for (const tier of tiers) {
      // Cumulative: a tier is earned by anyone who finished at or above it.
      if (tier.top < rank) continue;
      out.push({ accountId, rank, cosmeticId: tier.id });
    }
  }
  return out;
}

/**
 * Award one already-finished period. Safe to call repeatedly.
 *
 * @returns {Promise<{periodKey: string, settled: boolean, awarded: number}>}
 *   `settled: false` means it had already been done and nothing changed.
 */
export async function settleKey(db, period, key) {
  const done = await db
    .prepare(`SELECT 1 FROM leaderboard_settlements WHERE period_key = ?`)
    .bind(key)
    .first();
  if (done) return { periodKey: key, settled: false, awarded: 0 };

  const tiers = tiersFor(period);
  if (!tiers.length) return { periodKey: key, settled: false, awarded: 0 };
  const deepest = tiers[tiers.length - 1].top;

  // Ordered exactly like the /leaderboard read path, so the ranks players were
  // shown all period are the ranks that get paid.
  const board = await db
    .prepare(
      `SELECT l.account_id, l.points, l.wins, l.matches
       FROM leaderboard l JOIN accounts a ON a.id = l.account_id
       WHERE l.period_key = ? AND a.banned = 0 AND l.matches >= ?
       ORDER BY l.points DESC, l.wins DESC, a.display_name ASC
       LIMIT ?`,
    )
    .bind(key, MIN_MATCHES[period] ?? 0, deepest)
    .all();

  const ts = Date.now();
  let awarded = 0;

  const plan = plannedAwards(tiers, (board.results ?? []).map((r) => r.account_id));
  for (const { accountId, rank, cosmeticId } of plan) {
    if (!(await grantUnlock(db, accountId, cosmeticId))) continue;
    await db
      .prepare(
        `INSERT OR IGNORE INTO leaderboard_awards
           (period_key, account_id, rank, cosmetic_id, awarded_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(key, accountId, rank, cosmeticId, ts)
      .run();
    awarded++;
  }

  // Written last: if anything above threw, the period stays unsettled and the
  // next run's lookback retries it. grantUnlock and the award insert are both
  // idempotent, so a partial retry re-grants harmlessly.
  await db
    .prepare(
      `INSERT OR IGNORE INTO leaderboard_settlements (period_key, settled_at, awarded)
       VALUES (?, ?, ?)`,
    )
    .bind(key, ts, awarded)
    .run();

  return { periodKey: key, settled: true, awarded };
}

/**
 * Settle the period that just ended, plus a short lookback for any the cron
 * missed. `ts` should be a moment inside the *new* period.
 */
export async function settlePeriod(db, period, ts = Date.now()) {
  const results = [];
  for (const key of previousKeys(period, ts, LOOKBACK[period] ?? 1)) {
    results.push(await settleKey(db, period, key));
  }
  return results;
}
