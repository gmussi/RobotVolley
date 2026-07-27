/**
 * Leaderboard periods.
 *
 * Boards reset by *starting a new key*, never by deleting rows: a rollover is
 * just the first write of the day landing under tomorrow's key. Nothing to
 * schedule, no downtime, and every past period stays queryable as history.
 *
 * Everything is UTC so a player's board doesn't roll over at a different moment
 * than their opponent's. The server sends `resetsAt` with each response and the
 * client counts down to it, so the timer is honest in every timezone.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** 'd:2026-07-27' — the UTC day containing `ts`. */
export function dailyKey(ts) {
  return `d:${new Date(ts).toISOString().slice(0, 10)}`;
}

/**
 * ISO-8601 week-numbering year and week for `ts`, Monday-based.
 *
 * The ISO rules are worth stating because they surprise people: week 1 is the
 * week containing the first Thursday of January, so 2026-01-01 can belong to
 * week 53 of 2025. Using the calendar year here would produce a key that jumps
 * backwards across New Year.
 */
export function isoWeekParts(ts) {
  const d = new Date(ts);
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Shift to the Thursday of this week; its year is the week-numbering year.
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((date - firstThursday) / (7 * DAY_MS));
  return { year: isoYear, week };
}

/** 'w:2026-W31' — the ISO week containing `ts`. */
export function weeklyKey(ts) {
  const { year, week } = isoWeekParts(ts);
  return `w:${year}-W${String(week).padStart(2, "0")}`;
}

export function periodKey(period, ts) {
  return period === "weekly" ? weeklyKey(ts) : dailyKey(ts);
}

/** Epoch ms at which the current daily period ends (next UTC midnight). */
export function dailyResetsAt(ts) {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + DAY_MS;
}

/** Epoch ms at which the current weekly period ends (next UTC Monday 00:00). */
export function weeklyResetsAt(ts) {
  const d = new Date(ts);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return midnight + (7 - dayNum) * DAY_MS;
}

export function resetsAt(period, ts) {
  return period === "weekly" ? weeklyResetsAt(ts) : dailyResetsAt(ts);
}

/** "4h 12m" / "12m 30s" / "3d 4h" — for the reset countdown. */
export function formatCountdown(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}
