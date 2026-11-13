// Disposable local PostgreSQL check for 20261113170000_open_signup.sql.
//
// Run: node scripts/test-open-signup.mjs --pg-bin /opt/homebrew/opt/postgresql@17/bin [--before]
//   --before  skip the migration (proves the SQL test fails first: a stranger is refused)
//
// Throwaway cluster on a private Unix socket; stub auth.users and the household
// tables; the real new-account household trigger, the household edition
// migration (and the AI migrations it builds on), and the previous
// signup_allowed. The check_signup_allowed trigger exists on the live database
// but in no migration, so it is created here from check_allowed_signup in
// 20261015170000. Never contacts a remote database.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const flag = process.argv.indexOf('--pg-bin')
if (flag < 0 || !process.argv[flag + 1]) throw new Error('Pass --pg-bin.')
const bin = process.argv[flag + 1]
const before = process.argv.includes('--before')
const root = mkdtempSync(join(tmpdir(), 'symphony-signup-'))
const cluster = join(root, 'cluster')
const PORT = '55464'
const psql = (extra) => execFileSync(join(bin, 'psql'), ['-h', root, '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-q', ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const file = (rel) => new URL(rel, import.meta.url).pathname
const mig = (name) => file(`../supabase/migrations/${name}.sql`)
const migration = mig('20261113170000_open_signup')
const rollback = file('../supabase/migrations/rollback/20261113170000_open_signup.down.sql')
const test = file('../supabase/tests/108_open_signup.test.sql')
let started = false, code = 0
try {
  execFileSync(join(bin, 'initdb'), ['-D', cluster, '-U', 'postgres', '--auth=trust', '--no-locale'], { stdio: ['ignore', 'pipe', 'inherit'] })
  execFileSync(join(bin, 'pg_ctl'), ['-D', cluster, '-l', join(root, 'server.log'), '-o', `-k ${root} -h '' -p ${PORT}`, '-w', 'start'], { stdio: 'ignore' })
  started = true
  psql(['-c', `create extension if not exists pgcrypto;
    create role anon; create role authenticated; create role service_role; create schema auth;
    grant usage on schema auth to anon, authenticated;
    create table auth.users(id uuid primary key, email text, aud text, role text, is_anonymous boolean not null default false);
    create function auth.uid() returns uuid language sql stable as $$ select nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '')::text $$;
    grant usage on schema public to anon, authenticated;
    create table public.households(
      id uuid primary key default gen_random_uuid(), name text, owner_id uuid not null references auth.users(id) on delete cascade,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      address text, inbound_token text, timezone text, seasons jsonb, week_starts_on int not null default 0);
    create table public.household_members(id uuid primary key default gen_random_uuid(), household_id uuid references public.households(id) on delete cascade not null, user_id uuid references auth.users(id) on delete cascade not null,
      role text not null default 'member' check (role in ('owner','admin','member','display')), status text not null default 'pending' check (status in ('pending','active','declined')),
      invited_by uuid, joined_at timestamptz, unique(household_id,user_id));
    create table public.tasks(id uuid primary key default gen_random_uuid(), user_id uuid, week_start date);
    create table public.household_invitations(id uuid primary key default gen_random_uuid(), email text, accepted_at timestamptz, expires_at timestamptz);
    create table public.waitlist(email text, approved_at timestamptz);
    grant all on all tables in schema public to authenticated;
  `])
  for (const m of ['20261014180000_ai_provider_call_allowances', '20261015110000_ai_allowance_all_interactive_routes', '20261015120000_ai_allowance_background_routes',
    '20261015150000_ai_spend_ledger', '20261015160000_ai_household_allowance_defaults', '20261016094000_ai_budget_reservations',
    '20261024120000_ai_route_question_ideas', '20261111120000_ai_budget_minutes_cache_household', '20261111130000_ai_price_sonnet_5_5',
    '20261113150000_household_edition']) psql(['-f', mig(m)])
  psql(['-f', mig('20261111140000_household_for_every_account')])
  psql(['-f', mig('20261015130000_signup_allowed_invited')])
  psql(['-f', mig('20261015170000_signup_gate_allows_anonymous')])
  // Live on the database, in no migration: the trigger that calls the gate.
  psql(['-c', `create trigger check_signup_allowed before insert on auth.users for each row execute function public.check_allowed_signup();`])
  const has = (q) => psql(['-At', '-c', q]).trim()
  const stranger = () => has(`select public.signup_allowed('stranger@example.com')`)
  if (!before) {
    if (stranger() !== 'f') throw new Error('precondition: the allowlist should refuse a stranger before the migration')
    psql(['-f', migration])
  }
  console.log(psql(['-o', '/dev/null', '-f', test]) || 'SQL test passed')
  if (!before) {
    psql(['-f', rollback])
    if (stranger() !== 'f') throw new Error('rollback did not restore the allowlist')
    if (has(`select public.signup_allowed('smkaufman@gmail.com')`) !== 't') throw new Error('rollback lost a named account')
    // The restored gate really refuses a stranger's sign-up row.
    let refused = false
    try { psql(['-c', `insert into auth.users(id, email) values (gen_random_uuid(), 'stranger2@example.com')`]) }
    catch (e) { refused = String(e.stderr).includes('Signups are currently restricted') }
    if (!refused) throw new Error('after rollback a stranger could still sign up')
    psql(['-f', migration])
    if (stranger() !== 't') throw new Error('re-apply did not open signup')
    console.log(psql(['-o', '/dev/null', '-f', test]) || 'SQL test passed after re-apply')
    console.log('rollback restores the allowlist, then re-apply: ok')
  }
} catch (e) {
  console.error(String(e.stderr ?? e.message)); code = 1
} finally {
  if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', cluster, '-m', 'immediate', 'stop'], { stdio: 'ignore' })
  rmSync(root, { recursive: true, force: true })
}
process.exit(code)
