import { describe, expect, it } from 'vitest'
import type { Occurrence } from './routinesPicture'
import { rhythmSentence } from './rhythmSentence'

// Sat Oct 10 – Fri Oct 16, 2026.
const WEEK = Array.from({ length: 7 }, (_, i) => new Date(2026, 9, 10 + i))
const key = (i: number) => `2026-10-${String(10 + i).padStart(2, '0')}`
let n = 0
const occ = (title: string, day: number, hhmm: string | null, over: Partial<Occurrence> = {}): Occurrence => {
  const [h, m] = (hhmm ?? '0:0').split(':').map(Number)
  return {
    key: `${title}:${n++}`, routineId: title, dayKey: key(day), title,
    time: hhmm ? new Date(2026, 9, 10 + day, h, m) : null, people: [], steps: 0, everyDay: false, ...over,
  }
}
const weekdays = [2, 3, 4, 5, 6]

describe('rhythmSentence', () => {
  it('says when school days run, from the first start to bedtime', () => {
    const os = [
      ...weekdays.map((d) => occ('School morning', d, '06:45')),
      ...[0, 1, ...weekdays].map((d) => occ('Kids bedtime routine', d, '19:30', { everyDay: true })),
    ]
    expect(rhythmSentence(WEEK, os)).toBe('School days run 6:45 to bedtime at 7:30.')
  })

  it('says weekdays when nothing is about school, and the start alone without a bedtime', () => {
    const os = weekdays.map((d) => occ('Walk Jax', d, '07:00'))
    expect(rhythmSentence(WEEK, os)).toBe('Weekdays start at 7:00.')
  })

  it('names the fullest day only when it is clearly fullest', () => {
    const sat = ['Tidy together', 'Family outing', 'Kids laundry', 'Paper mail'].map((t) => occ(t, 0, null))
    expect(rhythmSentence(WEEK, [...sat, occ('Food prep', 1, null)])).toBe('Saturday is the full one.')
    const even = [...sat.slice(0, 3), ...['A', 'B', 'C'].map((t) => occ(t, 1, null))]
    expect(rhythmSentence(WEEK, even)).toBeNull()
  })

  it("says this week's exceptions: one or two by name, more by count", () => {
    const skipped = occ('Bedtime', 6, '19:30', { exception: { kinds: ['skipped'], label: 'skipped' } })
    const iris = occ('FFG pickup', 5, '17:15', { exception: { kinds: ['who'], label: 'Iris', who: 'iris' } })
    expect(rhythmSentence(WEEK, [skipped])).toBe('This week: Bedtime is skipped Friday.')
    expect(rhythmSentence(WEEK, [iris, skipped])).toBe('This week: Iris has FFG pickup Thursday, and Bedtime is skipped Friday.')
    const moved = occ('Kaleb haircut', 6, null, { exception: { kinds: ['moved'], label: 'from Thu' } })
    expect(rhythmSentence(WEEK, [iris, skipped, moved])).toBe('This week has 3 changes.')
  })

  it('says nothing when there is nothing to say', () => {
    expect(rhythmSentence(WEEK, [])).toBeNull()
  })
})
