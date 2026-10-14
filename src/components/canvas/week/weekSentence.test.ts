// src/components/canvas/week/weekSentence.test.ts
import { describe, expect, it } from 'vitest'
import { weekSentence } from './weekSentence'
import type { CanvasDay, CanvasDayItem } from './WeekCanvas'

const item = (title: string, kind: CanvasDayItem['kind'] = 'task'): CanvasDayItem => ({ id: title, kind, title, completed: false })
const day = (key: string, events: string[] = [], items: string[] = []): CanvasDay =>
  ({ date: new Date(`${key}T00:00:00`), key, events: events.map((e) => item(e, 'event')), items: items.map((i) => item(i)) })

describe('weekSentence', () => {
  it('today’s event, the open days, the full day', () => {
    const days = [
      day('2026-10-14', ['CEPI food-contact meeting'], ['Reply to Christian']),
      day('2026-10-15'),
      day('2026-10-16', ['Grampappa', 'Dentist'], ['PPVIS', 'VW Credit']),
    ]
    expect(weekSentence(days, '2026-10-14')).toBe('Today: CEPI food-contact meeting. Thursday is wide open. Friday is the full one.')
  })
  it('two and many open days; weekends never count as open', () => {
    expect(weekSentence([day('2026-10-14'), day('2026-10-15'), day('2026-10-16'), day('2026-10-17')], '2026-10-14')).toBe('Thursday and Friday are wide open.')
    expect(weekSentence([day('2026-10-12'), day('2026-10-13'), day('2026-10-14'), day('2026-10-15'), day('2026-10-16')], '2026-10-11')).toBe('5 days ahead are wide open.')
  })
  it('nothing to say is null', () => {
    expect(weekSentence([day('2026-10-14', [], ['x'])], '2026-10-14')).toBeNull()
  })
  it('ignores proposed and completed items when deciding a day is open', () => {
    const proposed = { ...day('2026-10-15'), items: [{ ...item('Proposed'), proposed: true }] }
    const done = { ...day('2026-10-16'), items: [{ ...item('Done'), completed: true }] }
    expect(weekSentence([day('2026-10-14'), proposed, done], '2026-10-14')).toBe('Thursday and Friday are wide open.')
  })
  it('does not count today as the full day', () => {
    const busy = day('2026-10-14', ['A', 'B', 'C', 'D'], ['x'])
    expect(weekSentence([busy, day('2026-10-15')], '2026-10-14')).toBe('Today: A. Thursday is wide open.')
  })
})
