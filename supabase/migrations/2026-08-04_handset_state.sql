-- Handset off-hook state (kid-phone → wall-v2).
-- Deliberately NOT current_call: that table drives the full-screen caller-ID
-- takeover, and a lifted receiver is not a call. The wall reads this to decide
-- between "pick someone" and "now pick up the phone".

create table if not exists public.handset_state (
  id          text primary key default 'singleton',
  off_hook    boolean not null default false,
  at          timestamptz not null default now(),
  -- Safety net: the ATA sends nothing when the receiver is hung up mid-hold,
  -- so a stale off-hook row must expire on its own.
  expires_at  timestamptz not null
);

alter table public.handset_state enable row level security;

drop policy if exists "read handset_state" on public.handset_state;
create policy "read handset_state"
  on public.handset_state for select
  to authenticated
  using (true);

-- No write policy: only the service-role edge function (kid-phone-call) writes.

alter publication supabase_realtime add table public.handset_state;
