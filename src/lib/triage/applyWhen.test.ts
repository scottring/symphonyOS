import { describe, it, expect, vi, afterEach } from 'vitest'
import { applyTriageWhen, poolPatch, dayForWhen } from './applyWhen'
import type { TriageClock } from './periods'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'

const handlers = () => ({
  onPushTask: vi.fn(async () => true),
  onSetBucket: vi.fn(async () => true),
  onUpdateTask: vi.fn(async () => true),
  onFocus: vi.fn(async () => undefined),
})

// Mon Oct 12 2026, Saturday weeks (Scott's household), default seasons.
const SAT_WEEKS: TriageClock = { now: new Date(2026, 9, 12, 9, 30), weekStartsOn: 6, seasons: DEFAULT_SEASONS }

// Spec S4: "Today" is the Today command — dated today AND chosen for my focus.
// Every other when is a date (or a list) only and never touches focus.
describe('applyTriageWhen — the Today command', () => {
  afterEach(() => { vi.useRealTimers() })

  it('"today" dates the task today and chooses it for focus', async () => {
    const h = handlers()
    expect(await applyTriageWhen('today', 't1', h)).toBe(true)
    const day = (h.onPushTask.mock.calls[0] as unknown[])[1] as Date
    expect(day.toDateString()).toBe(new Date().toDateString())
    expect(h.onFocus).toHaveBeenCalledWith('t1', day)
  })

  it.each(['tomorrow', 'tonight', 'next-week', 'this-week', 'someday'] as const)(
    '"%s" never touches focus', async (when) => {
      const h = handlers()
      await applyTriageWhen(when, 't1', h)
      expect(h.onFocus).not.toHaveBeenCalled()
    })

  it('a cancelled domain gate writes no focus either', async () => {
    const h = { ...handlers(), onPushTask: vi.fn(async () => false) }
    expect(await applyTriageWhen('today', 't1', h)).toBe(false)
    expect(h.onFocus).not.toHaveBeenCalled()
  })
})

describe('applyTriageWhen — where each When lands (actual today, household week, seasons)', () => {
  it('Tomorrow is the day after the ACTUAL today, all day', async () => {
    const h = handlers()
    await applyTriageWhen('tomorrow', 't1', h, SAT_WEEKS)
    expect(h.onPushTask).toHaveBeenCalledWith('t1', new Date(2026, 9, 13))
  })

  it('Tonight carries 6 PM', () => {
    expect(dayForWhen('tonight', SAT_WEEKS)).toEqual(new Date(2026, 9, 12, 18))
  })

  it('This week / Next week are week lists under Saturday weeks, not a Monday date', async () => {
    const h = handlers()
    await applyTriageWhen('this-week', 't1', h, SAT_WEEKS)
    expect(h.onUpdateTask).toHaveBeenLastCalledWith('t1', { bucket: 'week', weekStart: new Date(2026, 9, 10), scheduledFor: undefined })
    await applyTriageWhen('next-week', 't1', h, SAT_WEEKS)
    expect(h.onUpdateTask).toHaveBeenLastCalledWith('t1', { bucket: 'week', weekStart: new Date(2026, 9, 17), scheduledFor: undefined })
    expect(h.onPushTask).not.toHaveBeenCalled()
  })

  it('Next week under Monday weeks starts the next Monday', () => {
    expect(poolPatch('next-week', { ...SAT_WEEKS, weekStartsOn: 1 })).toMatchObject({ weekStart: new Date(2026, 9, 19) })
  })

  it('Next weekend is that weekend, either day (no silent Saturday)', async () => {
    const h = handlers()
    await applyTriageWhen('next-weekend', 't1', h, SAT_WEEKS)
    expect(h.onUpdateTask).toHaveBeenCalledWith('t1', expect.objectContaining({ bucket: 'week', weekendStart: new Date(2026, 9, 24), scheduledFor: undefined }))
  })

  it('Next month is November’s list, not a date on the 1st', async () => {
    const h = handlers()
    await applyTriageWhen('next-month', 't1', h, SAT_WEEKS)
    expect(h.onUpdateTask).toHaveBeenCalledWith('t1', { bucket: 'month', monthStart: new Date(2026, 10, 1), scheduledFor: undefined })
  })

  it('This season follows the household’s own seasons', async () => {
    const h = handlers()
    const custom: TriageClock = { ...SAT_WEEKS, seasons: [
      { name: 'Thaw', month: 2, day: 15 }, { name: 'Long days', month: 5, day: 20 },
      { name: 'Harvest', month: 8, day: 25 }, { name: 'Hearth', month: 11, day: 10 },
    ] }
    await applyTriageWhen('this-season', 't1', h, custom)
    expect(h.onUpdateTask).toHaveBeenCalledWith('t1', { bucket: 'quarter', seasonStart: new Date(2026, 7, 25), scheduledFor: undefined })
  })

  it('Someday is the Someday list', async () => {
    const h = handlers()
    await applyTriageWhen('someday', 't1', h, SAT_WEEKS)
    expect(h.onSetBucket).toHaveBeenCalledWith('t1', 'someday')
  })

  it('a refused pool write resolves false', async () => {
    const h = { ...handlers(), onUpdateTask: vi.fn(async () => false) }
    expect(await applyTriageWhen('next-month', 't1', h, SAT_WEEKS)).toBe(false)
  })
})
