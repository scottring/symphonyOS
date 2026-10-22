// Disposable local PostgreSQL check: chat-card Undo of choice changes through
// the real reviewed-change journal (20261016100000_reviewed_change_recovery.sql)
// with the choices migration (20261022120000_choices.sql) on top.
//
// Run: node scripts/test-choices-undo.mjs --pg-bin /opt/homebrew/opt/postgresql@17/bin
//
// Same throwaway cluster as scripts/test-choices-rls.mjs (private Unix socket,
// stub auth, the live household policies on tasks and goals), on its own port.
// Each case writes what the change card's writers write for one card, in the
// order applyChangeSet writes it, under the card's x-symphony-command header,
// then finishes and undoes it as the signed-in person. It also shows why chat
// refuses choosing an option the same card adds to an existing choice: the
// journal's Undo refuses it. Never reads application environment files or
// contacts a remote database.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const flag = process.argv.indexOf('--pg-bin')
if (flag < 0 || !process.argv[flag + 1]) throw new Error('Pass --pg-bin pointing to local initdb, pg_ctl and psql binaries.')
const bin = process.argv[flag + 1]
const root = mkdtempSync(join(tmpdir(), 'symphony-choices-undo-'))
const cluster = join(root, 'cluster')
const PORT = '55462'
const args = ['-h', root, '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A']
const sql = (text) => execFileSync(join(bin, 'psql'), [...args, '-c', text], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

const OWNER = '00000000-0000-0000-0000-000000000001'
const MEMBER = '00000000-0000-0000-0000-000000000002'
const OUTSIDER = '00000000-0000-0000-0000-000000000003'
const H1 = '10000000-0000-0000-0000-000000000001'
const GOAL_FAMILY = '20000000-0000-0000-0000-000000000001' // is_goal task, scope compound
const GOAL_PRIVATE = '20000000-0000-0000-0000-000000000002' // is_goal task, scope individual
const TASK_PLAIN = '20000000-0000-0000-0000-000000000003' // ordinary task, scope compound
const YEAR_GOAL = '30000000-0000-0000-0000-000000000001' // goals row, scope compound

const prefix = (user) => `set role authenticated; set request.jwt.claim.sub = '${user}'; set request.jwt.claims = '${JSON.stringify({ sub: user, role: 'authenticated' })}'; `
/** Run `text` as this signed-in user, under RLS. */
const as = (user, text) => sql(prefix(user) + text)

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
    -- The tables the journal migration puts its triggers on, beyond tasks, goals and routines.
    create table public.task_commitments(id uuid primary key default gen_random_uuid()); create table public.task_focus(task_id uuid, user_id uuid, date date);
    create table public.actionable_instances(id uuid primary key default gen_random_uuid()); create table public.list_items(id uuid primary key default gen_random_uuid());

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
  sql(readFileSync(new URL('../supabase/migrations/20261016100000_reviewed_change_recovery.sql', import.meta.url), 'utf8'))
  sql(readFileSync(new URL('../supabase/migrations/20261022120000_choices.sql', import.meta.url), 'utf8'))
  sql(readFileSync(new URL('../supabase/migrations/20261022180000_goal_log.sql', import.meta.url), 'utf8'))

  // One change card: begun, written under its header, finished; then Undo.
  let n = 0
  const card = (writes) => {
    const c = JSON.parse(as(OWNER, `select public.begin_reviewed_change('card-${++n}', '{}'::jsonb)`))
    const header = `set request.headers = '${JSON.stringify({ 'x-symphony-command': c.id, 'x-symphony-attempt': c.attempt })}'; `
    as(OWNER, header + writes)
    as(OWNER, `select public.finish_reviewed_change('${c.id}','${c.attempt}','[]'::jsonb)`)
    return { undo: () => as(OWNER, `select public.undo_reviewed_change('${c.id}','${c.attempt}')`) }
  }
  const one = (q) => sql(q)
  const optionStatus = (id) => one(`select status from public.choice_options where id = '${id}'`)
  const decision = (id) => one(`select status || '|' || coalesce(chosen_option_id::text, '-') || '|' || coalesce(decided_note, '-') from public.choices where id = '${id}'`)

  // An existing choice with two options, made before any card.
  const C = '40000000-0000-0000-0000-0000000000aa'
  const MARTINEZ = '50000000-0000-0000-0000-0000000000a1'
  const HARBOR = '50000000-0000-0000-0000-0000000000a2'
  as(OWNER, `insert into public.choices (id,user_id,goal_task_id,title) values ('${C}','${OWNER}','${GOAL_FAMILY}','Contractor');
    insert into public.choice_options (id,choice_id,user_id,name,status) values ('${MARTINEZ}','${C}','${OWNER}','Martinez','heard_back'), ('${HARBOR}','${C}','${OWNER}','Harbor','contacted');`)

  check('new choice, option, line, column and choose in one card: Undo removes it all', () => {
    const N = '40000000-0000-0000-0000-0000000000bb', SHOP = '50000000-0000-0000-0000-0000000000b1'
    const { undo } = card(`insert into public.choices (id,user_id,goal_task_id,title) values ('${N}','${OWNER}','${GOAL_FAMILY}','Tile');
      update public.choices set columns = '[{"id":"c1","label":"Warranty","kind":"text"}]' where id = '${N}';
      insert into public.choice_options (id,choice_id,user_id,name) values ('${SHOP}','${N}','${OWNER}','Shop');
      insert into public.choice_price_lines (option_id,user_id,amount_cents) values ('${SHOP}','${OWNER}',184000);
      update public.choice_options set status = 'chosen', status_changed_at = now() where id = '${SHOP}';
      update public.choices set status = 'decided', chosen_option_id = '${SHOP}', decided_at = now(), decided_amount_cents = 184000 where id = '${N}';`)
    assert.equal(decision(N), `decided|${SHOP}|-`)
    assert.equal(undo(), 't')
    assert.equal(one(`select count(*) from public.choices where id = '${N}'`), '0')
    assert.equal(one(`select count(*) from public.choice_options where id = '${SHOP}'`), '0')
    assert.equal(one(`select count(*) from public.choice_price_lines where option_id = '${SHOP}'`), '0')
  })

  check('choose an existing option on an existing choice: Undo reopens it and puts the status back', () => {
    const { undo } = card(`update public.choice_options set status = 'chosen', status_changed_at = now() where id = '${MARTINEZ}';
      update public.choices set status = 'decided', chosen_option_id = '${MARTINEZ}', decided_at = now(), decided_note = 'Earliest start' where id = '${C}';`)
    assert.equal(decision(C), `decided|${MARTINEZ}|Earliest start`)
    assert.equal(undo(), 't')
    assert.equal(decision(C), 'open|-|-')
    assert.equal(optionStatus(MARTINEZ), 'heard_back')
  })

  check('choose again on a decided choice: Undo puts back both options and the first decision', () => {
    // Decided outside any card (the app), then a card chooses Harbor instead.
    as(OWNER, `update public.choice_options set status = 'chosen' where id = '${MARTINEZ}';
      update public.choices set status = 'decided', chosen_option_id = '${MARTINEZ}', decided_at = now(), decided_note = 'Earliest start' where id = '${C}';`)
    const { undo } = card(`update public.choice_options set status = 'heard_back', status_changed_at = now() where id = '${MARTINEZ}';
      update public.choice_options set status = 'chosen', status_changed_at = now() where id = '${HARBOR}';
      update public.choices set status = 'decided', chosen_option_id = '${HARBOR}', decided_at = now(), decided_note = 'Warranty' where id = '${C}';`)
    assert.equal(one(`select count(*) from public.choice_options where choice_id = '${C}' and status = 'chosen'`), '1')
    assert.equal(undo(), 't')
    assert.equal(decision(C), `decided|${MARTINEZ}|Earliest start`)
    assert.equal(optionStatus(MARTINEZ), 'chosen')
    assert.equal(optionStatus(HARBOR), 'contacted')
    // Back to open for the cases below.
    as(OWNER, `update public.choice_options set status = 'heard_back' where id = '${MARTINEZ}';
      update public.choices set status = 'open', chosen_option_id = null, decided_at = null, decided_note = null where id = '${C}';`)
  })

  check('add an option with a new contact: Undo removes both', () => {
    const K = '90000000-0000-0000-0000-000000000001', ROB = '50000000-0000-0000-0000-0000000000a3'
    const { undo } = card(`insert into public.contacts (id,user_id) values ('${K}','${OWNER}');
      insert into public.choice_options (id,choice_id,user_id,name,contact_id) values ('${ROB}','${C}','${OWNER}','Rob','${K}');`)
    assert.equal(undo(), 't')
    assert.equal(one(`select count(*) from public.choice_options where id = '${ROB}'`), '0')
    assert.equal(one(`select count(*) from public.contacts where id = '${K}'`), '0')
    assert.equal(one(`select count(*) from public.choice_options where choice_id = '${C}'`), '2')
  })

  check('add an option and a follow-up for it: Undo removes both', () => {
    const DAVE = '50000000-0000-0000-0000-0000000000c1', TASK = '60000000-0000-0000-0000-0000000000c1'
    const { undo } = card(`insert into public.choice_options (id,choice_id,user_id,name) values ('${DAVE}','${C}','${OWNER}','Dave');
      insert into public.tasks (id,user_id,title,choice_option_id,scope) values ('${TASK}','${OWNER}','Follow up with Dave','${DAVE}','compound');`)
    assert.equal(undo(), 't')
    assert.equal(one(`select count(*) from public.choice_options where id = '${DAVE}'`), '0')
    assert.equal(one(`select count(*) from public.tasks where id = '${TASK}'`), '0')
    assert.equal(decision(C), 'open|-|-')
  })

  check('log a call, add a visit follow-up and mark the option contacted: Undo takes all three back', () => {
    const OPT = '50000000-0000-0000-0000-0000000000e1', ENTRY = '70000000-0000-0000-0000-0000000000e1', VISIT = '60000000-0000-0000-0000-0000000000e1'
    as(OWNER, `insert into public.choice_options (id,choice_id,user_id,name) values ('${OPT}','${C}','${OWNER}','Eve');`)
    const { undo } = card(`insert into public.goal_log_entries (id,user_id,goal_task_id,choice_option_id,kind,happened_on,summary) values ('${ENTRY}','${OWNER}','${GOAL_FAMILY}','${OPT}','call','2026-10-22','Called Eve');
      insert into public.tasks (id,user_id,title,choice_option_id,scope,log_kind) values ('${VISIT}','${OWNER}','Visit Eve','${OPT}','compound','visit');
      update public.choice_options set status = 'contacted', status_changed_at = now() where id = '${OPT}';`)
    assert.equal(optionStatus(OPT), 'contacted')
    assert.equal(undo(), 't')
    assert.equal(one(`select count(*) from public.goal_log_entries where id = '${ENTRY}'`), '0')
    assert.equal(one(`select count(*) from public.tasks where id = '${VISIT}'`), '0')
    assert.equal(optionStatus(OPT), 'considering')
    as(OWNER, `delete from public.choice_options where id = '${OPT}'`)
  })

  check('why chat refuses it: add an option and choose it on an existing choice cannot be undone', () => {
    const NEW = '50000000-0000-0000-0000-0000000000d1'
    const { undo } = card(`insert into public.choice_options (id,choice_id,user_id,name) values ('${NEW}','${C}','${OWNER}','Newcomer');
      update public.choice_options set status = 'chosen', status_changed_at = now() where id = '${NEW}';
      update public.choices set status = 'decided', chosen_option_id = '${NEW}', decided_at = now() where id = '${C}';`)
    // The existing choice now points at the new option: the journal sees a newer dependent.
    assert.throws(undo, (e) => /A saved item now has other changes/.test(String(e.stderr ?? e.message)))
    assert.equal(decision(C), `decided|${NEW}|-`)
  })

  console.log(`${checks} local PostgreSQL checks passed. No remote database or provider was contacted.`)
} finally {
  if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', cluster, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' })
  rmSync(root, { recursive: true, force: true })
}
