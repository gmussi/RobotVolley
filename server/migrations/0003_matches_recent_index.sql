-- Speeds up "my recent matches" lookups (leaderboard LAST MATCHES tab), which
-- filter by a_account OR b_account and sort by recorded_at.
CREATE INDEX idx_matches_a_account ON matches(a_account, recorded_at DESC);
CREATE INDEX idx_matches_b_account ON matches(b_account, recorded_at DESC);
