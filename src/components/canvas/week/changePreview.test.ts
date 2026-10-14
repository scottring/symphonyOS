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
  it('finds a nested step the set places, so its dashed row carries the task', () => {
    const step = task('s1', { parentTaskId: 'p' })
    const p = changePreview({ key: 'n', title: '1 change', ops: [{ key: 'n:0', op: 'place', taskId: 's1', title: 'Buy paint', date: '2026-10-14' }] }, [task('p', { subtasks: [step] })])
    expect(p.byDay.get('2026-10-14')![0].task).toBe(step)
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

describe('withPreview — done, merge, talk (stage 3)', () => {
  const day = (key: string, items: CanvasDay['items']): CanvasDay => ({ date: new Date(`${key}T00:00:00`), key, events: [], items })
  const row = (t: Task): CanvasDay['items'][number] => ({ id: `task-${t.id}`, kind: 'task', title: t.title, completed: false, task: t })
  const ops = { key: 't', title: '3 changes', ops: [
    { key: 't:0', op: 'done' as const, taskId: 'book', title: 'Return the library book' },
    { key: 't:1', op: 'merge' as const, taskId: 'molly', fromTaskId: 'buick', fromTitle: 'Call Molly about the Buick', title: 'Call Molly' },
    { key: 't:2', op: 'talk' as const, taskId: 'camp', title: 'Summer camp', note: 'with Iris' },
  ] }
  const book = task('book', { title: 'Return the library book' })
  const molly = task('molly', { title: 'Call Molly' })
  const buick = task('buick', { title: 'Call Molly about the Buick' })
  const camp = task('camp', { title: 'Summer camp' })

  it('strikes a done row in place, keeps one row of a merge, and lifts a talk-about off its day', () => {
    const days = [day('2026-10-14', [row(book), row(molly), row(buick)]), day('2026-10-15', [row(camp)])]
    const out = withPreview(days, [], changePreview(ops, [book, molly, buick, camp]))
    const wed = out.days[0].items
    expect(wed.map((i) => [i.title, !!i.proposed, !!i.struck, i.note])).toEqual([
      ['Return the library book', true, true, 'Done'],
      ['Call Molly', true, false, 'Merged with “Call Molly about the Buick”'],
    ])
    expect(out.days[1].items).toEqual([])
  })

  it('a talk-about with no day stays on the No day yet line; a done one leaves it', () => {
    const shelf = [{ key: 'none', milestone: null, rows: [{ task: camp, meta: null }, { task: book, meta: null }], done: [] }]
    const out = withPreview([], shelf as never, changePreview(ops, [book, camp]))
    expect(out.shelf[0].rows.map((r) => r.task.id)).toEqual(['camp'])
  })
})

describe('withPreview — routine skip, move and who on their days', () => {
  const day = (key: string, items: CanvasDay['items']): CanvasDay => ({ date: new Date(`${key}T00:00:00`), key, events: [], items })
  const occ = (routineId: string, title: string, key: string, h: number, people: string[] = []): CanvasDay['items'][number] => ({
    id: `routine-${routineId}-${key}`, kind: 'routine', title, completed: false, routineId, time: new Date(`${key}T${String(h).padStart(2, '0')}:15:00`), people,
  })
  const days = () => [
    day('2026-10-15', [occ('ffg', 'FFG pickup', '2026-10-15', 17, ['scott']), occ('cut', 'Kaleb haircut', '2026-10-15', 16)]),
    day('2026-10-16', []),
  ]
  const set = { key: 'w', title: '3 changes', ops: [
    { key: 'w:0', op: 'routine_who' as const, routineId: 'ffg', title: 'FFG pickup', date: '2026-10-15', assignee: 'iris', assigneeName: 'Iris' },
    { key: 'w:1', op: 'routine_move' as const, routineId: 'cut', title: 'Kaleb haircut', date: '2026-10-15', toDate: '2026-10-16' },
    // Bedtime is written once above the days ("Every day"), so its skip is a new dashed row.
    { key: 'w:2', op: 'routine_skip' as const, routineId: 'bed', title: 'Kids bedtime routine', date: '2026-10-16' },
  ] }

  it('changes the person in place, moves the occurrence keeping its time, and draws a lifted routine’s skip', () => {
    const out = withPreview(days(), [], changePreview(set, []))
    const [thu, fri] = out.days
    expect(thu.items.map((i) => [i.title, !!i.proposed, i.people, i.note])).toEqual([
      ['FFG pickup', true, ['iris'], 'Iris · this week'],
    ])
    expect(fri.items.map((i) => [i.title, i.note, i.struck ?? false, i.time?.getHours()])).toEqual([
      ['Kaleb haircut', 'From Thu · this week', false, 16],
      ['Kids bedtime routine', 'Skipped · this week', true, undefined],
    ])
    expect(fri.items.every((i) => i.proposed)).toBe(true)
  })

  it('ignores lasting routine ops (the Routines page previews those)', () => {
    const p = changePreview({ key: 'l', title: '1 change', ops: [{ key: 'l:0', op: 'routine_change', routineId: 'bed', title: 'Bedtime', time: '19:45' }] }, [])
    expect(withPreview(days(), [], p).days).toEqual(days())
  })
})
