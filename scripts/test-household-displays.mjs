// Disposable local PostgreSQL check for migration 20261015100000_household_displays.sql.
//
// Run: node scripts/test-household-displays.mjs --pg-bin /opt/homebrew/opt/postgresql@17/bin
//
// Always initialises a throwaway cluster on a private Unix socket with stub
// auth.uid()/auth.jwt() and a minimal schema; never reads application
// environment files or contacts a remote database. Proves the pairing,
// claim, read-fence, write-refusal and revocation rules in SQL. It does not
// prove the hosted project's real policies: run the migration there in an
// isolated environment with real JWTs before invitations.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const flag = process.argv.indexOf('--pg-bin')
if (flag < 0 || !process.argv[flag + 1]) throw new Error('Pass --pg-bin pointing to local initdb, pg_ctl and psql binaries.')
const bin = process.argv[flag + 1]
const root = mkdtempSync(join(tmpdir(), 'symphony-displays-'))
const cluster = join(root, 'cluster')
const args = ['-h', root, '-p', '55451', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A']
const sql = (text) => execFileSync(join(bin, 'psql'), [...args, '-c', text], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const fails = (text, pattern) => {
  try { sql(text) } catch (e) { assert.match(String(e.stderr ?? e.message), pattern); return }
  assert.fail(`expected failure matching ${pattern}`)
}

const OWNER = '00000000-0000-0000-0000-000000000001'
const MEMBER = '00000000-0000-0000-0000-000000000002'
const OUTSIDER = '00000000-0000-0000-0000-000000000003'
const DISPLAY = '00000000-0000-0000-0000-00000000000d'
const H1 = '10000000-0000-0000-0000-000000000001'
const H2 = '10000000-0000-0000-0000-000000000002'
const CAL_FAMILY = 'cal-family', CAL_WORK = 'cal-work', CAL_BOTH = 'cal-both'
/** Run `text` as this user. `anon` = an anonymous sign-in (is_anonymous claim). */
const as = (user, text, anon = false) => sql(`set role authenticated; set request.jwt.claim.sub = '${user}'; set request.jwt.claims = '${JSON.stringify({ sub: user, is_anonymous: anon })}'; ${text}`)

let started = false
let checks = 0
const check = (name, run) => { run(); checks++; console.log(`PASS ${name}`) }

try {
  execFileSync(join(bin, 'initdb'), ['-D', cluster, '-U', 'postgres', '--auth=trust', '--no-locale'], { stdio: ['ignore', 'pipe', 'inherit'] })
  execFileSync(join(bin, 'pg_ctl'), ['-D', cluster, '-l', join(root, 'server.log'), '-o', `-k ${root} -h '' -p 55451`, '-w', 'start'], { stdio: 'ignore' })
  started = true
  sql(`create extension if not exists pgcrypto;
    create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema public to anon, authenticated;
    create table public.households(id uuid primary key);
    create table public.household_members(id uuid primary key default gen_random_uuid(), household_id uuid references public.households(id) on delete cascade not null, user_id uuid references auth.users(id) on delete cascade not null, role text not null default 'member' check (role in ('owner','admin','member')), status text not null default 'pending', invited_by uuid, joined_at timestamptz, unique(household_id,user_id));
    create table public.household_invitations(id uuid primary key default gen_random_uuid(), household_id uuid, email text, accepted_at timestamptz, expires_at timestamptz not null default now() + interval '7 days');
    create table public.waitlist(email text, approved_at timestamptz);
    create table public.calendar_domain_mappings(user_id uuid, calendar_id text, domain text);
    create table public.tasks(id uuid primary key default gen_random_uuid(), user_id uuid not null, title text, scope text default 'individual');
    create table public.lists(id uuid primary key default gen_random_uuid(), user_id uuid not null, visibility text default 'self');
    create table public.list_items(id uuid primary key default gen_random_uuid(), list_id uuid, user_id uuid not null, text text, completed boolean default false);
    create table public.scratchpad_notes(id uuid primary key default gen_random_uuid(), user_id uuid not null, body text);
    create table public.family_members(id uuid primary key default gen_random_uuid(), user_id uuid not null, name text);
    alter table public.tasks enable row level security; alter table public.list_items enable row level security; alter table public.scratchpad_notes enable row level security; alter table public.family_members enable row level security; alter table public.lists enable row level security;
    grant all on all tables in schema public to authenticated;
    create function public.my_household_user_ids() returns setof uuid language sql stable security definer as $$
      select auth.uid() union select b.user_id from public.household_members a join public.household_members b on b.household_id = a.household_id where a.user_id = auth.uid() and a.status = 'active' and b.status = 'active' $$;
    create policy r on public.tasks for select using (user_id in (select public.my_household_user_ids()) and scope = 'couple');
    create policy u on public.tasks for update using (user_id in (select public.my_household_user_ids()));
    create policy i on public.tasks for insert with check (user_id = auth.uid());
    create policy d on public.tasks for delete using (user_id in (select public.my_household_user_ids()));
    create policy r on public.family_members for select using (user_id in (select public.my_household_user_ids()));
    create policy u on public.family_members for update using (user_id in (select public.my_household_user_ids()));
    create policy d on public.family_members for delete using (user_id in (select public.my_household_user_ids()));
    create policy r on public.lists for select using (user_id in (select public.my_household_user_ids()));
    create policy a on public.list_items for all using (user_id = auth.uid() or user_id in (select public.my_household_user_ids())) with check (user_id = auth.uid());
    create policy a on public.scratchpad_notes for all using (user_id in (select public.my_household_user_ids())) with check (user_id = auth.uid());
    insert into auth.users values ('${OWNER}'),('${MEMBER}'),('${OUTSIDER}'),('${DISPLAY}');
    insert into public.households values ('${H1}'),('${H2}');
    insert into public.household_members (household_id,user_id,role,status) values ('${H1}','${OWNER}','owner','active'),('${H1}','${MEMBER}','member','active'),('${H2}','${OUTSIDER}','owner','active');
    insert into public.calendar_domain_mappings values ('${OWNER}','${CAL_FAMILY}','family'),('${OWNER}','${CAL_WORK}','work'),('${MEMBER}','${CAL_BOTH}','family'),('${OWNER}','${CAL_BOTH}','personal');
    insert into public.tasks (user_id,title,scope) values ('${OWNER}','Family dinner','couple'),('${OWNER}','Private work thing','individual');
    insert into public.lists (user_id,visibility) values ('${OWNER}','family');
    insert into public.family_members (user_id,name) values ('${OWNER}','Kid');`)
  sql(readFileSync(new URL('../supabase/migrations/20261015100000_household_displays.sql', import.meta.url), 'utf8'))
  sql('select 1;\n' + readFileSync(new URL('../supabase/migrations/20261015130000_signup_allowed_invited.sql', import.meta.url), 'utf8'))

  let code
  check('only an owner or admin can make a pairing code', () => {
    fails(`set role authenticated; set request.jwt.claim.sub = '${MEMBER}'; select public.create_display_pairing_code('Wall')`, /owner or admin/)
    code = JSON.parse(as(OWNER, "select public.create_display_pairing_code('Kitchen wall')")).code
    assert.match(code, /^[A-Z2-9]{6}$/)
  })
  check('an adult account cannot claim a code; an anonymous sign-in can', () => {
    fails(`set role authenticated; set request.jwt.claim.sub = '${OUTSIDER}'; set request.jwt.claims = '{"sub":"${OUTSIDER}","is_anonymous":false}'; select public.claim_display_pairing('${code}')`, /Sign out first/)
    const claimed = JSON.parse(as(DISPLAY, `select public.claim_display_pairing('${code}')`, true))
    assert.equal(claimed.household_id, H1)
    assert.equal(as(DISPLAY, 'select public.my_surface()', true), 'display')
    assert.equal(as(OWNER, 'select public.my_surface()'), 'member')
  })
  check('a used code cannot be claimed twice', () => {
    fails(`set role authenticated; set request.jwt.claim.sub = '${DISPLAY}'; set request.jwt.claims = '{"sub":"${DISPLAY}","is_anonymous":true}'; select public.claim_display_pairing('${code}')`, /already paired|not valid/)
  })
  check('the display reads what the household shares, and nothing private', () => {
    assert.equal(as(DISPLAY, 'select count(*) from public.tasks', true), '1')
    assert.equal(as(DISPLAY, "select title from public.tasks", true), 'Family dinner')
    assert.equal(as(DISPLAY, 'select count(*) from public.family_members', true), '1')
  })
  check('the display gets the household’s family-only calendars', () => {
    const ids = as(DISPLAY, 'select string_agg(c, \',\' order by c) from public.household_family_calendar_ids() c', true)
    assert.equal(ids, CAL_FAMILY)
  })
  check('the display cannot change tasks, people or the household, even where a member could', () => {
    fails(`set role authenticated; set request.jwt.claim.sub = '${DISPLAY}'; set request.jwt.claims = '{"sub":"${DISPLAY}","is_anonymous":true}'; update public.tasks set title = 'x'`, /display cannot change tasks/)
    fails(`set role authenticated; set request.jwt.claim.sub = '${DISPLAY}'; set request.jwt.claims = '{"sub":"${DISPLAY}","is_anonymous":true}'; insert into public.tasks (user_id,title) values ('${DISPLAY}','mine')`, /display cannot change tasks/)
    fails(`set role authenticated; set request.jwt.claim.sub = '${DISPLAY}'; set request.jwt.claims = '{"sub":"${DISPLAY}","is_anonymous":true}'; delete from public.family_members`, /display cannot change family_members/)
    fails(`set role authenticated; set request.jwt.claim.sub = '${DISPLAY}'; set request.jwt.claims = '{"sub":"${DISPLAY}","is_anonymous":true}'; insert into public.household_members (household_id,user_id,role,status) values ('${H2}','${DISPLAY}','member','active')`, /display cannot change household_members/)
    fails(`set role authenticated; set request.jwt.claim.sub = '${DISPLAY}'; set request.jwt.claims = '{"sub":"${DISPLAY}","is_anonymous":true}'; select public.create_display_pairing_code('x')`, /cannot pair/)
    assert.equal(as(OWNER, "update public.tasks set title = 'Family dinner!' where title = 'Family dinner' returning 1"), '1')
  })
  check('the display can still add to a family list and the scratchpad', () => {
    const list = as(OWNER, 'select id from public.lists')
    assert.equal(as(DISPLAY, `insert into public.list_items (list_id,user_id,text) values ('${list}','${DISPLAY}','milk') returning 1`, true), '1')
    assert.equal(as(DISPLAY, `insert into public.scratchpad_notes (user_id,body) values ('${DISPLAY}','call grandma') returning 1`, true), '1')
  })
  check('revoking fails the display closed at once; an outsider cannot revoke', () => {
    const display = as(OWNER, 'select id from public.household_displays')
    fails(`set role authenticated; set request.jwt.claim.sub = '${OUTSIDER}'; select public.revoke_display('${display}')`, /owner or admin/)
    assert.equal(JSON.parse(as(OWNER, `select public.revoke_display('${display}')`)).revoked, true)
    assert.equal(as(DISPLAY, 'select count(*) from public.tasks', true), '0')
    assert.equal(as(DISPLAY, 'select count(*) from public.family_members', true), '0')
    assert.equal(as(DISPLAY, 'select public.my_surface()', true), 'member')
    assert.equal(as(OWNER, 'select count(*) from public.household_displays where revoked_at is not null'), '1')
  })
  check('sign-up: a live household invitation admits its address; expired, used or unknown ones do not', () => {
    sql(`insert into public.household_invitations (household_id, email) values ('${H1}', 'Partner@Example.com');
         insert into public.household_invitations (household_id, email, expires_at) values ('${H1}', 'late@example.com', now() - interval '1 day');
         insert into public.household_invitations (household_id, email, accepted_at) values ('${H1}', 'joined@example.com', now());
         insert into public.waitlist values ('listed@example.com', now()), ('waiting@example.com', null);`)
    assert.equal(sql("select public.signup_allowed('partner@example.com')"), 't')
    assert.equal(sql("select public.signup_allowed('late@example.com')"), 'f')
    assert.equal(sql("select public.signup_allowed('joined@example.com')"), 'f')
    assert.equal(sql("select public.signup_allowed('listed@example.com')"), 't')
    assert.equal(sql("select public.signup_allowed('waiting@example.com')"), 'f')
    assert.equal(sql("select public.signup_allowed('stranger@example.com')"), 'f')
  })
  console.log(`${checks} local PostgreSQL checks passed. No remote database or provider was contacted.`)
} finally {
  if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', cluster, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' })
  rmSync(root, { recursive: true, force: true })
}
