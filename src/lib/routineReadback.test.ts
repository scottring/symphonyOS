import { describe, it, expect } from 'vitest'
import { scheduleReadback, nextOccurrenceLabel, ruleSentence } from './routineReadback'
import { parseRoutine, parsedRoutineToDb } from './parseRoutine'
import { detectRecurrence, recurrenceToRRule, nextOccurrence, describeRecurrence } from './quickRecurrence'

// Thu Oct 1 2026, mid-morning — fixed, never the wall clock.
const NOW = new Date('2026-10-01T10:00:00')

describe('scheduleReadback', () => {
  it('says what a bare quarterly rule actually does', () => {
    expect(scheduleReadback({ type: 'quarterly' }, null, NOW)).toBe('Every 3 months on the 1st (Jan, Apr, Jul, Oct) · next: today')
    expect(scheduleReadback({ type: 'quarterly' }, null, new Date('2026-10-02T09:00:00')))
      .toBe('Every 3 months on the 1st (Jan, Apr, Jul, Oct) · next: Fri, Jan 1, 2027')
  })

  it('reads a first-weekend rule as a window', () => {
    expect(scheduleReadback({ type: 'monthly', week_of_month: 1, day_of_week: 'weekend' }, null, NOW))
      .toBe('Monthly, first weekend (either day) · next: Sat–Sun, Oct 3–4')
    expect(scheduleReadback({ type: 'monthly', week_of_month: 1, day_of_week: 'weekend' }, null, new Date('2026-10-05T09:00:00')))
      .toBe('Monthly, first weekend (either day) · next: Sat–Sun, Nov 7–8')
  })

  it('crosses a month boundary in the label', () => {
    expect(nextOccurrenceLabel({ type: 'monthly', week_of_month: -1, day_of_week: 'weekend' }, null, NOW)).toBe('Sat–Sun, Oct 31–Nov 1')
  })

  it('a weekday position with a time', () => {
    expect(scheduleReadback({ type: 'monthly', week_of_month: -1, day_of_week: 'fri' }, '17:30', NOW))
      .toBe('Monthly, last Friday · next: Fri, Oct 30 at 5:30 PM')
  })

  it('a date rule, including the short-month promise', () => {
    expect(scheduleReadback({ type: 'monthly', day_of_month: 15 }, null, NOW)).toBe('Monthly on the 15th · next: Thu, Oct 15')
    expect(ruleSentence({ type: 'monthly', day_of_month: 31 })).toBe('Monthly on the 31st (or the last day, in shorter months)')
  })

  it('tomorrow is said as tomorrow', () => {
    expect(nextOccurrenceLabel({ type: 'weekly', days: ['fri'] }, '07:00', NOW)).toBe('tomorrow at 7:00 AM')
  })

  it('a rule with no day promises no date', () => {
    expect(scheduleReadback({ type: 'monthly' }, null, NOW)).toBe('Once a month, on a day you choose')
    expect(scheduleReadback({ type: 'weekly', days: [] }, null, NOW)).toBe('Once a week, on a day you choose')
    expect(scheduleReadback({ type: 'since_last', interval: 6, unit: 'weeks' }, null, NOW)).toBe('6 weeks after the last time')
  })

  it('the weekend window', () => {
    expect(scheduleReadback({ type: 'weekend' }, null, NOW)).toBe('Every weekend, either day · next: Sat–Sun, Oct 3–4')
  })
})

describe('parseRoutine — monthly by position', () => {
  const cases: Array<[string, number, string, string]> = [
    ['wash comforters first weekend of the month', 1, 'weekend', 'wash comforters'],
    ['wash comforters monthly on the first weekend', 1, 'weekend', 'wash comforters'],
    ['book club the last friday of every month', -1, 'fri', 'book club'],
    ['pay rent on the 2nd tuesday of each month', 2, 'tue', 'pay rent'],
    ['every month on the third saturday clean gutters', 3, 'sat', 'clean gutters'],
  ]
  for (const [input, week, dow, action] of cases) {
    it(input, () => {
      const parsed = parseRoutine(input)
      expect(parsed.recurrence).toMatchObject({ type: 'monthly', weekOfMonth: week, dayOfWeek: dow })
      expect(parsed.action.trim()).toBe(action)
      expect(parsedRoutineToDb(parsed).recurrence_pattern).toEqual({ type: 'monthly', week_of_month: week, day_of_week: dow })
    })
  }

  it('a plain day number still reads as a date', () => {
    expect(parsedRoutineToDb(parseRoutine('pay bills monthly on the 10th')).recurrence_pattern).toEqual({ type: 'monthly', day_of_month: 10 })
  })
})

describe('quick capture — monthly by position', () => {
  it('detects the rule and the first occurrence', () => {
    const rec = detectRecurrence('wash comforters first weekend of every month', NOW)
    expect(rec?.pattern).toEqual({ type: 'monthly', week_of_month: 1, day_of_week: 'weekend' })
    expect(rec?.rest).toBe('wash comforters')
    expect(nextOccurrence(rec!.pattern, null, NOW).toDateString()).toBe(new Date('2026-10-03T00:00:00').toDateString())
  })

  it('"of each month" is a rule cue on its own', () => {
    expect(detectRecurrence('book club last friday of each month', NOW)?.pattern).toEqual({ type: 'monthly', week_of_month: -1, day_of_week: 'fri' })
  })

  it('"of the month" without a cue stays a one-off', () => {
    expect(detectRecurrence('dentist the first friday of the month', NOW)).toBeNull()
  })

  it('RRULE and chip label', () => {
    expect(recurrenceToRRule({ type: 'monthly', week_of_month: -1, day_of_week: 'fri' })).toEqual(['RRULE:FREQ=MONTHLY;BYDAY=-1FR'])
    expect(recurrenceToRRule({ type: 'monthly', week_of_month: 1, day_of_week: 'weekend' })).toEqual(['RRULE:FREQ=MONTHLY;BYDAY=1SA'])
    expect(describeRecurrence({ type: 'monthly', week_of_month: 1, day_of_week: 'weekend' })).toBe('Monthly, first weekend')
  })

  it('nextOccurrence moves past a window whose day is gone', () => {
    // Sunday Nov 8 at 8pm with a 9am time: the window is spent → December.
    const at = nextOccurrence({ type: 'monthly', week_of_month: 1, day_of_week: 'weekend' }, '09:00', new Date('2026-11-08T20:00:00'))
    expect(at.toDateString()).toBe(new Date('2026-12-05T00:00:00').toDateString())
  })
})
