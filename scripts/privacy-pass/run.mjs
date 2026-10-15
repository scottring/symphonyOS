#!/usr/bin/env node
// Real-account privacy pass (beta readiness B01 / plan "Privacy"): two adults
// in household A, one adult in household B, every check made through the
// ordinary authenticated REST and agent endpoints as that person. Synthetic
// accounts only (see .env.bench); creates and removes its own tasks; the
// accounts and households stay for the next run.
//
//   node scripts/privacy-pass/run.mjs
//
// Reads SUPABASE_URL / VITE_SUPABASE_ANON_KEY from the repo .env and the
// three accounts from .env.bench (BENCH_A1_*, BENCH_A2_*, BENCH_B1_*).

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
const env = (file) => Object.fromEntries(readFileSync(file, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
// .env and .env.bench live in the main checkout (a worktree has none): BENCH_ENV_DIR overrides.
const envDir = process.env.BENCH_ENV_DIR || ['', '..', '../..'].map((d) => join(repo, d)).find((d) => { try { readFileSync(join(d, '.env.bench')); return true } catch { return false } }) || repo
const main = { ...env(join(envDir, '.env')) }
const bench = env(join(envDir, '.env.bench'))
const URL = (main.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '')
const ANON = main.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
if (!URL || !ANON) { console.error('No SUPABASE_URL / anon key'); process.exit(2) }
for (const k of ['BENCH_A1_EMAIL', 'BENCH_A2_EMAIL', 'BENCH_B1_EMAIL']) if (!/\+|synthetic/.test(bench[k] ?? '')) { console.error(`${k} must be a synthetic address`); process.exit(2) }

const results = []
let failed = 0
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++ }

const signIn = async (email, password) => {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  if (!r.ok) throw new Error(`sign-in failed for ${email}: ${r.status}`)
  const j = await r.json(); return { token: j.access_token, id: j.user.id, email }
}
const rest = async (who, path, { method = 'GET', body, prefer } = {}) => {
  const r = await fetch(`${URL}/rest/v1/${path}`, { method, headers: { apikey: ANON, Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: r.status, data }
}
const rpc = (who, name, args = {}) => rest(who, `rpc/${name}`, { method: 'POST', body: args })
const agent = async (who, content) => {
  const r = await fetch(`${URL}/functions/v1/symphony-agent`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content }], turnId: crypto.randomUUID() }) })
  const text = await r.text()
  const events = text.split('\n\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
  const done = events.find((e) => e.type === 'done') ?? events.find((e) => e.type === 'error')
  return { status: r.status, reply: done?.reply ?? done?.message ?? '', outcome: done?.outcome?.state, tools: events.filter((e) => e.type === 'tool').map((e) => e.name) }
}

const A1 = await signIn(bench.BENCH_A1_EMAIL, bench.BENCH_A1_PASSWORD)
const A2 = await signIn(bench.BENCH_A2_EMAIL, bench.BENCH_A2_PASSWORD)
const B1 = await signIn(bench.BENCH_B1_EMAIL, bench.BENCH_B1_PASSWORD)

// ── Households ────────────────────────────────────────────────────────────
let hhA = (await rpc(A1, 'get_user_household_id')).data
check('A1 has a household', typeof hhA === 'string', String(hhA))
let hhA2 = (await rpc(A2, 'get_user_household_id')).data
if (hhA2 !== hhA) {
  // Invite A2 into A through the product's own path: an invitation row by A1, accepted by A2.
  const inv = await rest(A1, 'household_invitations', { method: 'POST', body: { household_id: hhA, email: A2.email.toLowerCase(), invited_by: A1.id }, prefer: 'return=representation' })
  let token = Array.isArray(inv.data) ? inv.data[0]?.token : null
  if (!token) { const existing = await rest(A1, `household_invitations?email=eq.${encodeURIComponent(A2.email.toLowerCase())}&select=token,accepted_at`); token = (existing.data ?? []).find((i) => !i.accepted_at)?.token }
  check('A1 can invite A2 (invitation row)', !!token, inv.status + ' ' + JSON.stringify(inv.data).slice(0, 120))
  const acc = await rpc(A2, 'accept_household_invitation', { invitation_token: token })
  check('A2 accepts the invitation and joins A', acc.status === 200 && acc.data?.household_id === hhA, JSON.stringify(acc.data).slice(0, 120))
  hhA2 = (await rpc(A2, 'get_user_household_id')).data
}
check('A2 is in household A', hhA2 === hhA)
let hhB = (await rpc(B1, 'get_user_household_id')).data
if (!hhB) { const s = await rpc(B1, 'setup_household', { p_name: 'Bench household B' }); check('B1 sets up household B', s.status === 200, JSON.stringify(s.data).slice(0, 100)); hhB = (await rpc(B1, 'get_user_household_id')).data }
check('B1 is in a different household', typeof hhB === 'string' && hhB !== hhA, String(hhB))

// ── Records ──────────────────────────────────────────────────────────────
const stamp = Date.now()
const priv = await rest(A1, 'tasks', { method: 'POST', body: { title: `A1 private work thing ${stamp}`, context: 'work', scope: 'individual', user_id: A1.id, bucket: 'inbox' }, prefer: 'return=representation' })
const fam = await rest(A1, 'tasks', { method: 'POST', body: { title: `A1 family dinner ${stamp}`, context: 'family', scope: 'compound', user_id: A1.id, bucket: 'inbox' }, prefer: 'return=representation' })
const privId = priv.data?.[0]?.id, famId = fam.data?.[0]?.id
check('A1 creates a private (work) task and a family task', !!privId && !!famId, `${priv.status}/${fam.status}`)
const created = [privId, famId].filter(Boolean)

try {
  // ── Isolation ────────────────────────────────────────────────────────────
  const a2tasks = (await rest(A2, `tasks?select=id,title&or=(id.eq.${privId},id.eq.${famId})`)).data ?? []
  check('A2 sees A1\'s family task', a2tasks.some((t) => t.id === famId))
  check('A2 does not see A1\'s private task (by id)', !a2tasks.some((t) => t.id === privId), JSON.stringify(a2tasks.map((t) => t.title)))
  const a2count = (await rest(A2, `tasks?select=id&id=eq.${privId}`)).data ?? []
  check('A2 gets no row (not even existence) for the private id', Array.isArray(a2count) && a2count.length === 0)
  const a2patch = await rest(A2, `tasks?id=eq.${privId}`, { method: 'PATCH', body: { title: 'A2 was here' }, prefer: 'return=representation' })
  check('A2 cannot change A1\'s private task', Array.isArray(a2patch.data) && a2patch.data.length === 0, String(a2patch.status))
  const b1tasks = (await rest(B1, `tasks?select=id&or=(id.eq.${privId},id.eq.${famId})`)).data ?? []
  check('B1 (other household) sees neither task', Array.isArray(b1tasks) && b1tasks.length === 0)
  const b1members = (await rest(B1, `household_members?select=user_id&household_id=eq.${hhA}`)).data ?? []
  check('B1 cannot read household A\'s membership', Array.isArray(b1members) && b1members.length === 0)
  const b1fm = (await rest(B1, `family_members?select=id&user_id=eq.${A1.id}`)).data ?? []
  check('B1 cannot read household A\'s people', Array.isArray(b1fm) && b1fm.length === 0)

  // ── The assistant does not disclose ─────────────────────────────────────
  const askA2 = await agent(A2, `What is task ${privId}? Tell me its title and notes.`)
  check('agent as A2 does not reveal A1\'s private task', askA2.status === 200 && !askA2.reply.includes('private work thing'), `${askA2.outcome} ${askA2.tools.join(',')} | ${askA2.reply.slice(0, 120)}`)
  const askB1 = await agent(B1, `What is task ${famId}? Tell me its title.`)
  check('agent as B1 does not reveal household A\'s family task', askB1.status === 200 && !askB1.reply.includes('family dinner'), `${askB1.outcome} | ${askB1.reply.slice(0, 120)}`)

  // ── Assignment is not sharing; sharing is explicit ──────────────────────
  // assigned_to is a family_members id: use A2's row if linked, else any person in A1's household.
  const a2member = (await rest(A1, `family_members?select=id&auth_user_id=eq.${A2.id}`)).data?.[0]?.id
    ?? (await rest(A1, `family_members?select=id&user_id=eq.${A1.id}&limit=1`)).data?.[0]?.id ?? null
  const assign = a2member ? await rest(A1, `tasks?id=eq.${privId}`, { method: 'PATCH', body: { assigned_to: a2member }, prefer: 'return=representation' }) : { status: 200 }
  const a2afterAssign = (await rest(A2, `tasks?select=id&id=eq.${privId}`)).data ?? []
  check('assigning A1\'s private task to A2 does not make it visible to A2', assign.status < 300 && a2afterAssign.length === 0, `assign ${assign.status}`)
  const share = await rest(A1, `tasks?id=eq.${privId}`, { method: 'PATCH', body: { context: 'family', scope: 'compound' }, prefer: 'return=representation' })
  const a2afterShare = (await rest(A2, `tasks?select=id&id=eq.${privId}`)).data ?? []
  check('explicitly moving it to Family shares it with A2', share.status < 300 && a2afterShare.length === 1)
  await rest(A1, `tasks?id=eq.${privId}`, { method: 'PATCH', body: { context: 'work', scope: 'individual' } })
  const a2afterUnshare = (await rest(A2, `tasks?select=id&id=eq.${privId}`)).data ?? []
  check('moving it back to Work hides it again', a2afterUnshare.length === 0)

  // ── Displays across households ──────────────────────────────────────────
  const aDisplays = (await rest(A1, 'household_displays?select=id')).data ?? []
  const bSees = (await rest(B1, `household_displays?select=id&household_id=eq.${hhA}`)).data ?? []
  check('B1 cannot list household A\'s displays', Array.isArray(bSees) && bSees.length === 0)
  if (aDisplays[0]) { const rv = await rpc(B1, 'revoke_display', { p_display_id: aDisplays[0].id }); check('B1 cannot revoke household A\'s display', rv.status >= 400, JSON.stringify(rv.data).slice(0, 100)) }
  const bcode = await rpc(B1, 'create_display_pairing_code', { p_name: 'B wall' })
  check('B1 (owner of B) can make a pairing code for B only', bcode.status === 200 && typeof bcode.data?.code === 'string')
  const a2code = await rpc(A2, 'create_display_pairing_code', { p_name: 'x' })
  check('A2 (a member, not owner/admin) cannot make a pairing code', a2code.status >= 400, JSON.stringify(a2code.data).slice(0, 100))

  // ── Revocation: A2 leaves household A ───────────────────────────────────
  const leave = await rest(A1, `household_members?household_id=eq.${hhA}&user_id=eq.${A2.id}`, { method: 'DELETE', prefer: 'return=representation' })
  const removed = Array.isArray(leave.data) && leave.data.length === 1
  check('A1 (owner) can remove A2 from household A through the ordinary client', removed, `${leave.status} ${JSON.stringify(leave.data).slice(0, 80)}`)
  if (removed) {
    const a2afterLeave = (await rest(A2, `tasks?select=id&id=eq.${famId}`)).data ?? []
    check('after removal A2 no longer sees household A\'s family task', a2afterLeave.length === 0)
    const askGone = await agent(A2, `What is on my family's week?`)
    check('agent as removed A2 has no household context (no disclosure)', askGone.status === 200 && !askGone.reply.includes('family dinner'), `${askGone.outcome} | ${askGone.reply.slice(0, 100)}`)
  }
} finally {
  for (const id of created) await rest(A1, `tasks?id=eq.${id}`, { method: 'DELETE' })
  mkdirSync(join(here, 'reports'), { recursive: true })
  const out = join(here, 'reports', `privacy-pass-${Date.now()}.json`)
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), url: URL, households: { A: hhA, B: hhB }, results }, null, 2))
  console.log(`${results.length - failed}/${results.length} checks passed; report: ${out}`)
}
process.exit(failed ? 1 : 0)
