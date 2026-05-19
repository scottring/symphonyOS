-- Applied via Management API 2026-05-18 (migration history out of sync).
ALTER TABLE notes ADD COLUMN IF NOT EXISTS timeline_at timestamptz;
