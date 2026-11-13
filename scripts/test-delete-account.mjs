// Disposable local PostgreSQL check for 20261113160000_delete_account_data.sql.
//
// Run: node scripts/test-delete-account.mjs --pg-bin /opt/homebrew/opt/postgresql@17/bin [--before]
//   --before  skip the migration (proves the SQL test fails first)
//
// Throwaway cluster on a private Unix socket. The stub schema mirrors the live
// foreign-key shapes the function depends on (live reads of 2026-11-13 and the
// migrations): households.owner_id, household_members.user_id and the content
// tables' user_id cascade from auth.users; family_members, chat_sessions,
// evening_reflections, spaces.created_by, assets.created_by and two playbook
// tables have no delete action (NOT NULL); school_mail_reviews.reviewed_by has
// none and is nullable; tasks.parent_task_id and routines.parent_routine_id
// cascade (016_subtasks.sql, 2026-06-24_routine_parent_steps.sql);
// task_focus.user_id has no foreign key. Deliberately absent, to prove the
// function skips what does not exist: the notices and kid_math_problems
// tables, and kid_math_prefs.user_id. The nullable no-action references to
// family_members (tasks/routines/event_notes.assigned_to,
// actionable_instances.assigned_to_override) and the NOT NULL one from
// screen_time_entries mirror the live database. The real owner-immutable,
// AI budget, edition and membership-guard migrations are applied on top.
// Never contacts a remote database.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const flag = process.argv.indexOf('--pg-bin')
if (flag < 0 || !process.argv[flag + 1]) throw new Error('Pass --pg-bin.')
const bin = process.argv[flag + 1]
const before = process.argv.includes('--before')
const root = mkdtempSync(join(tmpdir(), 'symphony-delete-account-'))
const cluster = join(root, 'cluster')
const PORT = '55465'
const psql = (extra) => execFileSync(join(bin, 'psql'), ['-h', root, '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-q', ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const file = (rel) => new URL(rel, import.meta.url).pathname
const migration = '../supabase/migrations/20261113160000_delete_account_data.sql'
const rollback = '../supabase/migrations/rollback/20261113160000_delete_account_data.down.sql'
const test = '../supabase/tests/107_delete_account.test.sql'
let started = false, code = 0
try {
  execFileSync(join(bin, 'initdb'), ['-D', cluster, '-U', 'postgres', '--auth=trust', '--no-locale'], { stdio: ['ignore', 'pipe', 'inherit'] })
  execFileSync(join(bin, 'pg_ctl'), ['-D', cluster, '-l', join(root, 'server.log'), '-o', `-k ${root} -h '' -p ${PORT}`, '-w', 'start'], { stdio: 'ignore' })
  started = true
  psql(['-c', `create extension if not exists pgcrypto;
    create role anon; create role authenticated; create role service_role; create schema auth;
    grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users(id uuid primary key, email text, aud text, role text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '')::text $$;
    grant usage on schema public to anon, authenticated, service_role;

    create table public.households(
      id uuid primary key default gen_random_uuid(), name text, owner_id uuid not null references auth.users(id) on delete cascade,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      address text, inbound_token text, timezone text, seasons jsonb, week_starts_on int not null default 0);
    create table public.household_members(id uuid primary key default gen_random_uuid(), household_id uuid references public.households(id) on delete cascade not null, user_id uuid references auth.users(id) on delete cascade not null,
      role text not null default 'member' check (role in ('owner','admin','member','display')), status text not null default 'pending' check (status in ('pending','active','declined')),
      invited_by uuid references auth.users(id) on delete set null, joined_at timestamptz, created_at timestamptz not null default now(), unique(household_id,user_id));
    create table public.household_displays(id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
      user_id uuid not null unique references auth.users(id) on delete cascade, paired_by uuid references auth.users(id) on delete set null);
    create function public.is_household_owner_or_admin(p_household uuid)
    returns boolean language sql stable security definer set search_path = public, pg_temp as $f$
      select exists (select 1 from public.households h where h.id = p_household and h.owner_id = auth.uid())
          or exists (select 1 from public.household_members hm where hm.household_id = p_household and hm.user_id = auth.uid()
                       and hm.status = 'active' and hm.role in ('owner', 'admin'))
    $f$;
    create function public.users_share_household(user_a uuid, user_b uuid)
    returns boolean language sql security definer stable set search_path = public, pg_temp as $f$
      select user_a = user_b or exists (select 1 from public.household_members hm_a join public.household_members hm_b on hm_a.household_id = hm_b.household_id
        where hm_a.user_id = user_a and hm_b.user_id = user_b and hm_a.status = 'active' and hm_b.status = 'active')
    $f$;

    -- Shared by scope.
    create table public.tasks(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
      scope text not null default 'individual', title text, parent_task_id uuid references public.tasks(id) on delete cascade);
    create table public.routines(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
      scope text not null default 'individual', name text, parent_routine_id uuid references public.routines(id) on delete cascade);
    create table public.notes(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, scope text not null default 'individual', title text);
    create table public.goal_areas(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, context text, name text);
    create table public.goals(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
      scope text not null default 'individual', name text, area_id uuid references public.goal_areas(id) on delete set null);
    create table public.contacts(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, scope text not null default 'individual', name text);
    create table public.projects(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, scope text not null default 'individual', name text);
    create table public.chat_sessions(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), scope text not null default 'individual', title text);

    -- Shared by ownership.
    create table public.family_members(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
      auth_user_id uuid references auth.users(id) on delete set null, name text);
    create table public.recipes(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, title text);
    create table public.meal_plans(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, week_start date not null, unique (user_id, week_start));
    create table public.meal_plan_entries(id uuid primary key default gen_random_uuid(), meal_plan_id uuid not null references public.meal_plans(id) on delete cascade,
      recipe_id uuid references public.recipes(id) on delete set null, ad_hoc_title text);
    create table public.scratchpad_notes(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, body text);
    create table public.captures(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
      household_id uuid references public.households(id) on delete set null, body text);
    create table public.homes(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text);
    create table public.spaces(id uuid primary key default gen_random_uuid(), home_id uuid not null references public.homes(id) on delete cascade,
      created_by uuid not null references auth.users(id), name text);
    create table public.assets(id uuid primary key default gen_random_uuid(), home_id uuid not null references public.homes(id) on delete cascade,
      space_id uuid references public.spaces(id) on delete set null, created_by uuid not null references auth.users(id), name text);

    -- Live: these point at family_members(id) with no delete action (2026-11-13 read).
    alter table public.tasks add column assigned_to uuid references public.family_members(id);
    alter table public.routines add column assigned_to uuid references public.family_members(id);
    create table public.event_notes(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
      assigned_to uuid references public.family_members(id), body text);
    create table public.actionable_instances(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
      assigned_to_override uuid references public.family_members(id));
    create table public.screen_time_entries(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
      family_member_id uuid not null references public.family_members(id), minutes int);
    -- In the move list but without a user_id column here: skipped, not an error.
    create table public.kid_math_prefs(member_id uuid primary key references public.family_members(id) on delete cascade);

    -- Private, no delete action.
    create table public.evening_reflections(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), body text);
    create table public.school_mail_reviews(capture_id uuid primary key references public.captures(id) on delete cascade, reviewed_by uuid references auth.users(id));
    create table public.playbook_blocks(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id));
    create table public.playbook_instances(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
      block_id uuid references public.playbook_blocks(id));
    create table public.task_focus(user_id uuid not null, task_id uuid);

    -- The live read and update predicate for scoped tables; the update policies are what the owner-immutable migration alters.
    do $d$
    declare t text;
    begin
      foreach t in array array['tasks', 'routines', 'notes', 'projects', 'contacts', 'goals'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format($p$create policy %I on public.%I for select using (auth.uid() = user_id or (scope in ('couple', 'compound') and public.users_share_household(auth.uid(), user_id)))$p$,
          'Users can read ' || t, t);
        execute format('create policy %I on public.%I for update using (auth.uid() = user_id)',
          case t when 'goals' then 'Users can update household goals' else 'Users can update ' || t end, t);
      end loop;
    end $d$;
    grant all on all tables in schema public to authenticated;
  `])
  // The live guard that refuses a user_id change unless the request is service_role (or has no JWT).
  psql(['-f', file('../supabase/migrations/2026-09-21_owner_immutable.sql')])
  // The real AI budget migrations (ai_spend is kept on purpose), then the two membership migrations.
  for (const m of ['20261014180000_ai_provider_call_allowances', '20261015110000_ai_allowance_all_interactive_routes', '20261015120000_ai_allowance_background_routes',
    '20261015150000_ai_spend_ledger', '20261015160000_ai_household_allowance_defaults', '20261016094000_ai_budget_reservations',
    '20261024120000_ai_route_question_ideas', '20261111120000_ai_budget_minutes_cache_household', '20261111130000_ai_price_sonnet_5_5',
    '20261113150000_household_edition', '20261113151000_household_membership_guard']) {
    psql(['-f', file(`../supabase/migrations/${m}.sql`)])
  }
  if (!before) psql(['-f', file(migration)])
  console.log(psql(['-o', '/dev/null', '-f', file(test)]) || 'SQL test passed')
  if (!before) {
    const installed = () => psql(['-At', '-c', `select count(*) from pg_proc where proname = 'delete_account_data'`]).trim()
    if (installed() !== '1') throw new Error(`function should be installed, count is ${installed()}`)
    psql(['-f', file(rollback)])
    if (installed() !== '0') throw new Error(`rollback left the function behind: ${installed()}`)
    psql(['-f', file(migration)])
    if (installed() !== '1') throw new Error(`re-apply did not restore the function: ${installed()}`)
    console.log(psql(['-o', '/dev/null', '-f', file(test)]) || 'SQL test passed after re-apply')
    console.log('rollback then re-apply: ok')
  }
} catch (e) {
  console.error(String(e.stderr ?? e.message)); code = 1
} finally {
  if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', cluster, '-m', 'immediate', 'stop'], { stdio: 'ignore' })
  rmSync(root, { recursive: true, force: true })
}
process.exit(code)
