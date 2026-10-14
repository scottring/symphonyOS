import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { changeCardNote, changeSetFromInput, PROPOSE_CHANGES_TOOL, resolveRefs } from './changeSet'

const A = '0b8e7c1a-2d3f-4a5b-8c6d-7e8f9a0b1c2d'
const B = '4f1c2a9e-7b3d-4c11-9a0e-2f6b8d1e3c55'
const M = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d'

describe('changeSetFromInput', () => {
  it('keeps valid ops and gives each a stable key', () => {
    const r = changeSetFromInput({ title: '3 changes to your week', ops: [
      { op: 'place', task_id: A, date: '2026-10-15', time: '09:00' },
      { op: 'add', title: 'Hold for WSWMD', date: '2026-10-14', time: '13:00' },
      { op: 'someday', task_id: B },
    ] }, 'tu1')
    if ('error' in r) throw new Error(r.error)
    expect(r.set.key).toBe('tu1')
    expect(r.set.title).toBe('3 changes to your week')
    expect(r.set.ops.map((o) => [o.key, o.op])).toEqual([['tu1:0', 'place'], ['tu1:1', 'add'], ['tu1:2', 'someday']])
    expect(r.set.ops[0]).toMatchObject({ taskId: A, date: '2026-10-15', time: '09:00' })
    expect(r.set.ops[1]).toMatchObject({ title: 'Hold for WSWMD', date: '2026-10-14', time: '13:00' })
  })

  it('refuses bad ops instead of guessing', () => {
    expect('error' in changeSetFromInput({ ops: [] }, 'k')).toBe(true)
    expect('error' in changeSetFromInput({ ops: [{ op: 'delete', task_id: A }] }, 'k')).toBe(true)
    expect('error' in changeSetFromInput({ ops: [{ op: 'place', task_id: 'nope', date: '2026-10-15' }] }, 'k')).toBe(true)
    expect('error' in changeSetFromInput({ ops: [{ op: 'place', task_id: A, date: '2026-02-30' }] }, 'k')).toBe(true)
    expect('error' in changeSetFromInput({ ops: [{ op: 'place', task_id: A, date: '2026-10-15', time: '25:00' }] }, 'k')).toBe(true)
    expect('error' in changeSetFromInput({ ops: [{ op: 'add', title: '  ' }] }, 'k')).toBe(true)
    expect('error' in changeSetFromInput({ ops: [{ op: 'assign', task_id: A }] }, 'k')).toBe(true)
    const many = Array.from({ length: 41 }, () => ({ op: 'someday', task_id: A }))
    expect('error' in changeSetFromInput({ ops: many }, 'k')).toBe(true)
  })

  it('refuses two ops on the same task, and says to send one op per task', () => {
    const r = changeSetFromInput({ ops: [
      { op: 'place', task_id: A, date: '2026-10-15' },
      { op: 'assign', task_id: A, assignee: M },
    ] }, 'k')
    expect(r).toEqual({ error: expect.stringContaining('one op per task') })
  })

  it('refuses an add with a time but no date', () => {
    const r = changeSetFromInput({ ops: [{ op: 'add', title: 'Call the bank', time: '09:00' }] }, 'k')
    expect(r).toEqual({ error: expect.stringContaining('needs a date') })
  })

  it('keeps the week being planned, for adds with no date', () => {
    const r = changeSetFromInput({ week_start: '2026-10-17', ops: [{ op: 'add', title: 'Call the bank' }] }, 'k')
    if ('error' in r) throw new Error(r.error)
    expect(r.set.weekStart).toBe('2026-10-17')
    expect('error' in changeSetFromInput({ week_start: '2026-02-30', ops: [{ op: 'add', title: 'x' }] }, 'k')).toBe(true)
    const none = changeSetFromInput({ ops: [{ op: 'add', title: 'x' }] }, 'k')
    if ('error' in none) throw new Error(none.error)
    expect(none.set.weekStart).toBeUndefined()
  })

  it('defaults the title to the count', () => {
    const r = changeSetFromInput({ ops: [{ op: 'someday', task_id: A }, { op: 'unplace', task_id: B }] }, 'k')
    if ('error' in r) throw new Error(r.error)
    expect(r.set.title).toBe('2 changes')
  })
})

describe('resolveRefs', () => {
  const base = changeSetFromInput({ ops: [
    { op: 'place', task_id: A, date: '2026-10-15' },
    { op: 'assign', task_id: B, assignee: M },
  ] }, 'k')
  if ('error' in base) throw new Error(base.error)

  it('fills titles, what Symphony saw, and names', () => {
    const r = resolveRefs(base.set,
      [{ id: A, title: 'Reply to Christian', updated_at: '2026-10-14T07:00:00.123456+00:00', completed: false },
       { id: B, title: 'Kids clean rooms', updated_at: '2026-10-13T20:00:00+00:00', completed: false }],
      [{ id: M, name: 'Ella' }])
    if ('error' in r) throw new Error(r.error)
    expect(r.set.ops[0]).toMatchObject({ title: 'Reply to Christian', seen: '2026-10-14T07:00:00.123456+00:00' })
    expect(r.set.ops[1]).toMatchObject({ title: 'Kids clean rooms', assigneeName: 'Ella' })
  })

  it('refuses a task the person cannot see, a finished task, or an unknown person', () => {
    expect('error' in resolveRefs(base.set, [{ id: B, title: 'x', updated_at: 'x', completed: false }], [{ id: M, name: 'Ella' }])).toBe(true)
    expect('error' in resolveRefs(base.set,
      [{ id: A, title: 'a', updated_at: 'x', completed: true }, { id: B, title: 'b', updated_at: 'x', completed: false }],
      [{ id: M, name: 'Ella' }])).toBe(true)
    expect('error' in resolveRefs(base.set,
      [{ id: A, title: 'a', updated_at: 'x', completed: false }, { id: B, title: 'b', updated_at: 'x', completed: false }],
      [])).toBe(true)
  })
})

describe('changeCardNote', () => {
  it('says the last card was approved and its changes are saved', () => {
    const note = changeCardNote({ state: 'approved', title: '2 changes', ops: [{ op: 'someday', title: 'Paper mail', where: '→ Someday' }], at: '2026-10-14T09:00:00Z' })
    expect(note).toContain('approved')
    expect(note).toContain('Paper mail')
    expect(note).toContain('untrusted data')
  })
  it('drops anything malformed', () => {
    expect(changeCardNote(undefined)).toBe('')
    expect(changeCardNote({ state: 'deleted', title: 'x', ops: [] })).toBe('')
    expect(changeCardNote('approved')).toBe('')
  })
})

describe('agent wiring', () => {
  const src = readFileSync('supabase/functions/symphony-agent/index.ts', 'utf8')
  it('offers the tool and streams one change_set', () => {
    expect(src).toMatch(/PROPOSE_CHANGES_TOOL,/)
    expect(src).toMatch(/send\(\{ type: 'change_set', set: resolved\.set \}\)/)
  })
  it('tells the model to propose, not write, when several items change', () => {
    expect(src).toContain('MORE THAN ONE task')
    expect(src).toContain('symphony_propose_changes')
  })
  it('does a clear single change directly and asks one question when ambiguous', () => {
    expect(src).toContain('A clear, reversible change to ONE item')
    expect(src).toContain('ask ONE short question')
    expect(src).toContain('Routines have no preview yet')
    expect(src).toContain('Just this week, or from now on?')
  })
  it('reads what became of the last card, and never re-proposes saved or dismissed changes', () => {
    expect(src).toMatch(/changeCardNote\(body\.changeCard\)/)
    expect(src).toContain('If the page says the last change card was approved, its changes are saved: the next list holds only what is still unsaved. If it was dismissed, do not re-propose those changes unless asked.')
  })
  it('proposes early and revises after each answer while planning', () => {
    expect(src).toContain('as soon as one answer settles a change')
    expect(PROPOSE_CHANGES_TOOL.description).toContain('call it again with the whole list so far')
  })
})
