-- Someone outside the task waits on us for it (Scott, 2026-11-10): the
-- kitchen wall's "Waiting on us", set from Today's week sheet. Free text.
alter table tasks add column if not exists owed_to text;
