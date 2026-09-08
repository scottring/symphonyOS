import { describe, it, expect } from 'vitest'
import { detectRecurrence, recurrenceToRRule, nextOccurrence, describeRecurrence } from './quickRecurrence'

describe('detectRecurrence', () => {
  it('reads "every tuesday and thurs" as weekly Tue/Thu and strips the phrase', () => {
    const r = detectRecurrence('boxing every tuesday and thurs')
    expect(r).not.toBeNull()
    expect(r!.pattern).toEqual({ type: 'weekly', days: ['tue', 'thu'] })
    expect(r!.time).toBeNull()
    expect(r!.rest).toBe('boxing')
  })

  it('carries a time out of the phrase', () => {
    const r = detectRecurrence('boxing every tuesday at 6pm')
    expect(r!.pattern).toEqual({ type: 'weekly', days: ['tue'] })
    expect(r!.time).toBe('18:00')
    expect(r!.rest).toBe('boxing')
  })

  it('reads "every other monday"', () => {
    const r = detectRecurrence('lawn every other monday 7am')
    expect(r!.pattern).toMatchObject({ type: 'weekly', days: ['mon'], interval: 2 })
    expect(r!.time).toBe('07:00')
    expect(r!.rest).toBe('lawn')
  })

  it('reads plural weekdays without "every"', () => {
    const r = detectRecurrence('piano on tuesdays and thursdays')
    expect(r!.pattern).toEqual({ type: 'weekly', days: ['tue', 'thu'] })
    expect(r!.rest).toBe('piano')
  })

  it('reads "every weekday" and "daily"', () => {
    expect(detectRecurrence('standup every weekday 9am')!.pattern).toEqual({
      type: 'weekly', days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    })
    expect(detectRecurrence('meds every day')!.pattern).toEqual({ type: 'daily' })
  })

  it('reads a monthly date', () => {
    const r = detectRecurrence('rent every month on the 1st')
    expect(r!.pattern).toEqual({ type: 'monthly', day_of_month: 1 })
    expect(r!.rest).toBe('rent')
  })

  it('reads a time range as start + duration and leaves no preposition behind', () => {
    const r = detectRecurrence('Boxing every Tuesday and Thursday from 9am to 10:15am')
    expect(r!.pattern).toEqual({ type: 'weekly', days: ['tue', 'thu'] })
    expect(r!.time).toBe('09:00')
    expect(r!.durationMinutes).toBe(75)
    expect(r!.rest).toBe('Boxing')
  })

  it('reads dash ranges and infers a missing meridiem from the end', () => {
    expect(detectRecurrence('gym every mon 7-8am')).toMatchObject({ time: '07:00', durationMinutes: 60, rest: 'gym' })
    expect(detectRecurrence('lunch every friday 11:30 to 1pm')).toMatchObject({ time: '11:30', durationMinutes: 90, rest: 'lunch' })
    expect(detectRecurrence('piano on tuesdays 4–5:30pm')).toMatchObject({ time: '16:00', durationMinutes: 90, rest: 'piano' })
  })

  it('a bare number range is not a time', () => {
    const r = detectRecurrence('read every day 2 to 3 chapters')
    expect(r!.time).toBeNull()
    expect(r!.durationMinutes).toBeUndefined()
  })

  it('returns null with no recurrence cue — a bare weekday is a one-off date', () => {
    expect(detectRecurrence('text Karen tuesday')).toBeNull()
    expect(detectRecurrence('dentist next monday 3pm')).toBeNull()
    expect(detectRecurrence('buy milk tomorrow')).toBeNull()
  })

  it('does not fire on "every" used as a quantity', () => {
    expect(detectRecurrence('read every page of the contract')).toBeNull()
  })
})

describe('recurrenceToRRule', () => {
  it('weekly by day', () => {
    expect(recurrenceToRRule({ type: 'weekly', days: ['tue', 'thu'] })).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=TU,TH'])
  })
  it('every other week', () => {
    expect(recurrenceToRRule({ type: 'weekly', days: ['mon'], interval: 2 })).toEqual(['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO'])
  })
  it('daily and every N days', () => {
    expect(recurrenceToRRule({ type: 'daily' })).toEqual(['RRULE:FREQ=DAILY'])
    expect(recurrenceToRRule({ type: 'daily', interval: 3 })).toEqual(['RRULE:FREQ=DAILY;INTERVAL=3'])
  })
  it('monthly, quarterly, yearly', () => {
    expect(recurrenceToRRule({ type: 'monthly', day_of_month: 10 })).toEqual(['RRULE:FREQ=MONTHLY;BYMONTHDAY=10'])
    expect(recurrenceToRRule({ type: 'monthly' })).toEqual(['RRULE:FREQ=MONTHLY'])
    expect(recurrenceToRRule({ type: 'quarterly' })).toEqual(['RRULE:FREQ=MONTHLY;INTERVAL=3'])
    expect(recurrenceToRRule({ type: 'yearly' })).toEqual(['RRULE:FREQ=YEARLY'])
  })
  it('patterns a calendar cannot express return null', () => {
    expect(recurrenceToRRule({ type: 'since_last', interval: 3, unit: 'days' })).toBeNull()
    expect(recurrenceToRRule({ type: 'specific_days', dates: ['2026-10-01'] })).toBeNull()
  })
})

describe('nextOccurrence', () => {
  const tue = new Date('2026-09-08T10:00:00') // a Tuesday

  it('lands on today when today is in the set and no time has passed', () => {
    const d = nextOccurrence({ type: 'weekly', days: ['tue', 'thu'] }, null, tue)
    expect(d.toDateString()).toBe(tue.toDateString())
    expect(d.getHours()).toBe(0)
  })

  it('skips to the next listed day when today\'s time is already behind', () => {
    const d = nextOccurrence({ type: 'weekly', days: ['tue', 'thu'] }, '09:00', tue)
    expect(d.getDay()).toBe(4)
    expect(d.getHours()).toBe(9)
    expect(d.getDate()).toBe(10)
  })

  it('keeps today when the time is still ahead', () => {
    const d = nextOccurrence({ type: 'weekly', days: ['tue'] }, '18:00', tue)
    expect(d.getDate()).toBe(8)
    expect(d.getHours()).toBe(18)
  })

  it('wraps to next week', () => {
    const d = nextOccurrence({ type: 'weekly', days: ['mon'] }, null, tue)
    expect(d.getDate()).toBe(14)
  })

  it('monthly by date picks this month or next', () => {
    expect(nextOccurrence({ type: 'monthly', day_of_month: 20 }, null, tue).getDate()).toBe(20)
    const d = nextOccurrence({ type: 'monthly', day_of_month: 1 }, null, tue)
    expect(d.getMonth()).toBe(9)
    expect(d.getDate()).toBe(1)
  })

  it('daily is today', () => {
    expect(nextOccurrence({ type: 'daily' }, null, tue).toDateString()).toBe(tue.toDateString())
  })
})

describe('describeRecurrence', () => {
  it('names the days', () => {
    expect(describeRecurrence({ type: 'weekly', days: ['tue', 'thu'] })).toBe('Every Tue, Thu')
    expect(describeRecurrence({ type: 'weekly', days: ['mon'], interval: 2 })).toBe('Every other Mon')
    expect(describeRecurrence({ type: 'weekly', days: ['mon', 'tue', 'wed', 'thu', 'fri'] })).toBe('Weekdays')
    expect(describeRecurrence({ type: 'daily' })).toBe('Every day')
    expect(describeRecurrence({ type: 'monthly', day_of_month: 1 })).toBe('Monthly on the 1st')
    expect(describeRecurrence({ type: 'yearly' })).toBe('Every year')
  })
})
