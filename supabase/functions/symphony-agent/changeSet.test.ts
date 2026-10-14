import { describe, expect, it } from 'vitest'
import { changeSetFromInput, resolveRefs } from './changeSet'

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
