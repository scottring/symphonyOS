import { describe, it, expect } from 'vitest'
import { dayLabel, weekSpan, pushTargets, planWeek } from './wallDates'
import { localYmd } from '@/lib/cadence/config'

// Wed Oct 21 2026, mid-afternoon. The household's weeks start on Saturday:
// this week is Sat Oct 17 – Fri Oct 23, next week Sat Oct 24 – Fri Oct 30.
const WED = new Date(2026, 9, 21, 15, 0)
const SAT = 6 as const

describe('dayLabel', () => {
  it('names today and tomorrow, and every other day with its date', () => {
    expect(dayLabel(new Date(2026, 9, 21), WED)).toBe('Today')
    expect(dayLabel(new Date(2026, 9, 22, 9), WED)).toBe('Tomorrow')
    expect(dayLabel(new Date(2026, 9, 24), WED)).toBe('Sat, Oct 24')
    expect(dayLabel(new Date(2026, 9, 31), WED)).toBe('Sat, Oct 31')
    expect(dayLabel(new Date(2026, 9, 20), WED)).toBe('Tue, Oct 20')
  })
})

describe('weekSpan', () => {
  it('names both ends of the week with weekday and date', () => {
    expect(weekSpan(new Date(2026, 9, 24))).toBe('Sat, Oct 24 – Fri, Oct 30')
    expect(weekSpan(new Date(2026, 9, 31))).toBe('Sat, Oct 31 – Fri, Nov 6')
  })
})

describe('pushTargets', () => {
  const t = pushTargets(WED, SAT)

  it('gives every preset a date under its label', () => {
    expect(t['this-week'].sub).toBe('Sat, Oct 17 – Fri, Oct 23')
    expect(t['next-week'].sub).toBe('Sat, Oct 24 – Fri, Oct 30')
    expect(t['this-weekend'].sub).toBe('Sat, Oct 24')
    expect(t['next-weekend'].sub).toBe('Sat, Oct 31')
    expect(t['next-month'].sub).toBe('November')
    expect(t.someday.sub).toBe('No date')
  })

  it('moves a task into the week it names, by that week’s start', () => {
    expect(localYmd(t['this-week'].updates.weekStart!)).toBe('2026-10-17')
    expect(t['this-week'].updates.bucket).toBe('week')
    expect(localYmd(t['next-week'].updates.weekStart!)).toBe('2026-10-24')
    expect(t['next-week'].updates.bucket).toBe('week')
    expect(t['next-week'].updates.scheduledFor).toBeUndefined()
  })

  it('moves a task into next month by its first day', () => {
    expect(t['next-month'].updates.bucket).toBe('month')
    expect(localYmd(t['next-month'].updates.monthStart!)).toBe('2026-11-01')
  })

  it('puts a weekend task on that Saturday, all day', () => {
    expect(localYmd(t['this-weekend'].updates.scheduledFor!)).toBe('2026-10-24')
    expect(t['this-weekend'].updates.isAllDay).toBe(true)
    expect(localYmd(t['next-weekend'].updates.scheduledFor!)).toBe('2026-10-31')
  })

  it('says where a task went, with the dates', () => {
    expect(t['next-week'].flash).toBe('Moved to next week · Sat, Oct 24 – Fri, Oct 30')
    expect(t['this-weekend'].flash).toBe('Moved to this weekend · Sat, Oct 24')
    expect(t['next-month'].flash).toBe('Moved to next month · November')
    expect(t.someday.flash).toBe('Moved to Someday')
  })

  it('follows the week start it is given', () => {
    const sun = pushTargets(WED, 0)
    expect(sun['this-week'].sub).toBe('Sun, Oct 18 – Sat, Oct 24')
    expect(localYmd(sun['next-week'].updates.weekStart!)).toBe('2026-10-25')
  })
})

describe('planWeek', () => {
  it('mid-week plans the rest of this week, from today', () => {
    const p = planWeek(WED, SAT)
    expect(localYmd(p.start)).toBe('2026-10-17')
    expect(localYmd(p.from)).toBe('2026-10-21')
    expect(p.label).toBe('Wed, Oct 21 – Fri, Oct 23')
    expect(p.opening).toBe('Help me plan the rest of this week, Wed, Oct 21 – Fri, Oct 23.')
  })

  it('on the week’s first day plans the whole week', () => {
    const p = planWeek(new Date(2026, 9, 17, 9), SAT)
    expect(p.label).toBe('Sat, Oct 17 – Fri, Oct 23')
    expect(p.opening).toBe('Help me plan the week of Sat, Oct 17 – Fri, Oct 23.')
  })

  it('on the week’s last day plans next week', () => {
    const p = planWeek(new Date(2026, 9, 23, 18), SAT)
    expect(localYmd(p.start)).toBe('2026-10-24')
    expect(localYmd(p.from)).toBe('2026-10-24')
    expect(p.label).toBe('Sat, Oct 24 – Fri, Oct 30')
    expect(p.opening).toBe('Help me plan the week of Sat, Oct 24 – Fri, Oct 30.')
  })

  it('lists the days it plans, in order', () => {
    expect(planWeek(WED, SAT).days.map(localYmd)).toEqual(['2026-10-21', '2026-10-22', '2026-10-23'])
  })
})
