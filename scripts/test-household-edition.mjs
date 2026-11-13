// Disposable local PostgreSQL check for 20261113150000_household_edition.sql.
//
// Run: node scripts/test-household-edition.mjs --pg-bin /opt/homebrew/opt/postgresql@17/bin [--before]
//   --before  skip the migration (proves the SQL test fails first)
//
// Throwaway cluster on a private Unix socket; stub auth and a minimal
// households table mirroring the live columns read on 2026-11-13; the real AI
// budget migrations applied on top. Never contacts a remote database.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const flag = process.argv.indexOf('--pg-bin')
if (flag < 0 || !process.argv[flag + 1]) throw new Error('Pass --pg-bin.')
const bin = process.argv[flag + 1]
const before = process.argv.includes('--before')
const root = mkdtempSync(join(tmpdir(), 'symphony-edition-'))
const cluster = join(root, 'cluster')
const PORT = '55463'
const psql = (extra) => execFileSync(join(bin, 'psql'), ['-h', root, '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-q', ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const file = (rel) => new URL(rel, import.meta.url).pathname
const migration = '../supabase/migrations/20261113150000_household_edition.sql'
const rollback = '../supabase/migrations/rollback/20261113150000_household_edition.down.sql'
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
    grant all on all tables in schema public to authenticated;
  `])
  // The real AI budget migrations, in order, ending at the one the edition migration replaces.
  for (const m of ['20261014180000_ai_provider_call_allowances', '20261015110000_ai_allowance_all_interactive_routes', '20261015120000_ai_allowance_background_routes',
    '20261015150000_ai_spend_ledger', '20261015160000_ai_household_allowance_defaults', '20261016094000_ai_budget_reservations',
    '20261024120000_ai_route_question_ideas', '20261111120000_ai_budget_minutes_cache_household', '20261111130000_ai_price_sonnet_5_5']) {
    psql(['-f', file(`../supabase/migrations/${m}.sql`)])
  }
  // A household that exists before the migration (with a member) must read 'full' afterwards.
  const OLD_USER = '00000000-0000-0000-0000-0000000000a1', OLD_HH = '10000000-0000-0000-0000-0000000000a1'
  psql(['-c', `insert into auth.users(id, email) values ('${OLD_USER}', 'old@example.com');
    insert into public.households(id, owner_id) values ('${OLD_HH}', '${OLD_USER}');
    insert into public.household_members(household_id, user_id, role, status) values ('${OLD_HH}', '${OLD_USER}', 'owner', 'active');`])
  const oldEdition = () => psql(['-At', '-c', `select edition from public.households where id = '${OLD_HH}'`]).trim()
  if (!before) {
    psql(['-f', file(migration)])
    if (oldEdition() !== 'full') throw new Error(`existing household should be full after the migration, is ${oldEdition()}`)
  }
  console.log(psql(['-o', '/dev/null', '-f', file('../supabase/tests/106_household_edition.test.sql')]) || 'SQL test passed')
  if (!before) {
    const has = (what) => psql(['-At', '-c', what]).trim()
    const column = () => has(`select count(*) from information_schema.columns where table_name='households' and column_name='edition'`)
    const refusal = () => has(`select pg_get_functiondef('public.reserve_ai_budget(uuid,text,text,bigint,bigint,numeric,numeric)'::regprocedure) like '%light_edition%'`)
    psql(['-f', file(rollback)])
    if (column() !== '0' || refusal() !== 'f') throw new Error('rollback left the column or the refusal behind')
    if (has(`select count(*) from pg_proc where proname in ('my_edition','guard_household_edition')`) !== '0') throw new Error('rollback left a function behind')
    psql(['-f', file(migration)])
    if (oldEdition() !== 'full') throw new Error(`existing household should be full after re-apply, is ${oldEdition()}`)
    if (column() !== '1' || refusal() !== 't') throw new Error('re-apply did not restore the column and the refusal')
    console.log(psql(['-o', '/dev/null', '-f', file('../supabase/tests/106_household_edition.test.sql')]) || 'SQL test passed after re-apply')
    console.log('rollback then re-apply: ok')
  }
} catch (e) {
  console.error(String(e.stderr ?? e.message)); code = 1
} finally {
  if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', cluster, '-m', 'immediate', 'stop'], { stdio: 'ignore' })
  rmSync(root, { recursive: true, force: true })
}
process.exit(code)
