import { describe, expect, it } from 'vitest'
import { linksKid, dueOn, reachableDates, todayIn, type AppRoutine } from './lib.ts'

const HOST = 'kaleb-puzzle-trail.vercel.app'
const routine = (o: Partial<AppRoutine>): AppRoutine => ({
  id: 'r', user_id: 'u', description: null, visibility: 'active', paused_until: null,
  recurrence_pattern: { type: 'weekly', days: ['mon', 'tue', 'thu', 'sat'] }, ...o,
})

describe('wall-app-done rules', () => {
  it("matches only the kid the routine's link names", () => {
    const ella = 'About 10 minutes on kaleb-puzzle-trail.vercel.app/?kid=ella (the app picks)'
    expect(linksKid(ella, HOST, 'ella')).toBe(true)
    expect(linksKid(ella, HOST, 'kaleb')).toBe(false)
    expect(linksKid('https://kaleb-puzzle-trail.vercel.app/?kid=kaleb', HOST, 'kaleb')).toBe(true)
    expect(linksKid('kaleb-puzzle-trail.vercel.app/?kid=ellabelle', HOST, 'ella')).toBe(false)
    expect(linksKid('other.app/?kid=ella', HOST, 'ella')).toBe(false)
  })

  it('is due on its weekdays only, and never while resting or paused', () => {
    expect(dueOn(routine({}), '2026-10-27')).toBe(true) // Tue
    expect(dueOn(routine({}), '2026-10-28')).toBe(false) // Wed
    expect(dueOn(routine({ recurrence_pattern: { type: 'weekly', days: ['sun'] } }), '2026-10-25')).toBe(true)
    expect(dueOn(routine({ visibility: 'reference' }), '2026-10-27')).toBe(false)
    expect(dueOn(routine({ paused_until: '2026-11-01' }), '2026-10-27')).toBe(false)
    expect(dueOn(routine({ recurrence_pattern: { type: 'weekly', days: ['tue'], interval: 2 } }), '2026-10-27')).toBe(false)
  })

  it('takes real days from the last two weeks up to tomorrow', () => {
    expect(reachableDates(['2026-10-27', '2026-10-27', '2026-10-01', '2026-10-31', 'nope', 5], '2026-10-29')).toEqual(['2026-10-27'])
    expect(reachableDates('2026-10-27', '2026-10-29')).toEqual([])
  })

  it("knows today in the household's time zone", () => {
    expect(todayIn('America/New_York', new Date('2026-10-30T02:00:00Z'))).toBe('2026-10-29')
  })
})
