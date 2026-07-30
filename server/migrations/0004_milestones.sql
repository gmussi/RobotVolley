-- Milestone cosmetic rewards (decals + leaderboard auras).
--
-- Four of the five new counters are deliberately plain columns on `stats`
-- rather than a separate achievements table. An unlock set is *derived* from
-- stats (see shared/cosmetics.js) and re-synced after every match, so a
-- milestone expressed as a counter is granted by the machinery that already
-- exists — no new award path, and the client gets live progress for free.
--
-- Leaderboard placements are the exception: a placement is a fact about a
-- finished period, not about an account, so those are granted explicitly by
-- the rollover job in server/src/rollover.js.

ALTER TABLE stats ADD COLUMN win_streak      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stats ADD COLUMN best_win_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stats ADD COLUMN perfect_wins    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stats ADD COLUMN comebacks       INTEGER NOT NULL DEFAULT 0;

-- The winner's largest deficit during the match. A 5-4 scoreline cannot tell a
-- 0-4 comeback from a 4-4 finish, so the peers report this and it is only
-- believed when both agree. NULL means unknown — a forfeit, or a mismatch.
ALTER TABLE matches ADD COLUMN max_deficit INTEGER;

-- What the rollover handed out. This is an audit log, not the source of truth:
-- ownership lives in account_unlocks like every other cosmetic. Keeping it
-- separate means "why do I have this?" is answerable, and a rank reward stays
-- explainable long after the period rows have aged out.
CREATE TABLE IF NOT EXISTS leaderboard_awards (
  period_key  TEXT    NOT NULL,
  account_id  TEXT    NOT NULL REFERENCES accounts(id),
  rank        INTEGER NOT NULL,
  cosmetic_id TEXT    NOT NULL,
  awarded_at  INTEGER NOT NULL,
  PRIMARY KEY (period_key, account_id, cosmetic_id)
);

-- One row per settled period. The rollover checks this before doing anything,
-- which is what makes a retried or overlapping cron a no-op rather than a
-- double award.
CREATE TABLE IF NOT EXISTS leaderboard_settlements (
  period_key TEXT    PRIMARY KEY,
  settled_at INTEGER NOT NULL,
  awarded    INTEGER NOT NULL
);
