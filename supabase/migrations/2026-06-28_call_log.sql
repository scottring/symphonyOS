-- call_log — records calls Symphony places (Phase 3 of Plan→Execute).
--
-- A row is created the moment a call is requested (status 'requested'); the
-- kid-phone bridge updates it as the call rings/connects/ends (via callStatus).
-- RLS: a user reads only their own call rows. Writes happen via the service
-- role (the place-call edge fn + kid-phone status webhook), so there is no
-- insert/update policy for anon/authenticated.

create table if not exists public.call_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  task_id     text,                       -- loose link to tasks.id (no FK: avoids type coupling)
  call_sid    text,                       -- Twilio Call SID, set once placed
  direction   text not null default 'outbound' check (direction in ('inbound','outbound')),
  mode        text not null default 'bridge' check (mode in ('bridge','agent')),
  to_number   text not null,
  status      text not null default 'requested'
              check (status in ('requested','ringing','connected','completed','failed','no_answer')),
  outcome     text,                       -- free-text result / transcript summary
  started_at  timestamptz,
  ended_at    timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists call_log_user_created_idx on public.call_log (user_id, created_at desc);
create index if not exists call_log_call_sid_idx on public.call_log (call_sid);
create index if not exists call_log_task_idx on public.call_log (task_id);

alter table public.call_log enable row level security;

drop policy if exists "call_log owner can read" on public.call_log;
create policy "call_log owner can read"
  on public.call_log for select
  using (auth.uid() = user_id);
