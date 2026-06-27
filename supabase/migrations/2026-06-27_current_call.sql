-- Caller-ID takeover (kid-phone → wall-v2, Approach B).
-- A single "active call" row the kid-phone edge function upserts and the wall
-- subscribes to via Realtime. Single-household → one singleton row.

create table if not exists public.current_call (
  id          text primary key default 'singleton',
  call_sid    text,
  direction   text check (direction in ('inbound', 'outbound')),
  state       text not null check (state in ('ringing', 'connected', 'ended')),
  name        text,
  number      text,
  photo_url   text,
  at          timestamptz not null default now(),
  expires_at  timestamptz not null
);

alter table public.current_call enable row level security;

-- Authenticated household members may read the active call (display only).
drop policy if exists "read current_call" on public.current_call;
create policy "read current_call"
  on public.current_call for select
  to authenticated
  using (true);

-- No insert/update/delete policy: writes happen only via the service-role
-- edge function (kid-phone-call), which bypasses RLS.

-- Realtime: the wall subscribes to changes on this table.
alter publication supabase_realtime add table public.current_call;
