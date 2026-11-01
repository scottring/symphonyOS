// Disposable local PostgreSQL check for 20261101130000_guided_planning.sql.
//
// Run: node scripts/test-guided-planning-rls.mjs --pg-bin /opt/homebrew/opt/postgresql@17/bin [--before]
//   --before  skip the migration (proves the SQL test fails first)
//
// Throwaway cluster on a private Unix socket; stub auth; a minimal schema
// mirroring the live policies read on 2026-11-01. Never contacts a remote
// database. It does not prove the hosted policies: re-read them before applying.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const flag = process.argv.indexOf('--pg-bin')
if (flag < 0 || !process.argv[flag + 1]) throw new Error('Pass --pg-bin.')
const bin = process.argv[flag + 1]
const before = process.argv.includes('--before')
const root = mkdtempSync(join(tmpdir(), 'symphony-guided-'))
const cluster = join(root, 'cluster')
const PORT = '55462'
const psql = (extra) => execFileSync(join(bin, 'psql'), ['-h', root, '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-q', ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const file = (rel) => new URL(rel, import.meta.url).pathname
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
    grant usage on schema public to anon, authenticated;
    create table public.households(id uuid primary key, name text, owner_id uuid);
    create table public.household_members(id uuid primary key default gen_random_uuid(), household_id uuid references public.households(id) on delete cascade not null, user_id uuid references auth.users(id) on delete cascade not null, role text not null default 'member', status text not null default 'pending', unique(household_id,user_id));
    create function public.my_household_user_ids() returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
      select auth.uid() union select hm_b.user_id from household_members hm_a join household_members hm_b on hm_b.household_id = hm_a.household_id where hm_a.user_id = auth.uid() and hm_a.status = 'active' and hm_b.status = 'active' $$;
    create function public.users_share_household(user_a uuid, user_b uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
      select user_a = user_b or exists (select 1 from household_members hm_a join household_members hm_b on hm_a.household_id = hm_b.household_id where hm_a.user_id = user_a and hm_b.user_id = user_b and hm_a.status = 'active' and hm_b.status = 'active') $$;
    create table public.tasks(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), title text);
    create table public.scratchpad_notes(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), body text);
    alter table public.tasks enable row level security;
    create policy own on public.tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  `])
  // Real earlier migrations, unchanged: goal_areas (046) and planning_sessions (2026-06-08).
  psql(['-f', file('../supabase/migrations/2026-06-08_planning_sessions.sql')])
  // 046 also creates goals/goal_actions that need tables we do not mirror; take only goal_areas.
  const g = readFileSync(file('../supabase/migrations/046_goals.sql'), 'utf8')
  psql(['-c', g.slice(g.indexOf('CREATE TABLE goal_areas'), g.indexOf('-- ====', g.indexOf('CREATE POLICY "Users can delete their own goal areas"')))])
  // goals, reduced to the area link: live, goals_area_id_fkey is ON DELETE CASCADE (read 2026-11-01).
  psql(['-c', `create table public.goals(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), area_id uuid null, name text not null);
    alter table public.goals add constraint goals_area_id_fkey foreign key (area_id) references public.goal_areas(id) on delete cascade;`])
  psql(['-c', `grant all on all tables in schema public to authenticated;`])
  if (!before) psql(['-f', file('../supabase/migrations/20261101130000_guided_planning.sql')])
  console.log(psql(['-f', file('../supabase/tests/104_guided_planning_privacy.test.sql')]) || 'SQL test passed')
  if (!before) {
    const onDelete = () => psql(['-At', '-c', `select confdeltype from pg_constraint where conname = 'goals_area_id_fkey'`]).trim()
    if (onDelete() !== 'n') throw new Error(`goals_area_id_fkey should be ON DELETE SET NULL, is ${onDelete()}`)
    psql(['-f', file('../supabase/migrations/rollback/20261101130000_guided_planning.down.sql')])
    if (onDelete() !== 'c') throw new Error(`rollback should restore ON DELETE CASCADE, is ${onDelete()}`)
    psql(['-f', file('../supabase/migrations/20261101130000_guided_planning.sql')])
    if (onDelete() !== 'n') throw new Error(`re-apply should set ON DELETE SET NULL, is ${onDelete()}`)
    console.log('rollback then re-apply: ok')
  }
} catch (e) {
  console.error(String(e.stderr ?? e.message)); code = 1
} finally {
  if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', cluster, '-m', 'immediate', 'stop'], { stdio: 'ignore' })
  rmSync(root, { recursive: true, force: true })
}
process.exit(code)
