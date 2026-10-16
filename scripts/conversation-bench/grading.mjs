// Shared by live text and audio replay. A plausible reply is not evidence of a write.
import { isDeepStrictEqual } from 'node:util'

const owns = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)
const subset = (actual, expected) => Object.entries(expected).every(([key, value]) =>
  actual != null && owns(actual, key) && (value && typeof value === 'object' && !Array.isArray(value)
    ? subset(actual[key], value) : isDeepStrictEqual(actual[key], value)))

export function gradeTurn(step, got) {
  const findings = []
  if (got.error) findings.push(`turn error: ${got.error}`)
  if (!step.expect?.outcome?.includes(got.outcome?.state)) findings.push(`unexpected outcome: ${got.outcome?.state ?? 'missing'}`)
  for (const name of step.forbid?.tools ?? []) if (got.tools?.includes(name)) findings.push(`forbidden tool: ${name}`)
  if (step.expect?.anyTools) {
    if (!step.expect.anyTools.some(name => got.tools?.includes(name))) findings.push('no allowed tool called')
  } else {
    for (const call of step.expect?.tools ?? []) if (!got.tools?.includes(call.name)) findings.push(`missing tool: ${call.name}`)
  }
  const card = step.expect?.card
  if (card) {
    if (!Array.isArray(got.changeSet?.ops)) findings.push('expected change card is missing')
    else {
      if (got.changeSet.ops.length !== card.ops) findings.push(`card has ${got.changeSet.ops.length} operations; expected ${card.ops}`)
      // Explicit assertions are independent of the exemplar tool calls. Titles may
      // vary; IDs, operation, dates and recurrence changes must not.
      const remaining = [...got.changeSet.ops]
      for (const expected of card.contains ?? []) {
        const index = remaining.findIndex(op => subset(op, expected))
        if (index < 0) findings.push(`missing card operation: ${JSON.stringify(expected)}`)
        else remaining.splice(index, 1)
      }
      for (const forbidden of card.excludes ?? []) {
        if (got.changeSet.ops.some(op => subset(op, forbidden))) findings.push(`forbidden card operation: ${JSON.stringify(forbidden)}`)
      }
    }
  }
  for (const re of step.say_must ?? []) if (!new RegExp(re, 'i').test(got.reply ?? '')) findings.push(`reply must match /${re}/`)
  for (const re of step.say_must_not ?? []) if (new RegExp(re, 'i').test(got.reply ?? '')) findings.push(`reply must not match /${re}/`)
  return findings
}

// Explicit table predicates are reusable across tasks, routines, goals and lists.
// Missing observation is a failure, never equivalent to an empty database.
export function gradeRecords(assertions, observed, before = {}) {
  const findings = []
  for (const assertion of assertions ?? []) {
    const rows = observed?.[assertion.table]
    if (!Array.isArray(rows)) { findings.push(`missing record observation: ${assertion.table}`); continue }
    const matches = rows.filter(row => subset(row, assertion.where ?? {}))
    if (assertion.count !== undefined && matches.length !== assertion.count) findings.push(`${assertion.table}: expected ${assertion.count} matching records, got ${matches.length}`)
    if (assertion.fields && (matches.length === 0 || matches.some(row => !subset(row, assertion.fields)))) findings.push(`${assertion.table}: saved fields differ from expectation`)
    if (assertion.unchanged) {
      const prior = before[assertion.table]
      if (!Array.isArray(prior) || !isDeepStrictEqual([...matches].sort(byId), prior.filter(row => subset(row, assertion.where ?? {})).sort(byId))) findings.push(`${assertion.table}: protected records changed or baseline missing`)
    }
  }
  return findings
}
const byId = (a, b) => String(a.id).localeCompare(String(b.id))

export function gradeScenarioRecords(step, observed, before) {
  const checks = [...(step.expect?.database ?? [])]
  const rec = step.expect?.records
  for (const title of rec?.created ?? []) checks.push({ table: 'tasks', where: { title }, count: 1 })
  for (const title of rec?.present ?? []) checks.push({ table: 'tasks', where: { title }, count: 1 })
  for (const title of rec?.absent ?? []) checks.push({ table: 'tasks', where: { title }, count: 0 })
  for (const [title, count] of Object.entries(rec?.count ?? {})) checks.push({ table: 'tasks', where: { title }, count })
  for (const [title, date] of Object.entries(rec?.dated ?? {})) checks.push({ table: 'tasks', where: { title }, count: 1, fields: { date } })
  for (const id of rec?.untouched ?? []) checks.push({ table: 'tasks', where: { id }, count: 1, unchanged: true })
  if (step.forbid?.records?.created === 'any') checks.push({ table: 'tasks', unchanged: true })
  const ro = step.expect?.routines
  for (const id of ro?.unchanged ?? []) checks.push({ table: 'routines', where: { id }, count: 1, unchanged: true })
  for (const [id, date] of ro?.skipped ?? []) checks.push({ table: 'actionable_instances', where: { entity_id: id, date, status: 'skipped' }, count: 1 })
  for (const [id, rule] of Object.entries(ro?.rule ?? {})) checks.push({ table: 'routines', where: { id }, count: 1, fields: { days: rule.days, time: rule.time } })
  const go = step.expect?.goals
  for (const id of go?.unchanged ?? []) checks.push({ table: 'goals', where: { id }, count: 1, unchanged: true })
  for (const [id, status] of Object.entries(go?.status ?? {})) checks.push({ table: 'goals', where: { id }, count: 1, fields: { status } })
  const findings = gradeRecords(checks, observed, before)
  for (const name of go?.present ?? []) if (!observed?.goals?.some(g => g.name === name)) findings.push(`missing goal: ${name}`)
  for (const name of go?.absent ?? []) if (!Array.isArray(observed?.goals) || observed.goals.some(g => g.name === name)) findings.push(`goal absence not verified: ${name}`)
  for (const [name, year] of Object.entries(go?.carriedCopies ?? {})) {
    const copies = observed?.goals?.filter(g => g.name === name && g.carried_from).map(g => g.year)
    if (!isDeepStrictEqual(copies, year === null ? [] : [year])) findings.push(`incorrect carried copies: ${name}`)
  }
  if (step.forbid?.records?.duplicateTitles) {
    const titles = observed?.tasks?.map(t => t.title)
    if (!titles || new Set(titles).size !== titles.length) findings.push('duplicate task titles or missing observation')
  }
  return findings
}

export function summarizeRun(steps) {
  const counts = Object.fromEntries(['passed', 'failed', 'skipped', 'blocked'].map(status => [status, steps.filter(s => s.status === status).length]))
  return { ...counts, status: counts.failed ? 'failed' : counts.skipped || counts.blocked || !steps.length ? 'incomplete' : 'passed' }
}
