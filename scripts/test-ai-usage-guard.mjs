// Disposable local PostgreSQL only. Never reads application env files or
// connects to the configured Supabase project. No paid provider requests.
// Run: node scripts/test-ai-usage-guard.mjs --pg-bin /path/to/postgres/bin
import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const flag = process.argv.indexOf('--pg-bin')
if (flag < 0 || !process.argv[flag + 1]) throw new Error('Pass --pg-bin pointing to local initdb, pg_ctl and psql binaries.')
const bin = resolve(process.argv[flag + 1])
const root = mkdtempSync(join(tmpdir(), 'symphony-ai-usage-'))
const cluster = join(root, 'data')
const args = ['-h', root, '-p', '55449', '-U', 'postgres', '-d', 'postgres', '-X', '-At', '-v', 'ON_ERROR_STOP=1']
const execAsync = promisify(execFile)
const sql = (query) => execFileSync(join(bin, 'psql'), [...args, '-c', query], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const A = '00000000-0000-0000-0000-000000000001'
const B = '00000000-0000-0000-0000-000000000002'
const C = '00000000-0000-0000-0000-000000000003'
const H1 = '10000000-0000-0000-0000-000000000001'
const H2 = '10000000-0000-0000-0000-000000000002'
const query = (user, route = 'symphony-agent') => `set role authenticated; set request.jwt.claim.sub = '${user}'; select public.reserve_ai_provider_call('${route}');`
const reserve = (user = A, route) => JSON.parse(sql(query(user, route)).split('\n').at(-1))
const parallel = async (users) => Promise.all(users.map(async (user) => {
  const { stdout } = await execAsync(join(bin, 'psql'), [...args, '-c', query(user)], { encoding: 'utf8' })
  return JSON.parse(stdout.trim().split('\n').at(-1))
}))
let started = false
let checks = 0
const check = (name, run) => { run(); checks++; console.log(`PASS ${name}`) }
const reset = () => sql(`truncate public.ai_provider_call_usage; update public.ai_usage_configuration set enabled=true,daily_calls=100,monthly_calls=1000; update public.ai_household_allowances set enabled=true,daily_calls=100,monthly_calls=1000;`)

try {
  execFileSync(join(bin, 'initdb'), ['-D', cluster, '-U', 'postgres', '--auth=trust', '--no-locale'], { stdio: ['ignore', 'pipe', 'inherit'] })
  // Unique Unix socket directory, no TCP listener, no existing database.
  execFileSync(join(bin, 'pg_ctl'), ['-D', cluster, '-l', join(root, 'server.log'), '-o', `-k ${root} -h '' -p 55449`, '-w', 'start'], { stdio: 'ignore' })
  started = true
  sql(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.households(id uuid primary key);
    create table public.household_members(household_id uuid references public.households(id) on delete cascade,user_id uuid references auth.users(id) on delete cascade,status text not null,unique(household_id,user_id));
    insert into auth.users values ('${A}'),('${B}'),('${C}');
    insert into public.households values ('${H1}'),('${H2}');
    insert into public.household_members values ('${H1}','${A}','active'),('${H1}','${B}','active'),('${H2}','${C}','active');`)
  sql(readFileSync(new URL('../supabase/migrations/20261014180000_ai_provider_call_allowances.sql', import.meta.url), 'utf8'))

  check('migration starts disabled without invented quotas', () => {
    assert.equal(reserve().allowed, false)
    assert.equal(sql('select count(*) from public.ai_provider_call_usage'), '0')
    sql('update public.ai_usage_configuration set enabled=true')
    assert.equal(reserve().allowed, false)
  })
  check('missing household policy stays closed', () => {
    sql('update public.ai_usage_configuration set enabled=true,daily_calls=100,monthly_calls=1000')
    assert.equal(reserve().allowed, false)
  })
  sql(`insert into public.ai_household_allowances values ('${H1}',true,100,1000),('${H2}',true,100,1000)`)
  check('authenticated call records only opaque user, household, route and count', () => {
    assert.equal(reserve().allowed, true)
    assert.equal(sql(`select user_id||'/'||household_id||'/'||route||'/'||calls from public.ai_provider_call_usage`), `${A}/${H1}/symphony-agent/1`)
  })
  check('anonymous users cannot reserve or read/update policies and usage', () => {
    assert.throws(() => sql(`set role anon; select public.reserve_ai_provider_call('wall-ask')`), /permission denied/)
    for (const table of ['ai_usage_configuration', 'ai_household_allowances', 'ai_provider_call_usage']) {
      assert.throws(() => sql(`set role authenticated; select * from public.${table}`), /permission denied/)
      assert.throws(() => sql(`set role authenticated; delete from public.${table}`), /permission denied/)
    }
  })
  check('missing/ambiguous membership and unknown routes fail closed', () => {
    assert.equal(reserve('', 'wall-ask').allowed, false)
    assert.equal(reserve(A, 'unknown-route').allowed, false)
    sql(`update public.household_members set status='pending' where user_id='${B}'`)
    assert.equal(reserve(B).allowed, false)
    sql(`update public.household_members set status='active' where user_id='${B}'; insert into public.household_members values('${H2}','${B}','active')`)
    assert.equal(reserve(B).allowed, false)
    sql(`delete from public.household_members where user_id='${B}' and household_id='${H2}'`)
  })

  reset()
  sql(`update public.ai_household_allowances set daily_calls=4 where household_id='${H1}'`)
  const householdRace = await parallel(Array.from({ length: 16 }, (_, i) => i % 2 ? A : B))
  check('16 concurrent requests across two adults cannot exceed four household calls', () => {
    assert.equal(householdRace.filter((r) => r.allowed).length, 4)
    assert.equal(sql('select sum(calls) from public.ai_provider_call_usage'), '4')
    assert.equal(reserve(C).allowed, true)
  })

  reset()
  sql('update public.ai_usage_configuration set daily_calls=3')
  const globalRace = await parallel(Array.from({ length: 16 }, (_, i) => i % 2 ? A : C))
  check('16 concurrent requests across households cannot exceed three global calls', () => {
    assert.equal(globalRace.filter((r) => r.allowed).length, 3)
    assert.equal(sql('select sum(calls) from public.ai_provider_call_usage'), '3')
  })

  reset()
  check('monthly allowance denies even when the daily allowance is higher', () => {
    sql(`update public.ai_household_allowances set monthly_calls=1 where household_id='${H1}'`)
    assert.equal(reserve(A).allowed, true)
    const denied = reserve(B)
    assert.equal(denied.reason, 'monthly_limit')
    assert.equal(new Date(denied.retry_at).getUTCDate(), 1)
    assert.equal(new Date(denied.retry_at).getUTCHours(), 0)
    assert.equal(reserve(C).allowed, true)
  })
  reset()
  check('all guarded routes and households share the global monthly allowance', () => {
    sql('update public.ai_usage_configuration set monthly_calls=2')
    assert.equal(reserve(A, 'wall-say').allowed, true)
    assert.equal(reserve(C, 'workspace-voice').allowed, true)
    assert.equal(reserve(B, 'wall-ask').reason, 'monthly_limit')
    assert.equal(sql('select sum(calls) from public.ai_provider_call_usage'), '2')
  })
  reset()
  check('previous-day usage does not consume today’s daily allowance', () => {
    sql(`update public.ai_usage_configuration set daily_calls=1;
      insert into public.ai_provider_call_usage values ((now() at time zone 'UTC')::date - 1,'${A}','${H1}','wall-ask',1)`)
    assert.equal(reserve().allowed, true)
    const denied = reserve()
    assert.equal(denied.reason, 'daily_limit')
    assert.equal(new Date(denied.retry_at).getUTCHours(), 0)
  })
  reset()
  check('emergency disable blocks the next reservation without resetting usage', () => {
    assert.equal(reserve().allowed, true)
    sql('update public.ai_usage_configuration set enabled=false')
    assert.equal(reserve().allowed, false)
    assert.equal(sql('select sum(calls) from public.ai_provider_call_usage'), '1')
  })
  reset()
  check('deleting a user or household cannot restore the global allowance', () => {
    assert.equal(reserve().allowed, true)
    sql(`delete from auth.users where id='${A}'; delete from public.households where id='${H1}'`)
    assert.equal(sql('select sum(calls) from public.ai_provider_call_usage'), '1')
  })
  console.log(`${checks} local PostgreSQL checks passed. No remote database or provider was contacted.`)
} finally {
  if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', cluster, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' })
  rmSync(root, { recursive: true, force: true })
}
