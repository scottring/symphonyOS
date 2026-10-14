import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_SEASONS, type Seasons } from '@/lib/cadence/seasons'
import {
  talkFor, dueTalks, readDismissals, putOffUntilTomorrow, skipThisTime, isPutOff, listIsEmpty, talkLead, type PlanTalk,
} from './planSchedule'

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9)
const ymd = (t: PlanTalk | null) => t && `${t.start.getFullYear()}-${t.start.getMonth() + 1}-${t.start.getDate()}`
// Scott's household: quarters (Fall is Oct 1 – Dec 31, Winter from Jan 1).
const QUARTERS: Seasons = [
  { name: 'Winter', month: 1, day: 1 }, { name: 'Spring', month: 4, day: 1 },
  { name: 'Summer', month: 7, day: 1 }, { name: 'Fall', month: 10, day: 1 },
]
const empty = () => true
const none = { later: {}, skipped: {} }

beforeEach(() => localStorage.clear())

describe('the windows', () => {
  it('Month: from three days before it starts through day 7', () => {
    expect(talkFor('month', day(2026, 10, 28), DEFAULT_SEASONS)).toBeNull()
    expect(ymd(talkFor('month', day(2026, 10, 29), DEFAULT_SEASONS))).toBe('2026-11-1')
    const nov = talkFor('month', day(2026, 10, 30), DEFAULT_SEASONS)!
    expect(nov).toMatchObject({ level: 'month', name: 'November', label: 'Plan November', message: 'Plan November.', key: 'month:2026-11-01' })
    expect(ymd(talkFor('month', day(2026, 11, 7), DEFAULT_SEASONS))).toBe('2026-11-1')
    expect(talkFor('month', day(2026, 11, 8), DEFAULT_SEASONS)).toBeNull()
  })
  it('Season: from seven days before it starts through day 14, by the household’s seasons', () => {
    expect(talkFor('season', day(2026, 12, 24), QUARTERS)).toBeNull()
    expect(talkFor('season', day(2026, 12, 25), QUARTERS)).toMatchObject({ name: 'Winter', label: 'Plan Winter', key: 'season:2027-01-01' })
    expect(ymd(talkFor('season', day(2027, 1, 14), QUARTERS))).toBe('2027-1-1')
    expect(talkFor('season', day(2027, 1, 15), QUARTERS)).toBeNull()
    // Default seasons start Dec 1: the window moves with them.
    expect(talkFor('season', day(2026, 11, 24), DEFAULT_SEASONS)).toMatchObject({ name: 'Winter', key: 'season:2026-12-01' })
    expect(talkFor('season', day(2026, 11, 23), DEFAULT_SEASONS)).toBeNull()
  })
  it('Year: Dec 25 through Jan 14', () => {
    expect(talkFor('year', day(2026, 12, 24), DEFAULT_SEASONS)).toBeNull()
    expect(talkFor('year', day(2026, 12, 25), DEFAULT_SEASONS)).toMatchObject({ name: '2027', label: 'Plan 2027', message: 'Plan 2027.', key: 'year:2027-01-01' })
    expect(talkFor('year', day(2027, 1, 14), DEFAULT_SEASONS)?.name).toBe('2027')
    expect(talkFor('year', day(2027, 1, 15), DEFAULT_SEASONS)).toBeNull()
  })
})

describe('what is due', () => {
  it('only while the coming list is empty', () => {
    expect(dueTalks(day(2026, 10, 30), DEFAULT_SEASONS, empty, none).map((t) => t.label)).toEqual(['Plan November'])
    expect(dueTalks(day(2026, 10, 30), DEFAULT_SEASONS, () => false, none)).toEqual([])
    expect(dueTalks(day(2026, 10, 15), DEFAULT_SEASONS, empty, none)).toEqual([])
  })
  it('several at once come Year, then Season, then Month', () => {
    expect(dueTalks(day(2026, 12, 30), QUARTERS, empty, none).map((t) => t.label)).toEqual(['Plan 2027', 'Plan Winter', 'Plan January'])
  })
  it('Later hides it until tomorrow; Not this time until the next period', () => {
    const today = day(2026, 10, 30)
    const nov = talkFor('month', today, DEFAULT_SEASONS)!
    putOffUntilTomorrow(nov, today)
    expect(isPutOff(nov, today, readDismissals())).toBe(true)
    expect(dueTalks(today, DEFAULT_SEASONS, empty, readDismissals())).toEqual([])
    expect(dueTalks(day(2026, 10, 31), DEFAULT_SEASONS, empty, readDismissals()).map((t) => t.label)).toEqual(['Plan November'])
    skipThisTime(nov)
    expect(dueTalks(day(2026, 11, 3), DEFAULT_SEASONS, empty, readDismissals())).toEqual([])
    // December is another period: it comes as usual.
    expect(dueTalks(day(2026, 11, 29), QUARTERS, empty, readDismissals()).map((t) => t.label)).toEqual(['Plan December'])
  })
  it('reads junk or nothing as nothing put off', () => {
    localStorage.setItem('symphony.planTalk.dismissed', '{not json')
    expect(readDismissals()).toEqual({ later: {}, skipped: {} })
  })
})

describe('the coming list', () => {
  const nov = talkFor('month', day(2026, 10, 30), DEFAULT_SEASONS)!
  const base = { goals: [], meId: null, seasons: DEFAULT_SEASONS, today: day(2026, 10, 30) }
  it('a month or season list is empty when nothing is committed to it', () => {
    const oct = { id: 'a', title: 'Taxes', bucket: 'month', monthStart: new Date(2026, 9, 1), createdAt: new Date(2026, 9, 1) } as never
    const novTask = { id: 'b', title: 'Cabin', bucket: 'month', monthStart: new Date(2026, 10, 1), createdAt: new Date(2026, 9, 1) } as never
    expect(listIsEmpty(nov, { ...base, tasks: [oct] })).toBe(true)
    expect(listIsEmpty(nov, { ...base, tasks: [oct, novTask] })).toBe(false)
  })
  it('a year list is empty when it has no goals that are not archived', () => {
    const y = talkFor('year', day(2026, 12, 27), DEFAULT_SEASONS)!
    expect(listIsEmpty(y, { ...base, tasks: [], goals: [{ year: 2027, status: 'archived' }, { year: 2026, status: 'active' }] })).toBe(true)
    expect(listIsEmpty(y, { ...base, tasks: [], goals: [{ year: 2027, status: 'active' }] })).toBe(false)
  })
})

describe('talkLead', () => {
  it('names when the period starts', () => {
    const nov = talkFor('month', day(2026, 10, 30), DEFAULT_SEASONS)!
    expect(talkLead(nov, day(2026, 10, 30))).toBe('November starts Sunday')
    expect(talkLead(nov, day(2026, 10, 31))).toBe('November starts tomorrow')
    expect(talkLead(nov, day(2026, 11, 1))).toBe('November starts today')
    expect(talkLead(nov, day(2026, 11, 4))).toBe('November has begun')
  })
})
