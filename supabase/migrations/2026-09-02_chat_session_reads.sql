-- Discussions: per-person last-read stamp on a shared Discuss thread.
--
-- A thread is "unread" for you when its last message is by someone else and
-- lands after your stamp (or you have no stamp). Written by the client whenever
-- the discussion drawer is open in a visible tab. Own rows only — the stamp
-- says nothing to anyone but its owner.
--
-- Design: docs/superpowers/specs/2026-09-02-discussions-design.md §3

create table if not exists chat_session_reads (
  session_id   uuid not null references chat_sessions(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

alter table chat_session_reads enable row level security;

drop policy if exists chat_session_reads_own on chat_session_reads;
create policy chat_session_reads_own on chat_session_reads
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
