import { describe, it, expect, vi } from 'vitest'
import { appWriters } from './appWriters'
import { planPeriods } from './periods'
import { draftPeriods } from './flow'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'

// Thursday 8 October 2026, Saturday weeks.
const periods = planPeriods(new Date(2026, 9, 8, 15, 30), DEFAULT_SEASONS, 6)

describe('planPeriods', () => {
  it('names and dates every period explicitly', () => {
    expect(periods.labels).toEqual({ year: '2026', season: 'Fall', month: 'October', week: 'Oct 3 – 9', today: 'Thursday' })
    expect(periods.seasonStart).toEqual(new Date(2026, 8, 1)) // the default Fall starts 1 September
    expect(periods.monthStart).toEqual(new Date(2026, 9, 1))
    expect(periods.weekStart).toEqual(new Date(2026, 9, 3))
    expect(periods.today).toEqual(new Date(2026, 9, 8))
  })
})

describe('appWriters', () => {
  const fixed = draftPeriods(periods)
  const setup = (taskResult: string | undefined, goalResult: unknown, updateResult: boolean | void = true) => {
    const addGoal = vi.fn(async () => goalResult)
    const addTask = vi.fn(async () => taskResult)
    const updateTask = vi.fn(async () => updateResult)
    return { addGoal, addTask, updateTask, w: appWriters(addGoal, addTask, updateTask) }
  }

  it('the year is a goal for the session’s year, with the plan’s id', async () => {
    const { w, addGoal } = setup('ok', { id: 'g' })
    expect(await w.addYearGoal('Feel at home in the garden', { id: 'y1', context: 'personal', periods: fixed })).toBe(true)
    expect(addGoal).toHaveBeenCalledWith(null, 'Feel at home in the garden', 'personal', { id: 'y1', year: 2026 })
  })

  it('season, month and week land on their own lists with the session’s explicit periods and links', async () => {
    const { w, addTask } = setup('ok', { id: 'g' })
    await w.addTask('Two beds', { id: 's1', level: 'season', goalId: 'y1', context: 'family', periods: fixed })
    await w.addTask('First bed', { id: 'm1', level: 'month', goalId: 'y1', sourceId: 's1', context: 'family', periods: fixed })
    await w.addTask('Order lumber', { id: 'w1', level: 'week', goalId: 'y1', sourceId: 'm1', context: 'family', periods: fixed })
    expect(addTask.mock.calls.map((c) => (c as unknown[])[4])).toEqual([
      { id: 's1', context: 'family', goalId: 'y1', bucket: 'quarter', seasonStart: periods.seasonStart },
      { id: 'm1', context: 'family', goalId: 'y1', sourceId: 's1', bucket: 'month', monthStart: periods.monthStart },
      { id: 'w1', context: 'family', goalId: 'y1', sourceId: 'm1', bucket: 'week', weekStart: periods.weekStart },
    ])
  })

  it('a session begun last month still writes into last month', async () => {
    const { w, addTask } = setup('ok', { id: 'g' })
    const sept = { ...fixed, monthStart: '2026-09-01', weekStart: '2026-09-26' }
    await w.addTask('Old month line', { id: 'm0', level: 'month', context: 'work', periods: sept })
    expect((addTask.mock.calls[0] as unknown[])[4]).toMatchObject({ monthStart: new Date(2026, 8, 1) })
  })

  it('a task is chosen for today through updateTask, and only a confirmed write counts', async () => {
    const { w, updateTask, addTask } = setup('ok', { id: 'g' })
    expect(await w.planForToday('task-1', fixed)).toBe(true)
    expect(updateTask).toHaveBeenCalledWith('task-1', { plannedOn: periods.today })
    expect(addTask).not.toHaveBeenCalled()
    expect(await setup('ok', { id: 'g' }, false).w.planForToday('task-1', fixed)).toBe(false)
    // updateTask resolves void when it bailed out early (row not loaded): not a write.
    expect(await appWriters(vi.fn(), vi.fn(), vi.fn(async () => undefined)).planForToday('task-1', fixed)).toBe(false)
  })

  it('reports a refused write as not written', async () => {
    expect(await setup(undefined, { id: 'g' }).w.addTask('x', { id: 'a', level: 'week', context: 'work', periods: fixed })).toBe(false)
    expect(await setup('ok', null).w.addYearGoal('x', { id: 'b', context: 'work', periods: fixed })).toBe(false)
  })
})
