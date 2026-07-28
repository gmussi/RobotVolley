-- Matchmaking bots (tools/bot/).
--
-- Bots are normal accounts — they rank, they move Elo, they appear on the
-- boards. This flag exists purely so the matchmaker can give humans priority:
-- a human is never paired with a bot while another human is available, and bots
-- only pair with each other when the queue holds nobody real. See
-- shared/pairing.js.

ALTER TABLE accounts ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0;
