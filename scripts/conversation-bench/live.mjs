#!/usr/bin/env node
// Live text layer of the conversation bench (README.md). OPT-IN and never
// against a real household: it signs in as a synthetic account, sends each
// step's words to the deployed symphony-agent, and grades the structured
// `outcome` event, the tool calls, and the rows afterwards.
//
//   SUPABASE_URL=… SUPABASE_ANON_KEY=… BENCH_EMAIL=… BENCH_PASSWORD=… \
//     node scripts/conversation-bench/live.mjs scripts/conversation-bench/scenarios/j1-plumber-week.json
//
// Refuses to run unless the account's email contains "+bench" or "synthetic",
// so a slip cannot point it at a family's records. Approve / retry / undo
// steps are reported as incomplete here: they require a browser action
// adapter before the journey can be certified. Each run writes a JSON report to
// scripts/conversation-bench/reports/<scenario>-<timestamp>.json; nothing is
// stored about the account but its id.

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { gradeTurn, gradeScenarioRecords, summarizeRun } from './grading.mjs'
import { execFileSync } from 'node:child_process'

const [, , scenarioPath] = process.argv
if (!scenarioPath) { console.error('Pass a scenario file.'); process.exit(2) }
const env = (k) => { const v = process.env[k]; if (!v) { console.error(`Missing ${k}`); process.exit(2) } return v }
const url = env('SUPABASE_URL'), anon = env('SUPABASE_ANON_KEY'), email = env('BENCH_EMAIL'), password = env('BENCH_PASSWORD')
// A synthetic account is one made for the bench: named so, or confirmed by the operator for this run.
if (!/\+bench|synthetic/i.test(email) && process.env.BENCH_CONFIRM_SYNTHETIC !== '1') { console.error('Refusing: the bench account must be a synthetic one (+bench or "synthetic" in its address), or set BENCH_CONFIRM_SYNTHETIC=1 for an account you made for this.'); process.exit(2) }

const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'))
if (scenario.start.events?.length || scenario.start.members?.length && scenario.start.members.some(m => !/^[0-9a-f-]{36}$/i.test(m.id))) {
  console.error('INCOMPLETE: this runner cannot seed calendar/member fixtures. Use a browser fixture adapter; no provider call was made.'); process.exit(2)
}
if (scenario.surface !== 'desktop') { console.error('INCOMPLETE: this runner has no authenticated display fixture adapter.'); process.exit(2) }
const actualToday = new Intl.DateTimeFormat('en-CA', { timeZone: scenario.timezone ?? 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
if (scenario.today !== actualToday) { console.error(`INCOMPLETE: relative-date fixture is ${scenario.today}, household date is ${actualToday}; rebase the fixture before running.`); process.exit(2) }


const signIn = async () => {
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  if (!r.ok) throw new Error(`sign-in failed: ${r.status} ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

/** One agent turn: returns the tools called, the outcome, and the reply. */
const turn = async (token, messages, turnId, extra = {}) => {
  const r = await fetch(`${url}/functions/v1/symphony-agent`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, turnId, ...extra }),
  })
  if (!r.ok) throw new Error(`agent ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const text = await r.text()
  const events = text.split('\n\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
  const tools = events.filter((e) => e.type === 'tool').map((e) => e.name)
  const done = events.find((e) => e.type === 'done') ?? events.find((e) => e.type === 'error')
  const changeSet = events.filter((e) => e.type === 'change_set').at(-1)?.set
  return { tools, outcome: done?.outcome, reply: done?.reply ?? '', error: done?.type === 'error' ? done.message : null, changeSet }
}

const session = await signIn()
const token = session.access_token
const userId = session.user?.id

// --seed: put the scenario's starting records into the synthetic household
// (with their scenario ids), and remove them afterwards. Family-scoped, so the
// agent's wall and desktop reads both see them.
const seeded = { tasks: [], routines: [], goals: [] }
const rest = async (path, method, body) => {
  const r = await fetch(`${url}/rest/v1/${path}`, { method, headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined })
  const text = await r.text(); if (!r.ok) throw new Error(`fixture request failed: ${r.status}`); return { status: r.status, body: text.slice(0, 200) }
}
const report = { scenario: scenario.id, at: new Date().toISOString(), build: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: import.meta.dirname, encoding: 'utf8' }).trim(), surface: scenario.surface, steps: [], cleanup: [] }
let before
try {
if (process.argv.includes('--seed')) {
  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  for (const t of scenario.start.tasks ?? []) {
    const r = await rest('tasks', 'POST', { id: t.id, title: t.title, user_id: userId, context: 'family', scope: 'compound', bucket: t.scheduledFor ? 'timed' : 'week', ...(t.scheduledFor ? { scheduled_for: `${t.scheduledFor}T12:00:00Z`, is_all_day: true } : {}) })
    if (r.status < 300) seeded.tasks.push(t.id); else console.error('seed task failed', r.status, r.body)
  }
  for (const r0 of scenario.start.routines ?? []) {
    const r = await rest('routines', 'POST', { id: r0.id, name: r0.name, user_id: userId, context: 'family', scope: 'compound', visibility: 'active', recurrence_pattern: { type: 'weekly', days: r0.days.filter((d) => dayKeys.includes(d)), interval: 1 }, time_of_day: `${r0.time}:00` })
    if (r.status < 300) seeded.routines.push(r0.id); else console.error('seed routine failed', r.status, r.body)
  }
  for (const g of scenario.start.yearGoals ?? []) {
    const r = await rest('goals', 'POST', { id: g.id, name: g.name, year: g.year, status: g.status, user_id: userId, context: 'family', scope: 'compound' })
    if (r.status < 300) seeded.goals.push(g.id); else console.error('seed goal failed', r.status, r.body)
  }
  console.log(`seeded ${seeded.tasks.length} tasks, ${seeded.routines.length} routines, ${seeded.goals.length} goals`)
}
// Read the actual persisted state with the synthetic caller's permissions.
const observe = async () => {
  const tables = ['tasks', 'routines', 'goals', 'actionable_instances']
  const result = {}
  for (const table of tables) {
    const r = await fetch(`${url}/rest/v1/${table}?select=*`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } })
    if (!r.ok) throw new Error(`record observation failed: ${table} (${r.status})`)
    const rows = await r.json()
    if (!Array.isArray(rows) || rows.length >= 1000) throw new Error(`incomplete record observation: ${table}`)
    result[table] = rows.map(row => ({ ...row,
      ...(table === 'tasks' ? { date: row.scheduled_for ? new Intl.DateTimeFormat('en-CA', { timeZone: scenario.timezone ?? 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(row.scheduled_for)) : null } : {}),
      ...(table === 'routines' ? { days: row.recurrence_pattern?.days, time: row.time_of_day } : {}),
      ...(table === 'actionable_instances' ? { date: row.date ?? row.instance_date } : {}) }))
  }
  return result
}
before = await observe()
const history = []
let pendingCard = null
let blocked = false
for (const [i, step] of scenario.steps.entries()) {
  if (blocked) { report.steps.push({ step: i + 1, status: 'blocked', findings: ['prior required step did not pass'] }); continue }
  if (!step.say || step.connection || step.action) {
    report.steps.push({ step: i + 1, action: step.action, status: 'skipped', findings: ['requires browser action/fault adapter; not exercised by the live-text runner'] })
    blocked = true; continue
  }
  history.push({ role: 'user', content: step.say })
  const got = await turn(token, history, crypto.randomUUID(), { ...(scenario.surface === 'wall' ? { surface: 'wall' } : {}), workspaceContext: { page: scenario.page, date: scenario.today, layers: ['family'], selectedId: scenario.selectedId ?? null, items: [], truncated: true }, ...(pendingCard ? { changeCard: pendingCard } : {}) })
  if (got.changeSet) pendingCard = { state: 'pending', title: got.changeSet.title, ops: got.changeSet.ops.map(o => ({ op: o.op, title: o.title, where: o.date ?? '' })), at: new Date().toISOString() }
  history.push({ role: 'assistant', content: got.reply })
  const findings = [...gradeTurn(step, got), ...gradeScenarioRecords(step, await observe(), before)]
  const status = findings.length ? 'failed' : 'passed'
  report.steps.push({ step: i + 1, status, tools: got.tools, outcome: got.outcome?.state, reply: got.reply, card: got.changeSet ?? null, findings })
  blocked = findings.length > 0
  console.log(`${status.toUpperCase()} step ${i + 1}: ${findings.join('; ')}`)
}
} catch (error) {
  report.steps.push({ status: 'failed', findings: [error instanceof Error ? error.message : 'runner failed'] })
} finally {
  for (const [table, ids] of Object.entries(seeded)) for (const id of ids) {
    try { await rest(`${table}?id=eq.${id}`, 'DELETE') }
    catch { report.cleanup.push(`failed to remove seeded ${table} ${id}`) }
  }
  if (report.cleanup.length) report.steps.push({ status: 'failed', findings: report.cleanup })
  report.summary = summarizeRun(report.steps)
  // A partial run is never a completed journey, even when the model checks passed.
  if (report.steps.length < scenario.steps.length && report.summary.status === 'passed') report.summary.status = 'incomplete'
  mkdirSync(join(import.meta.dirname, 'reports'), { recursive: true })
  const out = join(import.meta.dirname, 'reports', `${basename(scenarioPath, '.json')}-${Date.now()}.json`)
  writeFileSync(out, JSON.stringify(report, null, 2))
  console.log(`${report.summary.status.toUpperCase()}; report: ${out}`)
  process.exitCode = report.summary.status === 'passed' ? 0 : report.summary.status === 'failed' ? 1 : 2
}
