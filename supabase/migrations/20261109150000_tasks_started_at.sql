-- A task someone has started (Scott, 2026-11-09: Today's week sheet needs to
-- say what is in progress). Null means not started. Who is doing it is the
-- task's existing assignment; what it waits on is the existing is_waiting and
-- waiting_for.
alter table tasks add column if not exists started_at timestamptz;
