import { describe, it, expect } from 'vitest'
import { partitionSeason, partitionMonth, betPulse, servingCount, goalChapters, wonPicks, PICK_CAP } from './betPulse'
import type { Task } from '@/types/task'

let n = 0
function task(over: Partial<Task>): Task {
  n += 1
  return {
    id: `t${n}`, title: `task ${n}`, completed: false,
    createdAt: new Date(2026, 6, 1 + (n % 20)), // July, ordered
    ...over,
  } as Task
}

const NOW = new Date(2026, 6, 20) // Jul 20 — summer (Jun/Jul/Aug), current month = Jul

describe('partitionSeason', () => {
  it('splits open quarter tasks by explicit choice: picked → picks (by pickedAt), unpicked → bench (by createdAt)', () => {
    const p1 = task({ bucket: 'quarter', pickedAt: new Date(2026, 6, 10) })
    const p2 = task({ bucket: 'quarter', pickedAt: new Date(2026, 6, 5) })
    const b1 = task({ bucket: 'quarter' })
    const noise = [task({ bucket: 'month' }), task({ bucket: 'quarter', completed: true, pickedAt: new Date() })]
    const { picks, bench } = partitionSeason([p1, p2, b1, ...noise])
    expect(picks.map((t) => t.id)).toEqual([p2.id, p1.id]) // pickedAt order
    expect(bench.map((t) => t.id)).toEqual([b1.id])
  })

  it('has no implicit cap — picking is explicit; the cap is enforced by the swap UI', () => {
    const many = Array.from({ length: 10 }, (_, i) => task({ bucket: 'quarter', pickedAt: new Date(2026, 6, 1 + i) }))
    expect(partitionSeason(many).picks).toHaveLength(10)
    expect(PICK_CAP).toBe(10)
  })
})

describe('wonPicks', () => {
  it('keeps completed picks from the current season visible; bench completions and past seasons drop out', () => {
    const wonNow = task({ bucket: 'quarter', completed: true, pickedAt: new Date(2026, 6, 2) })
    const wonPastSeason = task({ bucket: 'quarter', completed: true, pickedAt: new Date(2026, 2, 2) })
    const benchDone = task({ bucket: 'quarter', completed: true })
    const got = wonPicks([wonNow, wonPastSeason, benchDone], NOW)
    expect(got.map((t) => t.id)).toEqual([wonNow.id])
  })

  it('skips malformed pickedAt rather than crashing seasonStart', () => {
    const bad = task({ bucket: 'quarter', completed: true, pickedAt: new Date('nonsense') })
    expect(wonPicks([bad], NOW)).toEqual([])
  })
})

describe('betPulse', () => {
  it('marks a month with a threaded scheduled move; current month bucket=month counts too', () => {
    const bet = task({ bucket: 'quarter', pickedAt: new Date() })
    const julyMove = task({ bucket: 'timed', scheduledFor: new Date(2026, 6, 25), sourceId: bet.id })
    const monthMove = task({ bucket: 'month', sourceId: bet.id, completed: true })
    const p = betPulse(bet, [bet, julyMove, monthMove], NOW)
    expect(p.months.map((m) => m.label)).toEqual(['Jun', 'Jul', 'Aug'])
    expect(p.months[1].hasMoves).toBe(true)
    expect(p.months[1].hasDone).toBe(true)
    expect(p.months[0].hasMoves).toBe(false)
    expect(p.starving).toBe(false)
  })

  it('threads via shared goalId as well as sourceId', () => {
    const bet = task({ bucket: 'quarter', goalId: 'g1', pickedAt: new Date() })
    const move = task({ bucket: 'timed', scheduledFor: new Date(2026, 7, 3), goalId: 'g1' })
    const p = betPulse(bet, [bet, move], NOW)
    expect(p.months[2].hasMoves).toBe(true)
  })

  it('starving = open pick with no moves in the current month', () => {
    const bet = task({ bucket: 'quarter', pickedAt: new Date() })
    const p = betPulse(bet, [bet], NOW)
    expect(p.starving).toBe(true)
    const won = task({ bucket: 'quarter', completed: true, pickedAt: new Date() })
    expect(betPulse(won, [won], NOW).starving).toBe(false)
  })
})

describe('servingCount', () => {
  it('counts open PICKS with at least one current-month move; the bench never counts', () => {
    const fed = task({ bucket: 'quarter', pickedAt: new Date(2026, 6, 2) })
    const starved = task({ bucket: 'quarter', pickedAt: new Date(2026, 6, 3) })
    const benched = task({ bucket: 'quarter' })
    const move = task({ bucket: 'month', sourceId: fed.id })
    expect(servingCount([fed, starved, benched, move], NOW)).toEqual({ serving: 1, total: 2 })
  })
})

describe('goalChapters', () => {
  it('groups goal-threaded PICKS by the season they were picked in; bench items make no chapter', () => {
    const spring = task({ bucket: 'quarter', goalId: 'g1', pickedAt: new Date(2026, 3, 5), completed: true })
    const summer = task({ bucket: 'quarter', goalId: 'g1', pickedAt: new Date(2026, 6, 5) })
    const benched = task({ bucket: 'quarter', goalId: 'g1' })
    const other = task({ bucket: 'quarter', goalId: 'g2', pickedAt: new Date() })
    const ch = goalChapters('g1', [spring, summer, benched, other])
    expect(ch).toHaveLength(2)
    expect(ch[0]).toMatchObject({ label: 'Spring 2026', state: 'won' })
    expect(ch[1]).toMatchObject({ label: 'Summer 2026', state: 'open' })
  })

  it('anchors the chapter year on season start across the winter wrap', () => {
    const dec = task({ bucket: 'quarter', goalId: 'g1', pickedAt: new Date(2026, 11, 10) })
    const jan = task({ bucket: 'quarter', goalId: 'g1', pickedAt: new Date(2027, 0, 15) })
    const ch = goalChapters('g1', [dec, jan])
    expect(ch).toHaveLength(2)
    expect(ch[0].label).toBe('Winter 2026')
    expect(ch[1].label).toBe('Winter 2026')
  })
})

describe('partitionMonth', () => {
  it('files each open month move under the pick it threads to; the rest go on the shelf', () => {
    const pick = task({ id: 'p1', bucket: 'quarter', pickedAt: NOW, goalId: 'g1' })
    const child = task({ id: 'm1', bucket: 'month', sourceId: 'p1' })
    const sameGoal = task({ id: 'm2', bucket: 'month', goalId: 'g1' })
    const loose = task({ id: 'm3', bucket: 'month' })
    const { byPick, shelf } = partitionMonth([pick], [pick, child, sameGoal, loose])
    expect(byPick.get('p1')?.map((t) => t.id)).toEqual(['m1', 'm2'])
    expect(shelf.map((t) => t.id)).toEqual(['m3'])
  })

  it('files a move under exactly one pick — sourceId wins over a shared goal', () => {
    const a = task({ id: 'p1', bucket: 'quarter', pickedAt: new Date(2026, 6, 1), goalId: 'g1' })
    const b = task({ id: 'p2', bucket: 'quarter', pickedAt: new Date(2026, 6, 2), goalId: 'g1' })
    const move = task({ id: 'm1', bucket: 'month', sourceId: 'p2', goalId: 'g1' })
    const { byPick } = partitionMonth([a, b], [a, b, move])
    expect(byPick.get('p1') ?? []).toEqual([])
    expect(byPick.get('p2')?.map((t) => t.id)).toEqual(['m1'])
  })

  it('files a goal-only move under the first pick serving that goal (never twice)', () => {
    const a = task({ id: 'p1', bucket: 'quarter', pickedAt: new Date(2026, 6, 1), goalId: 'g1' })
    const b = task({ id: 'p2', bucket: 'quarter', pickedAt: new Date(2026, 6, 2), goalId: 'g1' })
    const move = task({ id: 'm1', bucket: 'month', goalId: 'g1' })
    const { byPick } = partitionMonth([a, b], [a, b, move])
    expect(byPick.get('p1')?.map((t) => t.id)).toEqual(['m1'])
    expect(byPick.get('p2') ?? []).toEqual([])
  })

  it('ignores completed moves and anything outside the month bucket', () => {
    const pick = task({ id: 'p1', bucket: 'quarter', pickedAt: NOW, goalId: 'g1' })
    const done = task({ id: 'm1', bucket: 'month', sourceId: 'p1', completed: true })
    const weekly = task({ id: 'w1', bucket: 'week', sourceId: 'p1' })
    const { byPick, shelf } = partitionMonth([pick], [pick, done, weekly])
    expect(byPick.get('p1') ?? []).toEqual([])
    expect(shelf).toEqual([])
  })
})
