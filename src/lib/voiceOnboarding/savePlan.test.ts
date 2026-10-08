import { describe, it, expect, vi } from 'vitest'
import { newDraft, reduce, type ExistingPlan, type FlowAction, type ReduceEnv, type VoicePlanDraft } from './flow'
import { planRows, saveVoicePlan, type VoicePlanWriters } from './savePlan'

const EXISTING: ExistingPlan = {
  goals: [{ id: 'g-garden', title: 'Grow food', context: 'family' }, { id: 'g-office', title: 'Home office' }],
  items: [
    { id: 'm-paint', title: 'Paint the walls', horizon: 'month', goalId: 'g-office' },
    { id: 'w-samples', title: 'Buy paint samples', horizon: 'week', goalId: 'g-office', context: 'personal' },
    { id: 'w-done-today', title: 'Water seedlings', horizon: 'week', goalId: 'g-garden', today: true },
  ],
}
const env = (): ReduceEnv => { let n = 0; return { existing: EXISTING, newId: () => `n${++n}` } }
const run = (e: ReduceEnv, d: VoicePlanDraft, ...a: FlowAction[]) => a.reduce((x, y) => reduce(x, y, e), d)

/** Two kept goals, one new; lines at season and month; one week; today. */
function full(e = env()) {
  let d = run(e, newDraft('year', EXISTING), { type: 'addGoal', text: 'Spanish' }, { type: 'continue' }, { type: 'continue' })
  const spanish = d.goals[2].id
  d = run(e, d,
    { type: 'answer', text: 'Garlic in', goal: 'g-garden' },
    { type: 'answer', text: 'Beginner course done', goal: spanish },
    { type: 'continue' }, { type: 'continue' },
    { type: 'answer', text: 'Lessons one to eight', goal: spanish },
    { type: 'continue' }, { type: 'continue' },
    { type: 'addWeek', text: 'Two lessons', goal: spanish },
    { type: 'addWeek', text: 'Test patch of paint', goal: 'g-office' },
    { type: 'continue' }, { type: 'continue' },
    { type: 'toggleToday', id: 'w-samples' },
    { type: 'answer', text: 'two lessons' },
  )
  return { d, spanish }
}

function writers(fail: (title: string) => boolean = () => false) {
  const calls: { kind: string; title: string; o: unknown }[] = []
  const w: VoicePlanWriters = {
    addYearGoal: vi.fn(async (title, o) => { calls.push({ kind: 'goal', title, o }); return !fail(title) }),
    addTask: vi.fn(async (title, o) => { calls.push({ kind: 'task', title, o }); return !fail(title) }),
    planForToday: vi.fn(async (id) => { calls.push({ kind: 'today', title: id, o: {} }); return !fail(id) }),
  }
  return { w, calls }
}

describe('planRows writes only what is new, linked to what is already there', () => {
  it('new goal first; lines link to kept or new goals; the week links to the goal’s month line, new or existing', () => {
    const { d, spanish } = full()
    const rows = planRows(d, EXISTING)
    expect(rows.map((r) => [r.level, r.title, r.goalId, r.sourceId])).toEqual([
      ['year', 'Spanish', undefined, undefined],
      ['season', 'Garlic in', 'g-garden', undefined],
      ['season', 'Beginner course done', spanish, undefined],
      ['month', 'Lessons one to eight', spanish, 'n3'], // its goal's only Fall line
      ['week', 'Two lessons', spanish, 'n4'], // the new month line
      ['week', 'Test patch of paint', 'g-office', 'm-paint'], // the existing month line
      ['today', 'Buy paint samples', undefined, undefined],
      ['today', 'Two lessons', undefined, undefined],
    ])
    // Kept goals and existing lines are never written again.
    expect(rows.some((r) => r.title === 'Grow food' || r.title === 'Paint the walls')).toBe(false)
  })

  it('today is the week task itself, chosen on its own row — after a new task exists, directly for an existing one', () => {
    const { d } = full()
    const rows = planRows(d, EXISTING)
    expect(rows.filter((r) => r.level === 'today')).toEqual([
      expect.objectContaining({ id: 'today:w-samples', existingId: 'w-samples' }),
      expect.objectContaining({ id: 'today:n5', existingId: 'n5', after: 'n5' }),
    ])
    // One task row: never a second copy for today.
    expect(rows.filter((r) => r.title === 'Two lessons' && r.level === 'week')).toHaveLength(1)
  })

  it('a month line or week task links only to the line the person chose, and only while it is still there', () => {
    const e = env()
    let d = run(e, newDraft('season', EXISTING), { type: 'focus', goal: 'g-office' },
      { type: 'answer', text: 'Desk in place' }, { type: 'answer', text: 'Shelves up' }, { type: 'continue' }, { type: 'continue' },
      { type: 'focus', goal: 'g-office' }, { type: 'answer', text: 'Order the desk' })
    const rows = planRows(d, EXISTING)
    expect(rows.find((r) => r.title === 'Order the desk')?.sourceId).toBeUndefined() // two Fall lines, none chosen
    d = run(e, d, { type: 'setLineSource', id: d.month[0].id, sourceId: d.season[1].id })
    expect(planRows(d, EXISTING).find((r) => r.title === 'Order the desk')?.sourceId).toBe(d.season[1].id)
    // A stale id (from a resumed draft) is never written.
    const stale = { ...d, month: [{ ...d.month[0], sourceId: 's-gone' }] }
    expect(planRows(stale, EXISTING).find((r) => r.title === 'Order the desk')?.sourceId).toBeUndefined()
  })

  it('writes into the periods the session began with', async () => {
    const { d } = full()
    const { w } = writers()
    await saveVoicePlan(d, EXISTING, w)
    expect(w.planForToday).toHaveBeenCalledWith('w-samples', d.periods)
    expect((w.addTask as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ periods: d.periods })
  })

  it('a line under an existing goal keeps that goal’s domain; new goals take the chosen one', () => {
    const { d } = full()
    const rows = planRows(reduce(d, { type: 'setDomain', domain: 'work' }, env()), EXISTING)
    expect(rows.find((r) => r.title === 'Garlic in')?.context).toBe('family')
    expect(rows.find((r) => r.title === 'Spanish')?.context).toBe('work')
  })

  it('a goal left out of the session takes its new lines with it', () => {
    const e = env()
    const { d } = full(e)
    const rows = planRows(reduce(d, { type: 'leaveOut', id: 'g-garden', out: true }, e), EXISTING)
    expect(rows.some((r) => r.title === 'Garlic in')).toBe(false)
  })
})

describe('saveVoicePlan', () => {
  it('writes in order through the writers, choosing the existing task for today', async () => {
    const { d } = full()
    const { w, calls } = writers()
    const r = await saveVoicePlan(d, EXISTING, w)
    expect(r.ok).toBe(true)
    expect(calls.map((c) => c.kind)).toEqual(['goal', 'task', 'task', 'task', 'task', 'task', 'today', 'today'])
    expect(calls.filter((c) => c.kind === 'today').map((c) => c.title)).toEqual(['w-samples', 'n5'])
  })

  it('a retry writes only what had not landed — never a duplicate', async () => {
    const e = env()
    const { d } = full(e)
    const first = await saveVoicePlan(d, EXISTING, writers((t) => t === 'Test patch of paint').w)
    expect(first.ok).toBe(false)
    expect(first.failed).toEqual([expect.objectContaining({ title: 'Test patch of paint', reason: 'write_failed' })])
    const { w, calls } = writers()
    const second = await saveVoicePlan(reduce(d, { type: 'markSaved', ids: first.saved }, e), EXISTING, w)
    expect(second.ok).toBe(true)
    expect(calls.map((c) => c.title)).toEqual(['Test patch of paint'])
  })

  it('holds back exactly what depends on a failed new goal or month line, and says so', async () => {
    const { d } = full()
    const { w } = writers((t) => t === 'Spanish')
    const r = await saveVoicePlan(d, EXISTING, w)
    expect(r.failed.map((f) => [f.title, f.reason])).toEqual([
      ['Spanish', 'write_failed'], ['Beginner course done', 'parent_not_saved'], ['Lessons one to eight', 'parent_not_saved'], ['Two lessons', 'parent_not_saved'],
      ['Two lessons', 'parent_not_saved'], // its today choice waits for it
    ])
    // Lines under kept goals still saved.
    expect(r.saved).toEqual(expect.arrayContaining(['n2']))
  })

  it('a failed today choice on an existing task is reported, not hidden', async () => {
    const { d } = full()
    const r = await saveVoicePlan(d, EXISTING, writers((t) => t === 'w-samples').w)
    expect(r.ok).toBe(false)
    expect(r.failed).toEqual([expect.objectContaining({ level: 'today', title: 'Buy paint samples', reason: 'write_failed' })])
  })

  it('a new task whose today choice failed is retried on its own — the task is not written twice', async () => {
    const e = env()
    const { d } = full(e)
    const first = await saveVoicePlan(d, EXISTING, writers((t) => t === 'n5').w)
    expect(first.saved).toContain('n5')
    expect(first.failed).toEqual([expect.objectContaining({ id: 'today:n5', level: 'today', title: 'Two lessons', reason: 'write_failed' })])
    const { w, calls } = writers()
    const second = await saveVoicePlan(reduce(d, { type: 'markSaved', ids: first.saved }, e), EXISTING, w)
    expect(second.ok).toBe(true)
    expect(calls).toEqual([expect.objectContaining({ kind: 'today', title: 'n5' })])
  })

  it('a writer that throws counts as not written; progress is reported row by row', async () => {
    const { d } = full()
    const seen: string[] = []
    const w: VoicePlanWriters = { addYearGoal: async () => { throw new Error('network') }, addTask: async () => true, planForToday: async () => true }
    const r = await saveVoicePlan(d, EXISTING, w, (id) => seen.push(id))
    expect(r.ok).toBe(false)
    expect(seen).toEqual(r.saved)
  })
})
