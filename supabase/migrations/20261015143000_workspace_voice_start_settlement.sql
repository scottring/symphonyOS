-- Keep the 12-start pilot cap, but refund refused/failed handshakes exactly once.
-- Only the edge service may settle a reservation: callers cannot refund themselves.
create table public.workspace_voice_start_reservations (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 usage_day date not null,
 state text not null default 'pending' check (state in ('pending','accepted','released'))
);
alter table public.workspace_voice_start_reservations enable row level security;
revoke all on public.workspace_voice_start_reservations from public, anon, authenticated;
create or replace function public.reserve_workspace_voice_start_v2(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or p_id is null then return false; end if;
 -- A duplicate request is not a second authorization to start a provider call.
 insert into public.workspace_voice_start_reservations(id,user_id,usage_day)
 values(p_id,auth.uid(),(now() at time zone 'UTC')::date)
 on conflict do nothing;
 if not found then return false; end if;
 if not public.reserve_workspace_voice_start() then
   delete from public.workspace_voice_start_reservations where id=p_id;
   return false;
 end if;
 return true;
end;
$$;
create or replace function public.settle_workspace_voice_start(p_id uuid,p_user uuid,p_accepted boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare day_to_refund date;
begin
 if p_accepted is null then return; end if;
 update public.workspace_voice_start_reservations
 set state=case when p_accepted then 'accepted' else 'released' end
 where id=p_id and user_id=p_user and state='pending'
 returning usage_day into day_to_refund;
 if found and not p_accepted then
   update public.workspace_voice_usage set starts=greatest(0,starts-1)
   where user_id=p_user and usage_day=day_to_refund;
 end if;
end;
$$;
revoke all on function public.reserve_workspace_voice_start_v2(uuid) from public, anon;
grant execute on function public.reserve_workspace_voice_start_v2(uuid) to authenticated;
revoke all on function public.settle_workspace_voice_start(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.settle_workspace_voice_start(uuid,uuid,boolean) to service_role;
