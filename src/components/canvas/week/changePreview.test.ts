import { describe, expect, it } from 'vitest'
import type { Task } from '@/types/task'
import { changePreview, withPreview } from './changePreview'
import type { CanvasDay } from './WeekCanvas'

const task = (id: string, x: Partial<Task> = {}) => ({ id, title: id, completed: false, createdAt: new Date(2026, 8, 1), updatedAt: new Date(), ...x }) as Task
const set = { key: 's', title: '3 changes', ops: [
  { key: 's:0', op: 'place' as const, taskId: 'a', title: 'Reply to Christian', date: '2026-10-14', time: '09:00' },
  { key: 's:1', op: 'add' as const, title: 'Hold for WSWMD', date: '2026-10-14', time: '13:00' },
  { key: 's:2', op: 'someday' as const, taskId: 'b', title: 'Washing machine' },
] }

describe('changePreview', () => {
  it('draws placed and added items on their day, dashed, and lifts what moves', () => {
    const p = changePreview(set, [task('a'), task('b', { scheduledFor: new Date(2026, 9, 15), isAllDay: true })])
    const wed = p.byDay.get('2026-10-14')!
    expect(wed.map((i) => [i.title, i.proposed, i.time])).toEqual([
      ['Reply to Christian', true, new Date(2026, 9, 14, 9, 0)],
      ['Hold for WSWMD', true, new Date(2026, 9, 14, 13, 0)],
    ])
    expect([...p.leaving]).toEqual(['a', 'b'])
  })
  it('nothing pending, nothing drawn', () => {
    const p = changePreview(null, [])
    expect(p.byDay.size).toBe(0)
    expect(p.leaving.size).toBe(0)
  })
})

describe('withPreview', () => {
  it('adds the dashed rows to their day and removes moved rows from where they were', () => {
    const day = (key: string, items: CanvasDay['items']): CanvasDay => ({ date: new Date(`${key}T00:00:00`), key, events: [], items })
    const days = [day('2026-10-14', []), day('2026-10-15', [{ id: 'task-b', kind: 'task', title: 'b', completed: false, task: task('b') }])]
    const shelf = [{ key: 'none', milestone: null, rows: [{ task: task('a'), meta: null }], done: [] }]
    const p = changePreview(set, [task('a'), task('b')])
    const out = withPreview(days, shelf as never, p)
    expect(out.days[0].items.map((i) => i.title)).toEqual(['Reply to Christian', 'Hold for WSWMD'])
    expect(out.days[1].items).toEqual([])
    expect(out.shelf[0].rows).toEqual([])
  })
})
