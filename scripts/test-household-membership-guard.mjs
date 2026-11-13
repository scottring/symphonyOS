// Disposable local PostgreSQL check for 20261113151000_household_membership_guard.sql (after the edition migration).
//
// Run: node scripts/test-household-membership-guard.mjs --pg-bin /opt/homebrew/opt/postgresql@17/bin [--before]
//   --before  skip the migration (proves the SQL test fails first)
//
// Throwaway cluster on a private Unix socket; stub auth, households and a
// household_members table with RLS and the live UPDATE policy read on
// 2026-11-13; the real AI budget migrations and the edition migration applied
// first. Never contacts a remote database.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const flag = process.argv.indexOf('--pg-bin')
if (flag < 0 || !process.argv[flag + 1]) throw new Error('Pass --pg-bin.')
const bin = process.argv[flag + 1]
const before = process.argv.includes('--before')
const root = mkdtempSync(join(tmpdir(), 'symphony-membership-'))
const cluster = join(root, 'cluster')
const PORT = '55464'
const psql = (extra) => execFileSync(join(bin, 'psql'), ['-h', root, '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-q', ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const file = (rel) => new URL(rel, import.meta.url).pathname
const edition = '../supabase/migrations/20261113150000_household_edition.sql'
const migration = '../supabase/migrations/20261113151000_household_membership_guard.sql'
const rollback = '../supabase/migrations/rollback/20261113151000_household_membership_guard.down.sql'
let started = false, code = 0
try {
  execFileSync(join(bin, 'initdb'), ['-D', cluster, '-U', 'postgres', '--auth=trust', '--no-locale'], { stdio: ['ignore', 'pipe', 'inherit'] })
  execFileSync(join(bin, 'pg_ctl'), ['-D', cluster, '-l', join(root, 'server.log'), '-o', `-k ${root} -h '' -p ${PORT}`, '-w', 'start'], { stdio: 'ignore' })
  started = true
  psql(['-c', `create extension if not exists pgcrypto;
    create role anon; create role authenticated; create role service_role; create schema auth;
    grant usage on schema auth to anon, authenticated;
    create table auth.users(id uuid primary key, email text, aud text, role text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '')::text $$;
    grant usage on schema public to anon, authenticated;
    create table public.households(
      id uuid primary key default gen_random_uuid(), name text, owner_id uuid not null references auth.users(id) on delete cascade,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      address text, inbound_token text, timezone text, seasons jsonb, week_starts_on int not null default 0);
    create table public.household_members(id uuid primary key default gen_random_uuid(), household_id uuid references public.households(id) on delete cascade not null, user_id uuid references auth.users(id) on delete cascade not null,
      role text not null default 'member' check (role in ('owner','admin','member','display')), status text not null default 'pending' check (status in ('pending','active','declined')), unique(household_id,user_id));
    alter table public.household_members add column invited_by uuid;
    alter table public.household_members enable row level security;
    create policy "Admins can invite members" on public.household_members for insert
      with check (auth.uid() = invited_by and exists (select 1 from public.household_members hm where hm.household_id = household_members.household_id and hm.user_id = auth.uid() and hm.status = 'active' and hm.role in ('owner', 'admin')));
    create policy "Users can view memberships" on public.household_members for select using (true);
    create function public.is_household_owner_or_admin(p_household uuid)
    returns boolean language sql stable security definer set search_path = public, pg_temp as $f$
      select exists (select 1 from public.households h where h.id = p_household and h.owner_id = auth.uid())
          or exists (select 1 from public.household_members hm
                     where hm.household_id = p_household and hm.user_id = auth.uid()
                       and hm.status = 'active' and hm.role in ('owner', 'admin'))
    $f$;
    grant execute on function public.is_household_owner_or_admin(uuid) to authenticated, service_role;
    create policy "Users can update memberships" on public.household_members for update
      using ((select auth.uid()) = user_id or public.is_household_owner_or_admin(household_id));
    grant all on all tables in schema public to authenticated;
  `])
  // The real AI budget migrations, in order, ending at the one the edition migration replaces.
  for (const m of ['20261014180000_ai_provider_call_allowances', '20261015110000_ai_allowance_all_interactive_routes', '20261015120000_ai_allowance_background_routes',
    '20261015150000_ai_spend_ledger', '20261015160000_ai_household_allowance_defaults', '20261016094000_ai_budget_reservations',
    '20261024120000_ai_route_question_ideas', '20261111120000_ai_budget_minutes_cache_household', '20261111130000_ai_price_sonnet_5_5']) {
    psql(['-f', file(`../supabase/migrations/${m}.sql`)])
  }
  psql(['-f', file(edition)])
  if (!before) psql(['-f', file(migration)])
  console.log(psql(['-o', '/dev/null', '-f', file('../supabase/tests/109_household_membership_guard.test.sql')]) || 'SQL test passed')
  if (!before) {
    const guarded = () => psql(['-At', '-c', `select (select count(*) from pg_trigger where tgname = 'household_members_guard') || ',' || (select count(*) from pg_proc where proname = 'guard_household_membership')`]).trim()
    if (guarded() !== '1,1') throw new Error(`guard should be installed, is ${guarded()}`)
    psql(['-f', file(rollback)])
    if (guarded() !== '0,0') throw new Error(`rollback left the guard behind: ${guarded()}`)
    psql(['-f', file(migration)])
    if (guarded() !== '1,1') throw new Error(`re-apply did not restore the guard: ${guarded()}`)
    console.log(psql(['-o', '/dev/null', '-f', file('../supabase/tests/109_household_membership_guard.test.sql')]) || 'SQL test passed after re-apply')
    console.log('rollback then re-apply: ok')
  }
} catch (e) {
  console.error(String(e.stderr ?? e.message)); code = 1
} finally {
  if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', cluster, '-m', 'immediate', 'stop'], { stdio: 'ignore' })
  rmSync(root, { recursive: true, force: true })
}
process.exit(code)
