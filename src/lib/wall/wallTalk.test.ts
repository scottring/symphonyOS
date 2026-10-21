import { describe, expect, it, vi } from 'vitest'
import type { ChangeSet } from '@/lib/canvas/changeCard'
import type { WallTodayRow } from './wallMomentsModel'
import { cardDays, cardLine, dayEntries, dayWord, fitEntries, talkIntent, talkUsesBand, withTimeout, type TalkTaskInfo } from './wallTalk'

const today = new Date(2026, 9, 14, 16, 40) // Wed Oct 14

describe('talkIntent: words that act on the wall itself', () => {
  it('approve only while a card is up, and only clear approvals', () => {
    for (const s of ['Approve', 'approve it', 'Yes, do it', 'yes do it.', 'Okay, approve all', 'Hey Symphony, approve', 'do it please']) {
      expect(talkIntent(s, true)).toBe('approve')
      expect(talkIntent(s, false)).toBeNull()
    }
    // An answer to Symphony's question is not an approval.
    for (const s of ['yes', 'Yes please', 'Tacos', 'approve the dinner plan for Tuesday but move soccer']) expect(talkIntent(s, true)).toBeNull()
  })
  it('not now dismisses a card that is up', () => {
    expect(talkIntent('Not now', true)).toBe('dismiss')
    expect(talkIntent('never mind', true)).toBe('dismiss')
    expect(talkIntent('not now', false)).toBeNull()
  })
  it('"plan the week" starts planning, card or not', () => {
    for (const s of ['Help me plan the week', "Let's plan the week", 'plan the rest of the week', 'Hey Symphony, plan our week.']) expect(talkIntent(s, false)).toBe('plan-week')
    expect(talkIntent('plan dinner on Tuesday', false)).toBeNull()
  })
})

it('full-stage moments use the reply band', () => {
  expect(talkUsesBand('out-the-door')).toBe(true)
  expect(talkUsesBand('bedtime')).toBe(true)
  expect(talkUsesBand('rest')).toBe(false)
})

it('withTimeout rejects a slow answer', async () => {
  await expect(withTimeout(new Promise(() => {}), 5)).rejects.toThrow('timeout')
  await expect(withTimeout(Promise.resolve(3), 50)).resolves.toBe(3)
})

describe('drawing a change card', () => {
  const info = (id: string): TalkTaskInfo | null => (id === 'read'
    ? { title: 'Reading', at: new Date(2026, 9, 15, 17, 30), allDay: false, who: ['Ella', 'Kaleb'] }
    : id === 'pick' ? { title: 'Pick up the kids', at: new Date(2026, 9, 15, 16, 0), allDay: false, who: ['Scott'] } : null)
  const set: ChangeSet = {
    key: 's1', title: 'Iris picks up, reading after dinner',
    ops: [
      { key: 'a', op: 'assign', taskId: 'pick', title: 'Pick up the kids', assignee: 'i', assigneeName: 'Iris' },
      { key: 'b', op: 'place', taskId: 'read', title: 'Reading', date: '2026-10-15', time: '19:00' },
      { key: 'c', op: 'add', title: 'Call the plumber', date: '2026-10-17', time: '10:00' },
    ],
  }
  const rows: WallTodayRow[] = [
    { id: 'task-pick', kind: 'task', time: '4p', end: null, title: 'Pick up the kids', sub: null, owners: [], past: false, now: false, startsAt: new Date(2026, 9, 15, 16).getTime() },
    { id: 'task-read', kind: 'task', time: '5:30p', end: null, title: 'Reading', sub: null, owners: [], past: false, now: false, startsAt: new Date(2026, 9, 15, 17, 30).getTime() },
    { id: 'event-d', kind: 'event', time: '6:30p', end: null, title: 'Dinner', sub: 'Not planned yet', owners: [], past: false, now: false, startsAt: new Date(2026, 9, 15, 18, 30).getTime() },
  ]

  it('groups by day: where things go and where moved things were', () => {
    expect(cardDays(set, info)).toEqual(['2026-10-15', '2026-10-17'])
  })

  it("a day's rows: proposals dashed, the old slot a dotted trace, the rest plain, in time order", () => {
    const e = dayEntries('2026-10-15', rows, set.ops, info, today)
    expect(e.map((x) => [x.kind, x.time, x.title, x.by])).toEqual([
      ['prop', '4:00', 'Pick up the kids', 'Scott → Iris'],
      ['trace', '5:30', 'Reading', 'moving to 7:00'],
      ['plain', '6:30', 'Dinner', 'Not planned yet'],
      ['prop', '7:00', 'Reading', 'Ella, Kaleb'],
    ])
    expect(dayEntries('2026-10-17', [], set.ops, info, today).map((x) => [x.kind, x.time, x.title])).toEqual([['prop', '10:00', 'Call the plumber']])
  })

  it('a move to another day leaves a trace naming the day', () => {
    const moved = dayEntries('2026-10-15', [], [{ key: 'm', op: 'place', taskId: 'read', title: 'Reading', date: '2026-10-16' }], info, today)
    expect(moved).toEqual([expect.objectContaining({ kind: 'trace', by: 'moving to Fri, Oct 16' })])
  })

  it('card lines say what changes and for whom', () => {
    expect(cardLine(set.ops[0], info('pick'), today)).toEqual({ kind: 'WHO', title: 'Pick up the kids', detail: 'Scott → Iris' })
    expect(cardLine(set.ops[1], info('read'), today)).toEqual({ kind: 'MOVE', title: 'Reading', detail: 'Tomorrow at 5:30 → 7:00 · Ella, Kaleb' })
    expect(cardLine(set.ops[2], null, today)).toEqual({ kind: 'ADD', title: 'Call the plumber', detail: 'Sat, Oct 17 at 10:00' })
  })

  it('card lines name every day with its date, never a bare weekday', () => {
    const move = { key: 'm', op: 'place' as const, taskId: 'read', title: 'Reading', date: '2026-10-21', time: '17:00' }
    expect(cardLine(move, info('read'), today).detail).toBe('Tomorrow at 5:30 → Wed, Oct 21 at 5:00 · Ella, Kaleb')
  })

  it('an add with no day says which week it lands in', () => {
    const add = { key: 'a', op: 'add' as const, title: 'Fix the gate' }
    expect(cardLine(add, null, today, new Date(2026, 9, 17)).detail).toBe('No day yet · week of Sat, Oct 17 – Fri, Oct 23')
  })

  it('dayWord names a day past tomorrow with its date', () => {
    expect(dayWord('2026-10-14', today)).toBe('today')
    expect(dayWord('2026-10-15', today)).toBe('tomorrow')
    expect(dayWord('2026-10-17', today)).toBe('Saturday, Oct 17')
  })

  it('fitting a day keeps every proposal and the plain rows nearest them', () => {
    const many = [0, 1, 2, 3, 4, 5].map((i) => ({ key: `p${i}`, kind: 'plain' as const, time: `${8 + i}:00`, title: `Row ${i}`, by: null, min: (8 + i) * 60 }))
    const prop = { key: 'x', kind: 'prop' as const, time: '13:30', title: 'New', by: null, min: 13 * 60 + 30 }
    const { rows: kept, hidden } = fitEntries([...many, prop].sort((a, b) => a.min - b.min), 3)
    expect(kept.map((r) => r.key)).toEqual(['p4', 'p5', 'x'])
    expect(hidden).toBe(4)
  })
})

describe('withTimeout', () => {
  it('tells the caller when it stopped waiting, so the work can be aborted', async () => {
    const onTimeout = vi.fn()
    const never = new Promise<string>(() => {})
    await expect(withTimeout(never, 5, onTimeout)).rejects.toThrow('timeout')
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })
  it('does not fire the timeout once the work finished', async () => {
    const onTimeout = vi.fn()
    expect(await withTimeout(Promise.resolve('ok'), 5, onTimeout)).toBe('ok')
    await new Promise((r) => setTimeout(r, 10))
    expect(onTimeout).not.toHaveBeenCalled()
  })
})
