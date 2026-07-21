-- Applied to prod 2026-07-21 via Management API.
-- Season picks are EXPLICIT: picked_at set = user chose this quarter-bucket
-- item as one of the season's 5-8 picks; null = on the bench. Replaces the
-- implicit first-8-by-created_at partition (shipped 2026-07-20, revised same
-- week on Scott's feedback: bets->picks, choice must be manual + swappable).
-- No backfill on purpose: existing season items land on the bench and the
-- user picks their slate — choosing IS the ritual.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS picked_at timestamptz;
