import { describe, it, expect } from 'vitest'
import { partitionBets, betPulse, servingCount, goalChapters, wonBets, BET_CAP } from './betPulse'
import type { Task } from '@/types/task'

let n = 0
function task(over: Partial<Task>): Task {
  n += 1
  return {
    id: `t${n}`, title: `task ${n}`, completed: false,
    createdAt: new Date(2026, 6, 1 + n), // July, ordered
    ...over,
  } as Task
}

const NOW = new Date(2026, 6, 20) // Jul 20 — summer (Jun/Jul/Aug), current month = Jul

describe('partitionBets', () => {
  it('splits open quarter tasks: first 8 by createdAt are bets, rest overflow', () => {
    const bets = Array.from({ length: 10 }, () => task({ bucket: 'quarter' }))
    const noise = [task({ bucket: 'month' }), task({ bucket: 'quarter', completed: true })]
    const { bets: b, overflow } = partitionBets([...bets, ...noise])
    expect(b).toHaveLength(BET_CAP)
    expect(overflow).toHaveLength(2)
    expect(b[0].id).toBe(bets[0].id)
    expect(overflow[0].id).toBe(bets[8].id)
  })
})

describe('betPulse', () => {
  it('marks a month with a threaded scheduled move; current month bucket=month counts too', () => {
    const bet = task({ bucket: 'quarter' })
    const julyMove = task({ bucket: 'timed', scheduledFor: new Date(2026, 6, 25), sourceId: bet.id })
    const monthMove = task({ bucket: 'month', sourceId: bet.id, completed: true })
    const p = betPulse(bet, [bet, julyMove, monthMove], NOW)
    expect(p.months.map((m) => m.label)).toEqual(['Jun', 'Jul', 'Aug'])
    expect(p.months[1].hasMoves).toBe(true)
    expect(p.months[1].hasDone).toBe(true) // completed month-bucket move
    expect(p.months[0].hasMoves).toBe(false)
    expect(p.starving).toBe(false)
  })

  it('threads via shared goalId as well as sourceId', () => {
    const bet = task({ bucket: 'quarter', goalId: 'g1' })
    const move = task({ bucket: 'timed', scheduledFor: new Date(2026, 7, 3), goalId: 'g1' })
    const p = betPulse(bet, [bet, move], NOW)
    expect(p.months[2].hasMoves).toBe(true)
  })

  it('starving = open bet with no moves in the current month', () => {
    const bet = task({ bucket: 'quarter' })
    const p = betPulse(bet, [bet], NOW)
    expect(p.starving).toBe(true)
    const won = task({ bucket: 'quarter', completed: true })
    expect(betPulse(won, [won], NOW).starving).toBe(false)
  })
})

describe('servingCount', () => {
  it('counts open bets with at least one current-month move', () => {
    const fed = task({ bucket: 'quarter' })
    const starved = task({ bucket: 'quarter' })
    const move = task({ bucket: 'month', sourceId: fed.id })
    expect(servingCount([fed, starved, move], NOW)).toEqual({ serving: 1, total: 2 })
  })
})

describe('wonBets', () => {
  it('includes a completed quarter task created this season', () => {
    const won = task({ bucket: 'quarter', completed: true, createdAt: new Date(2026, 6, 5) })
    expect(wonBets([won], NOW)).toEqual([won])
  })

  it('excludes a completed quarter task created in a past season', () => {
    const wonLastSeason = task({ bucket: 'quarter', completed: true, createdAt: new Date(2026, 3, 5) }) // Spring
    expect(wonBets([wonLastSeason], NOW)).toEqual([])
  })

  it('excludes open (incomplete) quarter tasks', () => {
    const open = task({ bucket: 'quarter', completed: false, createdAt: new Date(2026, 6, 5) })
    expect(wonBets([open], NOW)).toEqual([])
  })

  it('excludes rows with an unparsable createdAt instead of throwing', () => {
    const bad = task({ bucket: 'quarter', completed: true, createdAt: 'not-a-date' as unknown as Date })
    expect(() => wonBets([bad], NOW)).not.toThrow()
    expect(wonBets([bad], NOW)).toEqual([])
  })
})

describe('goalChapters', () => {
  it('groups goal-threaded bets by the season they were created in', () => {
    const spring = task({ bucket: 'quarter', goalId: 'g1', createdAt: new Date(2026, 3, 5), completed: true })
    const summer = task({ bucket: 'quarter', goalId: 'g1', createdAt: new Date(2026, 6, 5) })
    const other = task({ bucket: 'quarter', goalId: 'g2' })
    const ch = goalChapters('g1', [spring, summer, other])
    expect(ch).toHaveLength(2)
    expect(ch[0]).toMatchObject({ label: 'Spring 2026', state: 'won' })
    expect(ch[1]).toMatchObject({ label: 'Summer 2026', state: 'open' })
  })

  it('winter wrap: bets created in Dec and Jan of same season both labeled with season start year', () => {
    const decBet = task({ bucket: 'quarter', goalId: 'g1', createdAt: new Date(2026, 11, 10) })
    const janBet = task({ bucket: 'quarter', goalId: 'g1', createdAt: new Date(2027, 0, 15) })
    const ch = goalChapters('g1', [decBet, janBet])
    expect(ch).toHaveLength(2)
    expect(ch[0]).toMatchObject({ label: 'Winter 2026', state: 'open' })
    expect(ch[1]).toMatchObject({ label: 'Winter 2026', state: 'open' })
  })
})
