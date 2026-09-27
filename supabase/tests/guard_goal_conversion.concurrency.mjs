// Isolated-database proof for the goal-conversion invariant (local Supabase
// at 127.0.0.1:55322 ONLY — refuses any other host). Fictional accounts from
// the Lee household: Riley (converts a shared goal) and Drew (links a PRIVATE
// row under it). Each connection runs as `authenticated` with that user's JWT
// claims, so RLS applies exactly as in the app. Every row this creates is
// titled GUARDTEST and deleted at the end.
//
//   PG_MODULE=/path/to/node_modules/pg node supabase/tests/guard_goal_conversion.concurrency.mjs
// Needs the two fictional accounts below in that local database (see
// outputs/horizon-everyday/setup-lee.mjs and e0.mjs); it never runs elsewhere.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { Client } = require(process.env.PG_MODULE ?? 'pg')
const URL = 'postgresql://postgres:postgres@127.0.0.1:55322/postgres'
if (!URL.includes('127.0.0.1:55322')) throw new Error('local only')
const RILEY = '644b0499-098f-4b94-8bc6-a9f5c2aaa83e', DREW = '2520a6ca-8563-428d-8236-9f2c1c45ed81'

const admin = new Client(URL); await admin.connect()
const as = async (uid) => {
  const c = new Client(URL); await c.connect()
  await c.query(`set role authenticated`)
  await c.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: uid, role: 'authenticated' })])
  return c
}
const results = []
const record = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`) }
const ins = async (row) => (await admin.query(
  `insert into public.tasks (user_id, title, bucket, season_start, month_start, is_goal, completed, context, scope)
   values ($1,$2,$3,$4,$5,$6,false,$7,$8) returning id`,
  [row.user, `GUARDTEST ${row.title}`, row.bucket, row.season ?? null, row.month ?? null, row.goal, row.context, row.scope])).rows[0].id
const invalidLinks = async () => (await admin.query(
  `select count(*)::int n from public.tasks c join public.tasks p on p.id = coalesce(c.supports_goal_task_id, c.goal_task_id)
   where c.title like 'GUARDTEST%' and not coalesce(p.is_goal, false)`)).rows[0].n
const snapshot = async () => (await admin.query(
  `select md5(string_agg(row(id, is_goal, completed, goal_task_id, supports_goal_task_id, bucket, title)::text, ',' order by id)) h
   from public.tasks where title like 'GUARDTEST%'`)).rows[0].h
const cleanup = () => admin.query(`delete from public.tasks where title like 'GUARDTEST%'`)
const run = async (c, sql, args) => { try { await c.query(sql, args); return 'ok' } catch (e) { return `refused: ${e.message}` } }
const pending = (p) => Promise.race([p.then(() => false), new Promise((r) => setTimeout(() => r(true), 500))])

// ── Two transactions: Drew links a private row under Riley's shared goal
//    while Riley turns that goal back into a task. ───────────────────────
async function race({ link, first, finish }) {
  await cleanup()
  const S = await ins({ user: RILEY, title: 'shared season goal', bucket: 'quarter', season: '2026-09-01', goal: true, context: 'family', scope: 'compound' })
  const C = link === 'supports'
    ? await ins({ user: DREW, title: 'private month goal', bucket: 'month', month: '2026-10-01', goal: true, context: 'personal', scope: 'individual' })
    : await ins({ user: DREW, title: 'private next action', bucket: 'quarter', season: '2026-09-01', goal: false, context: 'personal', scope: 'individual' })
  const drew = await as(DREW), riley = await as(RILEY)
  await drew.query('begin'); await riley.query('begin')
  const linkSql = link === 'supports' ? 'update public.tasks set supports_goal_task_id = $1 where id = $2' : 'update public.tasks set goal_task_id = $1 where id = $2'
  const doLink = () => run(drew, linkSql, [S, C])
  const doConvert = () => run(riley, 'update public.tasks set is_goal = false where id = $1', [S])
  const [a, b] = first === 'link' ? [drew, riley] : [riley, drew]
  const r1 = await (first === 'link' ? doLink() : doConvert())
  const p2 = first === 'link' ? doConvert() : doLink()
  const blocked = await pending(p2)
  // `finish`: 'commit' — the first commits first; 'second-first' — the second
  // commits first (only possible when it was not made to wait); 'rollback' —
  // the first rolls back.
  let r2
  if (finish === 'second-first' && !blocked) {
    r2 = await p2
    if (r2 === 'ok') await b.query('commit'); else await b.query('rollback')
    try { await a.query(r1 === 'ok' ? 'commit' : 'rollback') } catch (e) { r2 += ` (first then: ${e.message})` }
  } else {
    if (r1 === 'ok' && finish !== 'rollback') await a.query('commit'); else await a.query('rollback')
    r2 = await p2
    if (r2 === 'ok') await b.query('commit'); else await b.query('rollback')
    if (finish === 'second-first') r2 += ' [order forced: the second waited, so it could not commit first]'
  }
  const bad = await invalidLinks()
  const name = `${link} link · ${first} first · ${finish === 'commit' ? 'first commits first' : finish === 'second-first' ? 'second commits first' : 'first rolls back'}`
  record(name, bad === 0, `first: ${r1}; second: ${blocked ? 'waited, then ' : ''}${r2}; invalid links after: ${bad}`)
  await drew.end(); await riley.end()
}
for (const link of ['supports', 'step'])
  for (const first of ['link', 'convert'])
    for (const finish of ['commit', 'second-first', 'rollback'])
      await race({ link, first, finish })

// ── Sequential checks. ──────────────────────────────────────────────────
await cleanup()
{
  // A hidden private row under a shared goal blocks its conversion; the
  // refusal names nothing; nothing changes.
  for (const link of ['supports', 'step']) {
    await cleanup()
    const S = await ins({ user: RILEY, title: 'shared goal', bucket: 'quarter', season: '2026-09-01', goal: true, context: 'family', scope: 'compound' })
    const C = link === 'supports'
      ? await ins({ user: DREW, title: 'hidden month goal', bucket: 'month', month: '2026-10-01', goal: true, context: 'personal', scope: 'individual' })
      : await ins({ user: DREW, title: 'hidden next action', bucket: 'quarter', season: '2026-09-01', goal: false, context: 'personal', scope: 'individual' })
    await admin.query(link === 'supports' ? 'update public.tasks set supports_goal_task_id = $1 where id = $2' : 'update public.tasks set goal_task_id = $1 where id = $2', [S, C])
    const riley = await as(RILEY)
    const sees = (await riley.query('select count(*)::int n from public.tasks where id = $1', [C])).rows[0].n
    const before = await snapshot()
    const r = await run(riley, 'update public.tasks set is_goal = false where id = $1', [S])
    const after = await snapshot()
    record(`hidden ${link} child blocks conversion`, sees === 0 && r.startsWith('refused') && !/hidden|GUARDTEST/.test(r) && before === after,
      `Riley sees the child: ${sees}; ${r}; unchanged: ${before === after}`)
    await riley.end()
  }
  // Ordinary conversion, re-conversion and completion still work.
  await cleanup()
  const G = await ins({ user: RILEY, title: 'free goal', bucket: 'quarter', season: '2026-09-01', goal: true, context: 'family', scope: 'compound' })
  const riley = await as(RILEY)
  record('free goal → task', (await run(riley, 'update public.tasks set is_goal = false where id = $1', [G])) === 'ok')
  record('task → goal', (await run(riley, 'update public.tasks set is_goal = true where id = $1', [G])) === 'ok')
  const K = await ins({ user: RILEY, title: 'visible next action', bucket: 'quarter', season: '2026-09-01', goal: false, context: 'family', scope: 'compound' })
  record('file a next action under a goal', (await run(riley, 'update public.tasks set goal_task_id = $1 where id = $2', [G, K])) === 'ok')
  record('complete a goal that has next actions', (await run(riley, 'update public.tasks set completed = true where id = $1', [G])) === 'ok')
  record('complete its next action', (await run(riley, 'update public.tasks set completed = true where id = $1', [K])) === 'ok')
  await riley.end()
}
await cleanup()
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
await admin.end()
process.exit(failed ? 1 : 0)
