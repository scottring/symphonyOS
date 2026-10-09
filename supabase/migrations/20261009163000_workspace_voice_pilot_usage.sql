-- Pilot starts, not a dollar/token budget. Failed provider handshakes count.
create table if not exists public.workspace_voice_usage (
 user_id uuid not null references auth.users(id) on delete cascade,
 usage_day date not null,
 starts integer not null default 0 check (starts >= 0),
 primary key (user_id, usage_day)
);
alter table public.workspace_voice_usage enable row level security;
revoke all on public.workspace_voice_usage from anon, authenticated;
create or replace function public.reserve_workspace_voice_start()
returns boolean language plpgsql security definer set search_path = '' as $$
declare reserved integer;
begin
 if auth.uid() is null then return false; end if;
 insert into public.workspace_voice_usage (user_id, usage_day, starts)
 values (auth.uid(), (now() at time zone 'UTC')::date, 1)
 on conflict (user_id, usage_day) do update
 set starts = public.workspace_voice_usage.starts + 1
 where public.workspace_voice_usage.starts < 12
 returning starts into reserved;
 return reserved is not null;
end;
$$;
revoke all on function public.reserve_workspace_voice_start() from public, anon;
grant execute on function public.reserve_workspace_voice_start() to authenticated;
