CREATE TABLE IF NOT EXISTS tallies (pin TEXT PRIMARY KEY, doc TEXT NOT NULL, updated INTEGER NOT NULL, name TEXT);
-- Usernames are unique ignoring case; rows from before 2026-11-11 have NULL, which the index allows any number of.
CREATE UNIQUE INDEX IF NOT EXISTS tallies_name ON tallies(name COLLATE NOCASE);
