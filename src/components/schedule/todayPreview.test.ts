import { describe, it, expect } from 'vitest'
import type { ChangeOp, ChangeSet } from '@/lib/canvas/changeCard'
import { todayPreview, markForRow, routineIdOfRow, isEmptyPreview } from './todayPreview'

// Wednesday 14 October 2026, mid-morning.
const WED = new Date(2026, 9, 14, 9, 18)
const set = (...ops: Omit<ChangeOp, 'key'>[]): ChangeSet => ({
  key: 'cs1', title: 'Plan my day', ops: ops.map((op, i) => ({ key: `k${i}`, ...op }) as ChangeOp),
})

describe('todayPreview', () => {
  it('no card, nothing drawn', () => {
    expect(isEmptyPreview(todayPreview(null, WED, WED))).toBe(true)
  })

  it('places onto the viewed day: timed ones keep their time, the old spot is lifted', () => {
    const p = todayPreview(set(
      { op: 'place', taskId: 't1', title: 'Prep WSWMD interview', date: '2026-10-14', time: '10:00' },
      { op: 'add', title: 'Call the vet', date: '2026-10-14' },
    ), WED, WED)
    expect(p.added).toHaveLength(2)
    expect(p.added[0]).toMatchObject({ title: 'Prep WSWMD interview', taskId: 't1' })
    expect(p.added[0].time?.getHours()).toBe(10)
    expect(p.added[1].time).toBeUndefined()
    expect(markForRow(p, 'task-t1')).toBe('hidden')
  })

  it('tasks leaving the day stay, dashed grey and struck, saying where they go', () => {
    const p = todayPreview(set(
      { op: 'place', taskId: 'a', title: 'Submit AF&PA application', date: '2026-10-15' },
      { op: 'someday', taskId: 'b', title: 'Frame the posters' },
      { op: 'unplace', taskId: 'c', title: 'Process paper mail' },
      { op: 'talk', taskId: 'd', title: 'Coppermine sign-up', note: 'with Iris' },
    ), WED, WED)
    expect(markForRow(p, 'task-a')).toEqual({ tone: 'leaving', struck: true, note: '→ Thu' })
    expect(markForRow(p, 'task-b')).toEqual({ tone: 'leaving', struck: true, note: '→ Someday' })
    expect(markForRow(p, 'task-c')).toEqual({ tone: 'leaving', struck: true, note: '→ No day yet' })
    expect(markForRow(p, 'task-d')).toEqual({ tone: 'leaving', struck: true, note: '→ Talk about' })
    expect(p.talk).toEqual([{ key: 'k3', title: 'Coppermine sign-up', note: 'with Iris' }])
  })

  it('done strikes the row in place; a merge strikes the duplicate and marks the kept one', () => {
    const p = todayPreview(set(
      { op: 'done', taskId: 'x', title: 'Reply to Christian' },
      { op: 'merge', taskId: 'keep', fromTaskId: 'dup', title: 'Call Molly about the Buick', fromTitle: 'Call Molly' },
    ), WED, WED)
    expect(markForRow(p, 'task-x')).toEqual({ tone: 'proposed', struck: true, note: 'Done' })
    expect(markForRow(p, 'task-keep')).toEqual({ tone: 'proposed', note: 'Merged · 2 into 1' })
    expect(markForRow(p, 'task-dup')).toEqual({ tone: 'leaving', struck: true })
  })

  it('routine skip, who and move on the viewed day land on the routine rows', () => {
    const p = todayPreview(set(
      { op: 'routine_skip', routineId: 'r1', title: 'Tidy bedrooms', date: '2026-10-14' },
      { op: 'routine_who', routineId: 'r2', title: 'Dishes', date: '2026-10-14', assignee: 'm1', assigneeName: 'Iris' },
      { op: 'routine_move', routineId: 'r3', title: 'Piano', date: '2026-10-14', toDate: '2026-10-16' },
      { op: 'routine_move', routineId: 'r4', title: 'Run', date: '2026-10-13', toDate: '2026-10-14', time: '17:30' },
      { op: 'routine_skip', routineId: 'r5', title: 'Elsewhere', date: '2026-10-15' },
    ), WED, WED)
    expect(markForRow(p, 'routine-collection-r1')).toEqual({ tone: 'proposed', struck: true, note: 'Skipped · today only' })
    expect(markForRow(p, 'routine-r2#1')).toEqual({ tone: 'proposed', note: 'Iris · today only' })
    expect(markForRow(p, 'routine-r3')).toEqual({ tone: 'leaving', struck: true, note: '→ Fri' })
    expect(markForRow(p, 'routine-r5')).toBeUndefined()
    const moved = p.added.find((a) => a.routineId === 'r4')
    expect(moved).toMatchObject({ title: 'Run', note: 'From Tue' })
    expect(moved?.time?.getHours()).toBe(17)
  })

  it('another day says which day the skip is for', () => {
    const p = todayPreview(set({ op: 'routine_skip', routineId: 'r1', title: 'Tidy', date: '2026-10-15' }), new Date(2026, 9, 15), WED)
    expect(markForRow(p, 'routine-r1')).toEqual({ tone: 'proposed', struck: true, note: 'Skipped · Thu only' })
  })

  it('reads routine ids from every row shape', () => {
    expect(routineIdOfRow('routine-collection-abc')).toBe('abc')
    expect(routineIdOfRow('routine-abc#2')).toBe('abc')
    expect(routineIdOfRow('task-abc')).toBeNull()
  })
})
