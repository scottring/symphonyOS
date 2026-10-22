-- Kids' tablets (2026-10-21).
--
-- A display can now be paired FOR one family member ("Kaleb's tablet"). It
-- opens that kid's own screen and nothing else. Two things change for every
-- display, and nothing more:
--
--   * Check-offs. A display may mark a routine done or not done for a day,
--     and tick a task complete or not, through the two functions below and
--     no other way. A kid's tablet may do it only for that kid's own items.
--     The rows are written under the routine's or task's owner, as an
--     adult's check-off would be, so the history stays with the household
--     even after the tablet is revoked. The refuse_display_write trigger
--     still refuses every direct write from a display.
--   * Thoughts. A kid's tablet keeps the thoughts a kid saves for later
--     (kid_thoughts). The tablet can add them and see its own kid's; only a
--     grown-up can mark them gone over or delete them.

alter table public.household_displays
  add column if not exists family_member_id uuid references public.family_members(id) on delete set null;
alter table public.display_pairing_codes
  add column if not exists family_member_id uuid references public.family_members(id) on delete set null;
-- How a kid's tablet lays out the day: 'trail' (one thing at a time) or
-- 'list' (everything for now, in any order). Null for a kitchen wall.
alter table public.household_displays
  add column if not exists layout text check (layout in ('trail', 'list'));
alter table public.display_pairing_codes
  add column if not exists layout text check (layout in ('trail', 'list'));

-- The two functions below say they are writing; the trigger lets exactly
-- that through. The setting is transaction-local and a client cannot set it.
create or replace function public.refuse_display_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.is_display() and coalesce(current_setting('symphony.display_check_off', true), '') <> 'on' then
    raise exception 'A display cannot change %', tg_table_name using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

-- The caller's display: its name and the family member it is for (null for
-- a kitchen wall). Null when the caller is not a display.
create or replace function public.my_display()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', d.id, 'name', d.name, 'household_id', d.household_id, 'family_member_id', d.family_member_id, 'layout', d.layout)
  from public.household_displays d
  where d.user_id = auth.uid() and d.revoked_at is null and public.is_display()
  limit 1
$$;
revoke all on function public.my_display() from public, anon;
grant execute on function public.my_display() to authenticated;

-- The family member a kid's tablet is for, or null.
create or replace function public.my_display_member()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select d.family_member_id from public.household_displays d
  where d.user_id = auth.uid() and d.revoked_at is null and public.is_display()
  limit 1
$$;
revoke all on function public.my_display_member() from public, anon;
grant execute on function public.my_display_member() to authenticated;

-- Pairing takes the family member it is for. The one-argument version goes
-- so a call naming only p_name is not ambiguous.
drop function if exists public.create_display_pairing_code(text);
create or replace function public.create_display_pairing_code(p_name text default 'Kitchen wall', p_family_member_id uuid default null, p_layout text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare me uuid := auth.uid(); hh uuid; code text; tries int := 0;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if public.is_display() then raise exception 'A display cannot pair other displays'; end if;
  select household_id into hh from public.household_members
    where user_id = me and status = 'active' and role in ('owner', 'admin') limit 1;
  if hh is null then raise exception 'Only a household owner or admin can pair a display'; end if;
  if p_family_member_id is not null and not exists (
    select 1 from public.family_members fm
    join public.household_members hm on hm.user_id = fm.user_id and hm.household_id = hh and hm.status = 'active'
    where fm.id = p_family_member_id
  ) then
    raise exception 'That person is not in this household';
  end if;
  delete from public.display_pairing_codes where household_id = hh and (claimed_at is not null or expires_at < now());
  loop
    code := upper(substr(translate(encode(gen_random_bytes(6), 'base64'), '+/0O1Il', 'ABCDEFG'), 1, 6));
    begin
      insert into public.display_pairing_codes (code, household_id, name, family_member_id, layout, created_by, expires_at)
      values (code, hh, coalesce(nullif(trim(p_name), ''), 'Kitchen wall'), p_family_member_id,
              case when p_family_member_id is null then null else coalesce(p_layout, 'trail') end, me, now() + interval '10 minutes');
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 5 then raise exception 'Could not make a code; try again'; end if;
    end;
  end loop;
  return jsonb_build_object('code', code, 'expires_at', now() + interval '10 minutes');
end $$;
revoke all on function public.create_display_pairing_code(text, uuid, text) from public, anon;
grant execute on function public.create_display_pairing_code(text, uuid, text) to authenticated;

create or replace function public.claim_display_pairing(p_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); pc record;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'Sign out first: a display uses its own sign-in, not a person''s account';
  end if;
  if exists (select 1 from public.household_members where user_id = me) then
    raise exception 'This display is already paired';
  end if;
  select * into pc from public.display_pairing_codes
    where code = upper(trim(p_code)) and claimed_at is null and expires_at > now()
    for update;
  if pc is null then raise exception 'That code is not valid or has expired'; end if;
  insert into public.household_members (household_id, user_id, role, status, invited_by, joined_at)
  values (pc.household_id, me, 'display', 'active', pc.created_by, now());
  insert into public.household_displays (household_id, user_id, name, family_member_id, layout, paired_by)
  values (pc.household_id, me, pc.name, pc.family_member_id, pc.layout, pc.created_by);
  update public.display_pairing_codes set claimed_at = now(), claimed_by = me where code = pc.code;
  return jsonb_build_object('household_id', pc.household_id, 'name', pc.name, 'family_member_id', pc.family_member_id, 'layout', pc.layout);
end $$;
revoke all on function public.claim_display_pairing(text) from public, anon;
grant execute on function public.claim_display_pairing(text) to authenticated;

-- A display marks a routine done or not done for a day. Optional progress
-- (minutes or a count) for a routine with a target. Shared routines only;
-- a kid's tablet only for routines that are that kid's (or a step whose
-- collection is). Written under the routine's owner.
create or replace function public.display_set_routine_done(p_routine_id uuid, p_date date, p_done boolean, p_progress integer default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare kid uuid; r record; parent record; inst_id uuid;
begin
  if not public.is_display() then raise exception 'Only a display uses this' using errcode = '42501'; end if;
  if p_date is null or p_date < current_date - 7 or p_date > current_date + 7 then
    raise exception 'That day is out of reach' using errcode = '22023';
  end if;
  kid := public.my_display_member();
  select * into r from public.routines where id = p_routine_id;
  if r is null or r.user_id not in (select public.my_household_user_ids())
     or r.scope not in ('couple', 'compound') then
    raise exception 'No such routine' using errcode = '42501';
  end if;
  if kid is not null and not (r.assigned_to = kid or kid = any(coalesce(r.assigned_to_all, '{}'))) then
    select * into parent from public.routines where id = r.parent_routine_id;
    if parent is null or not (parent.assigned_to = kid or kid = any(coalesce(parent.assigned_to_all, '{}'))) then
      raise exception 'This tablet can only check off its own things' using errcode = '42501';
    end if;
  end if;

  perform set_config('symphony.display_check_off', 'on', true);
  select id into inst_id from public.actionable_instances
    where entity_type = 'routine' and entity_id = p_routine_id::text and date = p_date
      and user_id in (select public.my_household_user_ids())
    order by (user_id = r.user_id) desc
    limit 1;
  if inst_id is null then
    if not p_done and p_progress is null then
      perform set_config('symphony.display_check_off', '', true);
      return jsonb_build_object('done', false);
    end if;
    insert into public.actionable_instances (user_id, entity_type, entity_id, date, status, completed_at, progress)
    values (r.user_id, 'routine', p_routine_id::text, p_date,
            case when p_done then 'completed' else 'pending' end,
            case when p_done then now() end, p_progress);
  else
    update public.actionable_instances set
      status = case when p_done then 'completed' else 'pending' end,
      completed_at = case when p_done then coalesce(completed_at, now()) end,
      skipped_at = null,
      progress = coalesce(p_progress, progress)
    where id = inst_id;
  end if;
  perform set_config('symphony.display_check_off', '', true);
  return jsonb_build_object('done', p_done);
end $$;
revoke all on function public.display_set_routine_done(uuid, date, boolean, integer) from public, anon;
grant execute on function public.display_set_routine_done(uuid, date, boolean, integer) to authenticated;

-- A display ticks a shared task complete or not. A kid's tablet only for
-- tasks assigned to that kid.
create or replace function public.display_set_task_done(p_task_id uuid, p_done boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare kid uuid; t record;
begin
  if not public.is_display() then raise exception 'Only a display uses this' using errcode = '42501'; end if;
  kid := public.my_display_member();
  select id, user_id, scope, assigned_to, assigned_to_all into t from public.tasks where id = p_task_id;
  if t is null or t.user_id not in (select public.my_household_user_ids())
     or t.scope not in ('couple', 'compound') then
    raise exception 'No such task' using errcode = '42501';
  end if;
  if kid is not null and not (t.assigned_to = kid or kid = any(coalesce(t.assigned_to_all, '{}'))) then
    raise exception 'This tablet can only check off its own things' using errcode = '42501';
  end if;
  perform set_config('symphony.display_check_off', 'on', true);
  update public.tasks set completed = p_done, completed_at = case when p_done then coalesce(completed_at, now()) end
    where id = p_task_id;
  perform set_config('symphony.display_check_off', '', true);
  return jsonb_build_object('done', p_done);
end $$;
revoke all on function public.display_set_task_done(uuid, boolean) from public, anon;
grant execute on function public.display_set_task_done(uuid, boolean) to authenticated;

-- Thoughts a kid saves for later, gone over with a grown-up at bedtime.
create table if not exists public.kid_thoughts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  family_member_id uuid not null references public.family_members(id) on delete cascade,
  text text not null check (char_length(trim(text)) between 1 and 500),
  kind text check (kind in ('ask', 'later', 'need', 'feeling')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);
create index if not exists kid_thoughts_member_idx on public.kid_thoughts(family_member_id, created_at desc);
alter table public.kid_thoughts enable row level security;
grant select, insert, update, delete on public.kid_thoughts to authenticated;

-- Household members see the household's thoughts; a kid's tablet sees only
-- its own kid's.
drop policy if exists "household sees kid thoughts" on public.kid_thoughts;
create policy "household sees kid thoughts" on public.kid_thoughts
  for select using (
    exists (select 1 from public.household_members hm
            where hm.household_id = kid_thoughts.household_id and hm.user_id = (select auth.uid()) and hm.status = 'active')
    and (not public.is_display() or public.my_display_member() is null or family_member_id = public.my_display_member())
  );
-- Anyone in the household may save one; a kid's tablet only for its kid,
-- and never as already gone over.
drop policy if exists "household saves kid thoughts" on public.kid_thoughts;
create policy "household saves kid thoughts" on public.kid_thoughts
  for insert with check (
    exists (select 1 from public.household_members hm
            where hm.household_id = kid_thoughts.household_id and hm.user_id = (select auth.uid()) and hm.status = 'active')
    and exists (select 1 from public.family_members fm
                join public.household_members hm2 on hm2.user_id = fm.user_id and hm2.household_id = kid_thoughts.household_id and hm2.status = 'active'
                where fm.id = kid_thoughts.family_member_id)
    and (not public.is_display() or (reviewed_at is null and (public.my_display_member() is null or family_member_id = public.my_display_member())))
  );
-- Only grown-ups mark one gone over, or delete it.
drop policy if exists "grown-ups review kid thoughts" on public.kid_thoughts;
create policy "grown-ups review kid thoughts" on public.kid_thoughts
  for update using (
    not public.is_display()
    and exists (select 1 from public.household_members hm
                where hm.household_id = kid_thoughts.household_id and hm.user_id = (select auth.uid()) and hm.status = 'active')
  );
drop policy if exists "grown-ups delete kid thoughts" on public.kid_thoughts;
create policy "grown-ups delete kid thoughts" on public.kid_thoughts
  for delete using (
    not public.is_display()
    and exists (select 1 from public.household_members hm
                where hm.household_id = kid_thoughts.household_id and hm.user_id = (select auth.uid()) and hm.status = 'active')
  );

notify pgrst, 'reload schema';
