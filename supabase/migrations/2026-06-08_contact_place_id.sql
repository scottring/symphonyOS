-- Contacts created from a Google Places result remember their place_id so
-- re-picking the same place reuses the contact instead of duplicating it.
-- App-level dedup lives in AssignPicker.handleSelectPlace / useContacts.addContact;
-- the partial index keeps the per-user place lookup fast.
-- Applied to prod via the Management API on 2026-06-08.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS place_id text;
CREATE INDEX IF NOT EXISTS contacts_place_id_idx ON contacts (user_id, place_id) WHERE place_id IS NOT NULL;
