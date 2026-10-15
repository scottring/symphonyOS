-- Restricted display identity (beta readiness B02, 2026-10-15).
--
-- A kitchen wall used to run on an adult's login and tell the server it was
-- a wall with a request field (`surface: 'wall'`). Anything that could send a
-- request without that field had the adult's whole account. This gives a
-- display its own identity:
--
--   * An owner or admin makes a short-lived pairing code in Settings.
--   * The display signs in anonymously (Supabase anonymous auth; enable
--     `enable_anonymous_sign_ins` on the hosted project) and claims the code.
--   * The claim adds a household_members row with role 'display' and a
--     household_displays row. From then on `public.is_display()` is true for
--     that user: the server treats every request from it as the wall, and the
--     database refuses the writes a wall never makes.
--   * Revoking deletes the membership and marks the display revoked. Reads
--     fail closed at once (my_household_user_ids() no longer includes anyone);
--     the device's remaining session can see nothing but its own empty rows.
--
-- The display can read what the household shares (through the existing
-- household policies) and write only what the wall writes: items on family
-- lists, ticks on them, and scratchpad notes. Everything else is refused by
-- the trigger below, whatever the policy says.

alter table public.household_members drop constraint if exists household_members_role_check;
alter table public.household_members add constraint household_members_role_check
  check (role in ('owner', 'admin', 'member', 'display'));

create table if not exists public.household_displays (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'Kitchen wall',
  paired_by uuid references auth.users(id) on delete set null,
  paired_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);
create index if not exists household_displays_household_idx on public.household_displays(household_id);
alter table public.household_displays enable row level security;
grant select on public.household_displays to authenticated;
-- Members of the household see its displays; only the RPCs below change them.
drop policy if exists "household members see displays" on public.household_displays;
create policy "household members see displays" on public.household_displays
  for select using (
    exists (select 1 from public.household_members hm
            where hm.household_id = household_displays.household_id
              and hm.user_id = (select auth.uid()) and hm.status = 'active'
              and hm.role in ('owner', 'admin', 'member'))
  );

create table if not exists public.display_pairing_codes (
  code text primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null default 'Kitchen wall',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_by uuid references auth.users(id) on delete set null
);
alter table public.display_pairing_codes enable row level security;
-- No direct access at all: the RPCs are the only path.

-- Is the caller a display? STABLE and security definer so policies and
-- triggers can ask without a grant on household_members.
create or replace function public.is_display()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.household_members
                 where user_id = auth.uid() and role = 'display' and status = 'active')
$$;
revoke all on function public.is_display() from public;
grant execute on function public.is_display() to anon, authenticated, service_role;

-- The caller's surface, for edge functions: 'display' or 'member'.
create or replace function public.my_surface()
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.is_display() then 'display' else 'member' end
$$;
revoke all on function public.my_surface() from public;
grant execute on function public.my_surface() to authenticated, service_role;

-- A display's family calendars: the household's calendars mapped to family
-- (and never to work or personal) by any active adult member. The display
-- has no mappings of its own.
create or replace function public.household_family_calendar_ids()
returns setof text language sql stable security definer set search_path = public, pg_temp as $$
  select m.calendar_id
  from public.calendar_domain_mappings m
  where m.user_id in (select public.my_household_user_ids())
  group by m.calendar_id
  having bool_or(m.domain = 'family') and not bool_or(m.domain is distinct from 'family')
$$;
revoke all on function public.household_family_calendar_ids() from public;
grant execute on function public.household_family_calendar_ids() to authenticated, service_role;

-- Owner or admin: a six-character code, good for ten minutes, one display name.
create or replace function public.create_display_pairing_code(p_name text default 'Kitchen wall')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); hh uuid; code text; tries int := 0;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if public.is_display() then raise exception 'A display cannot pair other displays'; end if;
  select household_id into hh from public.household_members
    where user_id = me and status = 'active' and role in ('owner', 'admin') limit 1;
  if hh is null then raise exception 'Only a household owner or admin can pair a display'; end if;
  -- Old codes for this household go; one live code at a time is enough.
  delete from public.display_pairing_codes where household_id = hh and (claimed_at is not null or expires_at < now());
  loop
    -- Letters and digits that are not confused with one another.
    code := upper(substr(translate(encode(gen_random_bytes(6), 'base64'), '+/0O1Il', 'ABCDEFG'), 1, 6));
    begin
      insert into public.display_pairing_codes (code, household_id, name, created_by, expires_at)
      values (code, hh, coalesce(nullif(trim(p_name), ''), 'Kitchen wall'), me, now() + interval '10 minutes');
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 5 then raise exception 'Could not make a code; try again'; end if;
    end;
  end loop;
  return jsonb_build_object('code', code, 'expires_at', now() + interval '10 minutes');
end $$;
revoke all on function public.create_display_pairing_code(text) from public, anon;
grant execute on function public.create_display_pairing_code(text) to authenticated;

-- The display: an anonymous session with no household yet claims a live code.
create or replace function public.claim_display_pairing(p_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); pc record;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  -- Only an anonymous sign-in may become a display: an adult's account must
  -- never be turned into one by typing a code.
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
  insert into public.household_displays (household_id, user_id, name, paired_by)
  values (pc.household_id, me, pc.name, pc.created_by);
  update public.display_pairing_codes set claimed_at = now(), claimed_by = me where code = pc.code;
  return jsonb_build_object('household_id', pc.household_id, 'name', pc.name);
end $$;
revoke all on function public.claim_display_pairing(text) from public, anon;
grant execute on function public.claim_display_pairing(text) to authenticated;

-- Owner or admin: the display stops seeing the household at once.
create or replace function public.revoke_display(p_display_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); d record;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  select * into d from public.household_displays where id = p_display_id;
  if d is null then raise exception 'No such display'; end if;
  if not exists (select 1 from public.household_members
                 where user_id = me and household_id = d.household_id and status = 'active' and role in ('owner', 'admin')) then
    raise exception 'Only a household owner or admin can revoke a display';
  end if;
  delete from public.household_members where user_id = d.user_id and household_id = d.household_id;
  update public.household_displays set revoked_at = now() where id = d.id;
  return jsonb_build_object('revoked', true);
end $$;
revoke all on function public.revoke_display(uuid) from public, anon;
grant execute on function public.revoke_display(uuid) to authenticated;

-- A display may read what the household shares; it may not change it. This
-- trigger refuses every write from a display on the tables a wall never
-- writes, whatever the row policies allow a household member.
create or replace function public.refuse_display_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.is_display() then
    raise exception 'A display cannot change %', tg_table_name using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'tasks', 'routines', 'goals', 'notes', 'contacts', 'family_members', 'households', 'household_members',
    'household_invitations', 'actionable_instances', 'calendar_domain_mappings', 'lists', 'meal_plans',
    'meal_plan_entries', 'recipes', 'chat_sessions', 'attachments', 'projects'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists refuse_display_write on public.%I', t);
      execute format('create trigger refuse_display_write before insert or update or delete on public.%I for each row execute function public.refuse_display_write()', t);
    end if;
  end loop;
end $$;

-- What the wall writes stays open: list_items (add, tick) and scratchpad_notes
-- (a spoken note) have no trigger. Their row policies still apply.

notify pgrst, 'reload schema';
