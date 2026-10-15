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
// steps are reported as "manual" here: they belong to the page, and the
// browser layer (Playwright) drives them. Each run writes a JSON report to
// scripts/conversation-bench/reports/<scenario>-<timestamp>.json; nothing is
// stored about the account but its id.

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'

const [, , scenarioPath] = process.argv
if (!scenarioPath) { console.error('Pass a scenario file.'); process.exit(2) }
const env = (k) => { const v = process.env[k]; if (!v) { console.error(`Missing ${k}`); process.exit(2) } return v }
const url = env('SUPABASE_URL'), anon = env('SUPABASE_ANON_KEY'), email = env('BENCH_EMAIL'), password = env('BENCH_PASSWORD')
// A synthetic account is one made for the bench: named so, or confirmed by the operator for this run.
if (!/\+bench|synthetic/i.test(email) && process.env.BENCH_CONFIRM_SYNTHETIC !== '1') { console.error('Refusing: the bench account must be a synthetic one (+bench or "synthetic" in its address), or set BENCH_CONFIRM_SYNTHETIC=1 for an account you made for this.'); process.exit(2) }

const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'))

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
const report = { scenario: scenario.id, at: new Date().toISOString(), user: session.user?.id, steps: [] }
const history = []
// The page tells the next turn what became of the last card (the client's
// takeChangeCard): while one is waiting, the model is told so, with its ops.
let pendingCard = null
let pass = true
for (const [i, step] of scenario.steps.entries()) {
  if (!step.say) { report.steps.push({ step: i + 1, action: step.action, result: 'manual (page action: run in the browser layer)' }); continue }
  history.push({ role: 'user', content: step.say })
  const turnId = crypto.randomUUID()
  const got = await turn(token, history, turnId, { workspaceContext: { page: scenario.page, date: scenario.today, layers: ['family'], selectedId: null, items: [], truncated: false }, ...(pendingCard ? { changeCard: pendingCard } : {}) })
  if (got.changeSet) pendingCard = { state: 'pending', title: got.changeSet.title, ops: got.changeSet.ops.map((o) => ({ op: o.op, title: o.title, where: o.date ?? '' })), at: new Date().toISOString() }
  history.push({ role: 'assistant', content: got.reply })
  const findings = []
  if (!got.outcome) findings.push('no outcome event (older agent build?)')
  else if (!step.expect.outcome.includes(got.outcome.state)) findings.push(`outcome ${got.outcome.state}, expected ${step.expect.outcome.join('|')}`)
  for (const name of step.forbid?.tools ?? []) if (got.tools.includes(name)) findings.push(`forbidden tool ${name}`)
  // `anyTools`: the live model may reach the same outcome by another supported route (a card instead of a direct write).
  if (step.expect.anyTools) { if (!step.expect.anyTools.some((n) => got.tools.includes(n))) findings.push(`none of ${step.expect.anyTools.join('|')} called`) }
  else for (const call of step.expect.tools ?? []) if (!got.tools.includes(call.name)) findings.push(`missing tool ${call.name}`)
  if (step.expect.card && got.changeSet && got.changeSet.ops.length !== step.expect.card.ops) findings.push(`card has ${got.changeSet.ops.length} ops, expected ${step.expect.card.ops}`)
  for (const re of step.say_must_not ?? []) if (new RegExp(re, 'i').test(got.reply)) findings.push(`reply must not match /${re}/`)
  for (const re of step.say_must ?? []) if (!new RegExp(re, 'i').test(got.reply)) findings.push(`reply must match /${re}/`)
  if (findings.length) pass = false
  report.steps.push({ step: i + 1, say: step.say, tools: got.tools, outcome: got.outcome?.state, reply: got.reply.slice(0, 300), card: got.changeSet ? got.changeSet.ops.map((o) => ({ op: o.op, title: o.title, date: o.date ?? null, time: o.time ?? null })) : null, findings })
  console.log(`${findings.length ? 'FAIL' : 'PASS'} step ${i + 1}: ${got.outcome?.state ?? 'no outcome'} ${findings.join('; ')}`)
}
mkdirSync(join(import.meta.dirname, 'reports'), { recursive: true })
const out = join(import.meta.dirname, 'reports', `${basename(scenarioPath, '.json')}-${Date.now()}.json`)
writeFileSync(out, JSON.stringify(report, null, 2))
console.log(`${pass ? 'PASSED' : 'FAILED'}; report: ${out}`)
process.exit(pass ? 0 : 1)
