-- Links on calendar events (reservations, docs, agendas), stored alongside the
-- user's event notes. Same TaskLink shape as tasks.links: [{ "url", "title"? }].
ALTER TABLE event_notes ADD COLUMN IF NOT EXISTS links jsonb;
