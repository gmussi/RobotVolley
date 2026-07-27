-- Accounts, identities and progression.
--
-- The account/identity split is the point of this schema: an account owns the
-- progression (name, stats, unlocks, rank) and knows nothing about platforms.
-- Proving you *are* that account is a separate table with one row per platform,
-- so adding PlayStation/Xbox/Nintendo later is an INSERT, not a migration.

CREATE TABLE accounts (
  id              TEXT PRIMARY KEY,
  display_name    TEXT NOT NULL,
  name_lower      TEXT UNIQUE,
  name_changed_at INTEGER,
  created_at      INTEGER NOT NULL,
  banned          INTEGER NOT NULL DEFAULT 0,
  disputes        INTEGER NOT NULL DEFAULT 0
);

-- provider: 'device' | 'steam' | (later) 'psn' | 'xbox' | 'nintendo' | 'apple' | ...
-- provider_uid: steamID64, device key id, platform account id, ...
CREATE TABLE identities (
  provider     TEXT NOT NULL,
  provider_uid TEXT NOT NULL,
  account_id   TEXT NOT NULL REFERENCES accounts(id),
  linked_at    INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_uid)
);
CREATE INDEX idx_identities_account ON identities(account_id);

CREATE TABLE stats (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id),
  wins       INTEGER NOT NULL DEFAULT 0,
  losses     INTEGER NOT NULL DEFAULT 0,
  matches    INTEGER NOT NULL DEFAULT 0,
  elo        INTEGER NOT NULL DEFAULT 1200,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE account_unlocks (
  account_id  TEXT NOT NULL REFERENCES accounts(id),
  cosmetic_id TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, cosmetic_id)
);

CREATE TABLE account_loadout (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id),
  json       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- period_key: 'd:2026-07-27' (UTC day) or 'w:2026-W31' (ISO week, Monday start).
-- Resets happen by starting a new key, never by deleting rows, so past periods
-- stay queryable as history and a rollover needs no downtime.
CREATE TABLE leaderboard (
  period_key TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  points     INTEGER NOT NULL DEFAULT 0,
  wins       INTEGER NOT NULL DEFAULT 0,
  matches    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (period_key, account_id)
);
CREATE INDEX idx_lb_rank ON leaderboard(period_key, points DESC);

-- Audit trail, dual-report join table, and replay protection all at once: the
-- room_id primary key makes a repeated report a no-op rather than a double count.
CREATE TABLE matches (
  room_id       TEXT PRIMARY KEY,
  a_account     TEXT,
  b_account     TEXT,
  winner_seat   INTEGER,
  score_a       INTEGER,
  score_b       INTEGER,
  duration_ms   INTEGER,
  reported_by   TEXT,                 -- account_id of the first reporter
  status        TEXT NOT NULL,        -- 'pending' | 'recorded' | 'disputed'
  created_at    INTEGER NOT NULL,
  recorded_at   INTEGER
);
CREATE INDEX idx_matches_status ON matches(status);

CREATE TABLE link_codes (
  code       TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  expires_at INTEGER NOT NULL
);
