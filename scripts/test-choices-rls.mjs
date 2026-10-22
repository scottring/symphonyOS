// Disposable local PostgreSQL check for migration 20261022120000_choices.sql.
//
// Run: node scripts/test-choices-rls.mjs --pg-bin /opt/homebrew/opt/postgresql@17/bin
//
// Always initialises a throwaway cluster on a private Unix socket with stub
// auth.uid()/auth.jwt() and a minimal schema that mirrors the live household
// policies on tasks and goals and the live attachments select policy; never
// reads application environment files or contacts a remote database. Proves
// that a choice, its options and its price lines follow their goal's
// visibility, that option attachments follow the option, and that deleting a
// goal removes its choices. It does not prove the hosted project's real
// policies: re-read them before applying the migration there.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const flag = process.argv.indexOf('--pg-bin')
if (flag < 0 || !process.argv[flag + 1]) throw new Error('Pass --pg-bin pointing to local initdb, pg_ctl and psql binaries.')
const bin = process.argv[flag + 1]
const root = mkdtempSync(join(tmpdir(), 'symphony-choices-'))
const cluster = join(root, 'cluster')
const PORT = '55461'
const args = ['-h', root, '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A']
const sql = (text) => execFileSync(join(bin, 'psql'), [...args, '-c', text], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const fails = (text, pattern) => {
  try { sql(text) } catch (e) { assert.match(String(e.stderr ?? e.message), pattern); return }
  assert.fail(`expected failure matching ${pattern}`)
}

const OWNER = '00000000-0000-0000-0000-000000000001'
const MEMBER = '00000000-0000-0000-0000-000000000002'
const OUTSIDER = '00000000-0000-0000-0000-000000000003'
const H1 = '10000000-0000-0000-0000-000000000001'
const GOAL_FAMILY = '20000000-0000-0000-0000-000000000001' // is_goal task, scope compound
const GOAL_PRIVATE = '20000000-0000-0000-0000-000000000002' // is_goal task, scope individual
const TASK_PLAIN = '20000000-0000-0000-0000-000000000003' // ordinary task, scope compound
const YEAR_GOAL = '30000000-0000-0000-0000-000000000001' // goals row, scope compound
const C_FAMILY = '40000000-0000-0000-0000-000000000001'
const C_PRIVATE = '40000000-0000-0000-0000-000000000002'
const C_YEAR = '40000000-0000-0000-0000-000000000003'
const O_OWNER = '50000000-0000-0000-0000-000000000001'
const O_MEMBER = '50000000-0000-0000-0000-000000000002'
const O_PRIVATE = '50000000-0000-0000-0000-000000000003'
const O_YEAR = '50000000-0000-0000-0000-000000000004'
const FOLLOW_UP = '60000000-0000-0000-0000-000000000001'

const prefix = (user) => `set role authenticated; set request.jwt.claim.sub = '${user}'; set request.jwt.claims = '${JSON.stringify({ sub: user, role: 'authenticated' })}'; `
/** Run `text` as this signed-in user, under RLS. */
const as = (user, text) => sql(prefix(user) + text)
const failsAs = (user, text, pattern) => fails(prefix(user) + text, pattern)
const RLS = /row-level security/
/** How many rows of each choice table this user can see (optionally limited to one tree). */
const counts = (user, where = {}) => ({
  choices: as(user, `select count(*) from public.choices ${where.choices ?? ''}`),
  options: as(user, `select count(*) from public.choice_options ${where.options ?? ''}`),
  lines: as(user, `select count(*) from public.choice_price_lines ${where.lines ?? ''}`),
})

let started = false
let checks = 0
const check = (name, run) => { run(); checks++; console.log(`PASS ${name}`) }

try {
  execFileSync(join(bin, 'initdb'), ['-D', cluster, '-U', 'postgres', '--auth=trust', '--no-locale'], { stdio: ['ignore', 'pipe', 'inherit'] })
  execFileSync(join(bin, 'pg_ctl'), ['-D', cluster, '-l', join(root, 'server.log'), '-o', `-k ${root} -h '' -p ${PORT}`, '-w', 'start'], { stdio: 'ignore' })
  started = true
  const householdRule = `((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids())))`
  sql(`create extension if not exists pgcrypto;
    create role anon; create role authenticated; create role service_role; create schema auth;
    grant usage on schema auth to anon, authenticated;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$;
    grant usage on schema public to anon, authenticated;
    create table public.households(id uuid primary key);
    create table public.household_members(id uuid primary key default gen_random_uuid(), household_id uuid references public.households(id) on delete cascade not null, user_id uuid references auth.users(id) on delete cascade not null, role text not null default 'member', status text not null default 'pending', unique(household_id,user_id));

    -- 20261013170000_rls_household_once.sql
    create function public.my_household_user_ids() returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
      select auth.uid()
      union
      select hm_b.user_id
      from household_members hm_a
      join household_members hm_b on hm_b.household_id = hm_a.household_id
      where hm_a.user_id = auth.uid()
        and hm_a.status = 'active'
        and hm_b.status = 'active' $$;
    -- 027_households.sql (same meaning)
    create function public.users_share_household(user_a uuid, user_b uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
      select user_a = user_b or exists (select 1 from household_members hm_a join household_members hm_b on hm_a.household_id = hm_b.household_id
        where hm_a.user_id = user_a and hm_b.user_id = user_b and hm_a.status = 'active' and hm_b.status = 'active') $$;
    create function public.update_updated_at_column() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
    -- 2026-09-21_owner_immutable.sql
    create function public.guard_owner_immutable() returns trigger language plpgsql set search_path = '' as $$
    begin
      if new.user_id is distinct from old.user_id
         and coalesce(auth.role(), 'service_role') <> 'service_role' then
        raise exception 'user_id is immutable'
          using errcode = '42501',
                hint = 'Assign the item instead of changing its owner.';
      end if;
      return new;
    end $$;
    create function public.journal_reviewed_change() returns trigger language plpgsql as $$ begin return coalesce(new, old); end $$;

    create table public.tasks(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), title text, is_goal boolean not null default false, scope text default 'individual');
    create table public.goals(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), name text, scope text default 'individual');
    create table public.contacts(id uuid primary key default gen_random_uuid(), user_id uuid not null);
    create table public.projects(id uuid primary key default gen_random_uuid(), user_id uuid not null, scope text default 'individual');
    create table public.notes(id uuid primary key default gen_random_uuid(), user_id uuid not null, scope text default 'individual');
    create table public.routines(id uuid primary key default gen_random_uuid(), user_id uuid not null, scope text default 'individual');
    create table public.attachments(id uuid primary key default gen_random_uuid(), user_id uuid not null, entity_type text not null, entity_id text not null, storage_path text not null default 'x');
    alter table public.attachments add constraint attachments_entity_type_check
      check (entity_type in ('task','project','event_note','instance_note','note','routine','document'));
    alter table public.tasks enable row level security; alter table public.goals enable row level security;
    alter table public.contacts enable row level security; alter table public.attachments enable row level security;
    alter table public.projects enable row level security; alter table public.notes enable row level security; alter table public.routines enable row level security;
    grant all on all tables in schema public to authenticated;

    create policy "Users can view tasks" on public.tasks for select using (${householdRule});
    create policy "Users can insert tasks" on public.tasks for insert with check (auth.uid() = user_id);
    create policy "Users can update tasks" on public.tasks for update using (${householdRule}) with check (${householdRule});
    create policy "Users can delete tasks" on public.tasks for delete using (${householdRule});
    create policy "Users can read household goals" on public.goals for select using (${householdRule});
    create policy "Users can insert their own goals" on public.goals for insert with check (auth.uid() = user_id);
    create policy "Users can update household goals" on public.goals for update using (${householdRule}) with check (${householdRule});
    create policy "Users can delete their own goals" on public.goals for delete using (auth.uid() = user_id);
    create policy own on public.contacts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
    create policy own on public.projects for all using (${householdRule});
    create policy own on public.notes for all using (${householdRule});
    create policy own on public.routines for all using (${householdRule});
    -- The live select policy as read on 2026-10-22 (before this migration).
    create policy "Users can view reachable attachments" on public.attachments for select using ((auth.uid() = user_id) OR ((entity_type = 'task'::text) AND (EXISTS ( SELECT 1 FROM tasks t WHERE (((t.id)::text = attachments.entity_id) AND (t.scope = ANY (ARRAY['couple'::text, 'compound'::text])) AND users_share_household(auth.uid(), t.user_id))))) OR ((entity_type = 'project'::text) AND (EXISTS ( SELECT 1 FROM projects p WHERE (((p.id)::text = attachments.entity_id) AND (p.scope = ANY (ARRAY['couple'::text, 'compound'::text])) AND users_share_household(auth.uid(), p.user_id))))) OR ((entity_type = 'note'::text) AND (EXISTS ( SELECT 1 FROM notes n WHERE (((n.id)::text = attachments.entity_id) AND (n.scope = ANY (ARRAY['couple'::text, 'compound'::text])) AND users_share_household(auth.uid(), n.user_id))))) OR ((entity_type = 'routine'::text) AND (EXISTS ( SELECT 1 FROM routines r WHERE (((r.id)::text = attachments.entity_id) AND (r.scope = ANY (ARRAY['couple'::text, 'compound'::text])) AND users_share_household(auth.uid(), r.user_id))))));
    create policy "Users can insert own attachments" on public.attachments for insert with check (auth.uid() = user_id);
    create policy "Users can update own attachments" on public.attachments for update using (auth.uid() = user_id);
    create policy "Users can delete own attachments" on public.attachments for delete using (auth.uid() = user_id);

    insert into auth.users values ('${OWNER}'),('${MEMBER}'),('${OUTSIDER}');
    insert into public.households values ('${H1}');
    insert into public.household_members (household_id,user_id,role,status) values ('${H1}','${OWNER}','owner','active'),('${H1}','${MEMBER}','member','active');
    insert into public.tasks (id,user_id,title,is_goal,scope) values
      ('${GOAL_FAMILY}','${OWNER}','Fix the roof',true,'compound'),
      ('${GOAL_PRIVATE}','${OWNER}','Private goal',true,'individual'),
      ('${TASK_PLAIN}','${OWNER}','Buy milk',false,'compound');
    insert into public.goals (id,user_id,name,scope) values ('${YEAR_GOAL}','${OWNER}','New car this year','compound');`)
  // The migration runs unchanged.
  sql(readFileSync(new URL('../supabase/migrations/20261022120000_choices.sql', import.meta.url), 'utf8'))
  sql(readFileSync(new URL('../supabase/migrations/20261022180000_goal_log.sql', import.meta.url), 'utf8'))

  check('owner creates choice on family goal', () => {
    assert.equal(as(OWNER, `insert into public.choices (id,user_id,goal_task_id,title) values ('${C_FAMILY}','${OWNER}','${GOAL_FAMILY}','Roofer') returning 1`), '1')
    assert.equal(as(OWNER, `insert into public.choice_options (id,choice_id,user_id,name) values ('${O_OWNER}','${C_FAMILY}','${OWNER}','Acme Roofing') returning status`), 'considering')
  })
  check('member sees it', () => {
    assert.deepEqual(counts(MEMBER), { choices: '1', options: '1', lines: '0' })
    assert.equal(as(MEMBER, 'select title from public.choices'), 'Roofer')
  })
  check('outsider sees nothing', () => {
    assert.deepEqual(counts(OUTSIDER), { choices: '0', options: '0', lines: '0' })
    assert.equal(as(OUTSIDER, `update public.choices set title = 'x' returning 1`), '')
    assert.equal(as(OUTSIDER, `delete from public.choice_options returning 1`), '')
    failsAs(OUTSIDER, `insert into public.choice_options (choice_id,user_id,name) values ('${C_FAMILY}','${OUTSIDER}','Sneaky')`, RLS)
    // The goal check runs under the caller's RLS, so a goal they cannot see reads as no goal.
    failsAs(OUTSIDER, `insert into public.choices (user_id,goal_task_id,title) values ('${OUTSIDER}','${GOAL_FAMILY}','Sneaky')`, /A choice belongs to a goal|row-level security/)
    failsAs(OUTSIDER, `insert into public.choices (user_id,goal_id,title) values ('${OUTSIDER}','${YEAR_GOAL}','Sneaky')`, RLS)
  })
  check("member adds option to owner's family choice", () => {
    assert.equal(as(MEMBER, `insert into public.choice_options (id,choice_id,user_id,name) values ('${O_MEMBER}','${C_FAMILY}','${MEMBER}','Best Roofs') returning 1`), '1')
    failsAs(MEMBER, `insert into public.choice_options (choice_id,user_id,name) values ('${C_FAMILY}','${OWNER}','In your name')`, RLS)
    assert.equal(as(OWNER, `select count(*) from public.choice_options where choice_id = '${C_FAMILY}'`), '2')
  })
  check('member adds price line and updates option status', () => {
    assert.equal(as(MEMBER, `insert into public.choice_price_lines (option_id,user_id,work_ids,amount_cents) values ('${O_OWNER}','${MEMBER}','{w1}',1840000) returning amount_cents`), '1840000')
    failsAs(MEMBER, `insert into public.choice_price_lines (option_id,user_id,amount_cents) values ('${O_OWNER}','${OWNER}',1)`, RLS)
    assert.equal(as(MEMBER, `update public.choice_options set status = 'contacted' where id = '${O_OWNER}' returning status`), 'contacted')
    assert.equal(as(MEMBER, `update public.choices set selected_work = '{w1}' where id = '${C_FAMILY}' returning 1`), '1')
    assert.equal(as(OWNER, `select status from public.choice_options where id = '${O_OWNER}'`), 'contacted')
    assert.equal(as(OWNER, 'select count(*) from public.choice_price_lines'), '1')
    fails(prefix(MEMBER) + `update public.choice_options set status = 'maybe' where id = '${O_OWNER}'`, /choice_options_status_check/)
  })
  const privateTree = { choices: `where id = '${C_PRIVATE}'`, options: `where choice_id = '${C_PRIVATE}'`, lines: `where option_id = '${O_PRIVATE}'` }
  check("private goal's choice is owner-only", () => {
    as(OWNER, `insert into public.choices (id,user_id,goal_task_id,title) values ('${C_PRIVATE}','${OWNER}','${GOAL_PRIVATE}','Therapist');
      insert into public.choice_options (id,choice_id,user_id,name) values ('${O_PRIVATE}','${C_PRIVATE}','${OWNER}','Dr. A');
      insert into public.choice_price_lines (option_id,user_id,amount_cents) values ('${O_PRIVATE}','${OWNER}',15000);`)
    assert.deepEqual(counts(OWNER, privateTree), { choices: '1', options: '1', lines: '1' })
    assert.deepEqual(counts(MEMBER, privateTree), { choices: '0', options: '0', lines: '0' })
    assert.deepEqual(counts(OUTSIDER, privateTree), { choices: '0', options: '0', lines: '0' })
    failsAs(MEMBER, `insert into public.choice_options (choice_id,user_id,name) values ('${C_PRIVATE}','${MEMBER}','Dr. B')`, RLS)
    failsAs(MEMBER, `insert into public.choice_price_lines (option_id,user_id,amount_cents) values ('${O_PRIVATE}','${MEMBER}',1)`, RLS)
    assert.equal(as(MEMBER, `update public.choice_options set notes = 'x' where id = '${O_PRIVATE}' returning 1`), '')
  })
  check('goal made private hides choice tree', () => {
    assert.equal(as(OWNER, `update public.tasks set scope = 'individual' where id = '${GOAL_FAMILY}' returning 1`), '1')
    assert.deepEqual(counts(MEMBER), { choices: '0', options: '0', lines: '0' })
    assert.deepEqual(counts(OWNER), { choices: '2', options: '3', lines: '2' })
    failsAs(MEMBER, `insert into public.choice_options (choice_id,user_id,name) values ('${C_FAMILY}','${MEMBER}','Late')`, RLS)
    // Shared again: the tree comes back, member's own rows included.
    as(OWNER, `update public.tasks set scope = 'compound' where id = '${GOAL_FAMILY}'`)
    assert.deepEqual(counts(MEMBER), { choices: '1', options: '2', lines: '1' })
  })
  check('choice on ordinary task is refused', () => {
    failsAs(OWNER, `insert into public.choices (user_id,goal_task_id,title) values ('${OWNER}','${TASK_PLAIN}','Milk brand')`, /A choice belongs to a goal/)
    // Only a direct session can re-point a choice now; it still has to be a goal.
    fails(`update public.choices set goal_task_id = '${TASK_PLAIN}' where id = '${C_FAMILY}'`, /A choice belongs to a goal/)
  })
  check('choice needs exactly one goal', () => {
    // As superuser, so the row reaches the check constraint (signed in, RLS refuses a goalless row first).
    fails(`insert into public.choices (user_id,title) values ('${OWNER}','No goal')`, /choices_check/)
    fails(`insert into public.choices (user_id,goal_task_id,goal_id,title) values ('${OWNER}','${GOAL_FAMILY}','${YEAR_GOAL}','Two goals')`, /choices_check/)
    failsAs(OWNER, `insert into public.choices (user_id,title) values ('${OWNER}','No goal')`, /row-level security|choices_check/)
    failsAs(OWNER, `insert into public.choices (user_id,goal_task_id,goal_id,title) values ('${OWNER}','${GOAL_FAMILY}','${YEAR_GOAL}','Two goals')`, /choices_check/)
  })
  check('year goal choice follows goal visibility', () => {
    assert.equal(as(OWNER, `insert into public.choices (id,user_id,goal_id,title) values ('${C_YEAR}','${OWNER}','${YEAR_GOAL}','Which car') returning 1`), '1')
    assert.equal(as(MEMBER, `insert into public.choice_options (id,choice_id,user_id,name) values ('${O_YEAR}','${C_YEAR}','${MEMBER}','Hatchback') returning 1`), '1')
    const yearTree = { choices: `where id = '${C_YEAR}'`, options: `where choice_id = '${C_YEAR}'`, lines: `where option_id = '${O_YEAR}'` }
    assert.deepEqual(counts(MEMBER, yearTree), { choices: '1', options: '1', lines: '0' })
    assert.deepEqual(counts(OUTSIDER, yearTree), { choices: '0', options: '0', lines: '0' })
    as(OWNER, `update public.goals set scope = 'individual' where id = '${YEAR_GOAL}'`)
    assert.deepEqual(counts(MEMBER, yearTree), { choices: '0', options: '0', lines: '0' })
    assert.deepEqual(counts(OWNER, yearTree), { choices: '1', options: '1', lines: '0' })
    as(OWNER, `update public.goals set scope = 'compound' where id = '${YEAR_GOAL}'`)
    assert.deepEqual(counts(MEMBER, yearTree), { choices: '1', options: '1', lines: '0' })
  })
  const MEMBER_PRIVATE_GOAL = '20000000-0000-0000-0000-000000000004'
  check('member cannot move a choice to another goal', () => {
    as(MEMBER, `insert into public.tasks (id,user_id,title,is_goal,scope) values ('${MEMBER_PRIVATE_GOAL}','${MEMBER}','Member private',true,'individual')`)
    failsAs(MEMBER, `update public.choices set goal_task_id = '${MEMBER_PRIVATE_GOAL}' where id = '${C_FAMILY}'`, /goal_task_id is immutable/)
    failsAs(MEMBER, `update public.choices set goal_task_id = null, goal_id = '${YEAR_GOAL}' where id = '${C_FAMILY}'`, /goal_task_id is immutable/)
    failsAs(OWNER, `update public.choices set goal_id = null, goal_task_id = '${GOAL_FAMILY}' where id = '${C_YEAR}'`, /goal_(task_)?id is immutable/)
    failsAs(MEMBER, `update public.choices set user_id = '${MEMBER}' where id = '${C_FAMILY}'`, /user_id is immutable/)
    assert.equal(as(OWNER, `select count(*) from public.choices where id = '${C_FAMILY}' and goal_task_id = '${GOAL_FAMILY}' and user_id = '${OWNER}'`), '1')
    // Other edits on the same row still work, and a direct session can still re-parent.
    assert.equal(as(MEMBER, `update public.choices set title = 'Roofer (2026)', goal_task_id = '${GOAL_FAMILY}' where id = '${C_FAMILY}' returning title`), 'Roofer (2026)')
    assert.equal(sql(`update public.choices set goal_task_id = '${GOAL_FAMILY}', goal_id = null where id = '${C_YEAR}' returning 1`), '1')
    assert.equal(sql(`update public.choices set goal_task_id = null, goal_id = '${YEAR_GOAL}' where id = '${C_YEAR}' returning 1`), '1')
  })
  check('member cannot move an option to another choice', () => {
    failsAs(MEMBER, `update public.choice_options set choice_id = '${C_YEAR}' where id = '${O_MEMBER}'`, /choice_id is immutable/)
    failsAs(MEMBER, `update public.choice_options set user_id = '${OWNER}' where id = '${O_MEMBER}'`, /user_id is immutable/)
    const line = as(MEMBER, `select id from public.choice_price_lines where option_id = '${O_OWNER}'`)
    failsAs(MEMBER, `update public.choice_price_lines set option_id = '${O_MEMBER}' where id = '${line}'`, /option_id is immutable/)
    failsAs(MEMBER, `update public.choice_price_lines set user_id = '${OWNER}' where id = '${line}'`, /user_id is immutable/)
    assert.equal(as(MEMBER, `update public.choice_price_lines set amount_cents = 1850050 where id = '${line}' returning amount_cents`), '1850050')
    assert.equal(as(OWNER, `select count(*) from public.choice_options where choice_id = '${C_FAMILY}'`), '2')
  })
  check('member sees attachment on shared option', () => {
    assert.equal(as(MEMBER, `insert into public.attachments (user_id,entity_type,entity_id) values ('${MEMBER}','choice_option','${O_OWNER}') returning 1`), '1')
    assert.equal(as(OWNER, `select count(*) from public.attachments where entity_id = '${O_OWNER}'`), '1')
    assert.equal(as(OUTSIDER, `select count(*) from public.attachments where entity_id = '${O_OWNER}'`), '0')
    // An attachment on a private goal's option stays with the owner.
    as(OWNER, `insert into public.attachments (user_id,entity_type,entity_id) values ('${OWNER}','choice_option','${O_PRIVATE}')`)
    assert.equal(as(MEMBER, `select count(*) from public.attachments where entity_id = '${O_PRIVATE}'`), '0')
    // The existing task branch still works.
    as(OWNER, `insert into public.attachments (user_id,entity_type,entity_id) values ('${OWNER}','task','${GOAL_FAMILY}'), ('${OWNER}','task','${GOAL_PRIVATE}')`)
    assert.equal(as(MEMBER, `select count(*) from public.attachments where entity_type = 'task'`), '1')
    fails(`insert into public.attachments (user_id,entity_type,entity_id) values ('${OWNER}','choice','x')`, /attachments_entity_type_check/)
  })
  check('goal log follows the goal: family visible to member, private not, outsider never', () => {
    const E = (user, extra) => `insert into public.goal_log_entries (user_id,${extra.col},kind,happened_on,summary) values ('${user}','${extra.val}','call','2026-10-22','Called Acme') returning 1`
    assert.equal(as(OWNER, E(OWNER, { col: 'goal_task_id', val: GOAL_FAMILY })), '1')
    assert.equal(as(MEMBER, `select count(*) from public.goal_log_entries where goal_task_id = '${GOAL_FAMILY}'`), '1')
    assert.equal(as(OUTSIDER, `select count(*) from public.goal_log_entries`), '0')
    assert.equal(as(OWNER, E(OWNER, { col: 'goal_task_id', val: GOAL_PRIVATE })), '1')
    assert.equal(as(MEMBER, `select count(*) from public.goal_log_entries where goal_task_id = '${GOAL_PRIVATE}'`), '0')
    // The goal check runs first and reads tasks under RLS, so an outsider is refused there.
    failsAs(OUTSIDER, E(OUTSIDER, { col: 'goal_task_id', val: GOAL_FAMILY }), /A choice belongs to a goal/)
  })
  check('goal log: member cannot write as the owner', () => {
    failsAs(MEMBER, `insert into public.goal_log_entries (user_id,goal_task_id,kind,happened_on,summary) values ('${OWNER}','${GOAL_FAMILY}','call','2026-10-22','Spoofed')`, RLS)
  })
  check('goal log: entries cannot be moved to another goal or option', () => {
    failsAs(OWNER, `update public.goal_log_entries set goal_task_id = '${GOAL_PRIVATE}' where goal_task_id = '${GOAL_FAMILY}'`, /goal_task_id is immutable/)
    failsAs(MEMBER, `update public.goal_log_entries set user_id = '${MEMBER}' where goal_task_id = '${GOAL_FAMILY}'`, /user_id is immutable/)
    failsAs(OWNER, `update public.goal_log_entries set choice_option_id = '${O_OWNER}' where goal_task_id = '${GOAL_FAMILY}'`, /choice_option_id is immutable/)
    assert.equal(as(MEMBER, `update public.goal_log_entries set summary = 'Called Acme back' where goal_task_id = '${GOAL_FAMILY}' returning 1`), '1')
  })
  check('goal log: option entries must sit on the option\'s own goal; goal_task_id must be a goal', () => {
    assert.equal(as(OWNER, `insert into public.goal_log_entries (user_id,goal_task_id,choice_option_id,kind,happened_on,summary) values ('${OWNER}','${GOAL_FAMILY}','${O_OWNER}','visit','2026-10-22','Site visit') returning 1`), '1')
    assert.equal(as(MEMBER, `select count(*) from public.goal_log_entries where choice_option_id = '${O_OWNER}'`), '1')
    assert.equal(as(MEMBER, `insert into public.goal_log_entries (user_id,goal_task_id,choice_option_id,kind,happened_on,summary) values ('${MEMBER}','${GOAL_FAMILY}','${O_OWNER}','message','2026-10-22','Texted about the quote') returning 1`), '1')
    failsAs(OWNER, `insert into public.goal_log_entries (user_id,goal_task_id,choice_option_id,kind,happened_on,summary) values ('${OWNER}','${GOAL_PRIVATE}','${O_OWNER}','visit','2026-10-22','Wrong goal')`, /belongs to that option's goal/)
    fails(`insert into public.goal_log_entries (user_id,goal_task_id,choice_option_id,kind,happened_on,summary) values ('${OWNER}','${GOAL_PRIVATE}','${O_OWNER}','visit','2026-10-22','Wrong goal')`, /belongs to that option's goal/)
    fails(`insert into public.goal_log_entries (user_id,goal_task_id,kind,happened_on,summary) values ('${OWNER}','${TASK_PLAIN}','call','2026-10-22','Not a goal')`, /A choice belongs to a goal/)
    fails(`insert into public.goal_log_entries (user_id,goal_task_id,goal_id,kind,happened_on,summary) values ('${OWNER}','${GOAL_FAMILY}','${YEAR_GOAL}','call','2026-10-22','Two')`, /goal_log_entries_check/)
    fails(`insert into public.goal_log_entries (user_id,goal_task_id,kind,happened_on,summary) values ('${OWNER}','${GOAL_FAMILY}','email','2026-10-22','Bad kind')`, /goal_log_entries_kind_check/)
    fails(`insert into public.goal_log_entries (user_id,goal_task_id,kind,happened_on,summary) values ('${OWNER}','${GOAL_FAMILY}','call','2026-10-22','   ')`, /goal_log_entries_summary_check/)
    fails(`update public.tasks set log_kind = 'email' where id = '${TASK_PLAIN}'`, /tasks_log_kind_check/)
  })
  check('goal log: year-goal entries follow the goals row', () => {
    const q = `select count(*) from public.goal_log_entries where goal_id = '${YEAR_GOAL}'`
    assert.equal(as(OWNER, `insert into public.goal_log_entries (user_id,goal_id,choice_option_id,kind,happened_on,summary) values ('${OWNER}','${YEAR_GOAL}','${O_YEAR}','call','2026-10-22','Test drive booked') returning 1`), '1')
    assert.equal(as(MEMBER, q), '1')
    assert.equal(as(OUTSIDER, q), '0')
    as(OWNER, `update public.goals set scope = 'individual' where id = '${YEAR_GOAL}'`)
    assert.equal(as(MEMBER, q), '0')
    assert.equal(as(OWNER, q), '1')
    as(OWNER, `update public.goals set scope = 'compound' where id = '${YEAR_GOAL}'`)
    assert.equal(as(MEMBER, q), '1')
  })
  check('deleting goal deletes choices', () => {
    as(OWNER, `insert into public.tasks (id,user_id,title,scope,choice_option_id) values ('${FOLLOW_UP}','${OWNER}','Call Acme back','compound','${O_OWNER}');
      update public.choices set status = 'decided', chosen_option_id = '${O_OWNER}' where id = '${C_FAMILY}';`)
    assert.equal(as(OWNER, `delete from public.tasks where id = '${GOAL_FAMILY}' returning 1`), '1')
    assert.equal(sql(`select count(*) from public.choices where id = '${C_FAMILY}'`), '0')
    assert.equal(sql(`select count(*) from public.choice_options where id in ('${O_OWNER}','${O_MEMBER}')`), '0')
    assert.equal(sql(`select count(*) from public.choice_price_lines where option_id in ('${O_OWNER}','${O_MEMBER}')`), '0')
    assert.equal(sql(`select coalesce(choice_option_id::text, 'null') from public.tasks where id = '${FOLLOW_UP}'`), 'null')
    // Other goals' choices are untouched; deleting a goals row cascades the same way.
    assert.equal(sql(`select count(*) from public.choices`), '2')
    assert.equal(as(OWNER, `delete from public.goals where id = '${YEAR_GOAL}' returning 1`), '1')
    assert.equal(sql(`select count(*) from public.choices where id = '${C_YEAR}'`), '0')
    assert.equal(sql(`select count(*) from public.choice_options where id = '${O_YEAR}'`), '0')
    assert.equal(sql(`select count(*) from public.goal_log_entries where goal_id = '${YEAR_GOAL}' or goal_task_id = '${GOAL_FAMILY}'`), '0')
    assert.equal(sql(`select count(*) from public.goal_log_entries where goal_task_id = '${GOAL_PRIVATE}'`), '1')
  })
  check('journal triggers exist on choice tables, goal log and contacts', () => {
    assert.equal(sql(`select count(*) from pg_trigger where tgname in ('reviewed_change_before','zz_reviewed_change_after') and tgrelid::regclass::text in ('choices','choice_options','choice_price_lines','contacts','goal_log_entries')`), '10')
    assert.equal(sql(`select count(*) from pg_trigger where tgname in ('reviewed_change_before','zz_reviewed_change_after') and tgrelid::regclass::text = 'contacts'`), '2')
  })
  console.log(`${checks} local PostgreSQL checks passed. No remote database or provider was contacted.`)
} finally {
  if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', cluster, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' })
  rmSync(root, { recursive: true, force: true })
}
