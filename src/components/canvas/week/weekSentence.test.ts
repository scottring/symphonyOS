// src/components/canvas/week/weekSentence.test.ts
import { describe, expect, it } from 'vitest'
import { todayItem } from './weekSentence'
import type { CanvasDay, CanvasDayItem } from './WeekCanvas'

const item = (title: string, kind: CanvasDayItem['kind'] = 'task'): CanvasDayItem => ({ id: title, kind, title, completed: false })
const day = (key: string, events: string[] = [], items: string[] = []): CanvasDay =>
  ({ date: new Date(`${key}T00:00:00`), key, events: events.map((e) => item(e, 'event')), items: items.map((i) => item(i)) })

// Week page, calm pass 2: the header's fact line keeps only the sentence's
// "Today: {item}" part — no "wide open", no "the full one".
describe('todayItem', () => {
  it('is today’s first calendar event', () => {
    const days = [
      day('2026-10-14', ['CEPI food-contact meeting', 'Dentist'], ['Reply to Christian']),
      day('2026-10-15'),
      day('2026-10-16', ['Grampappa', 'Dentist'], ['PPVIS', 'VW Credit']),
    ]
    expect(todayItem(days, '2026-10-14')).toBe('CEPI food-contact meeting')
  })
  it('nothing on the calendar today, or today not in the week, is null', () => {
    expect(todayItem([day('2026-10-14', [], ['x'])], '2026-10-14')).toBeNull()
    expect(todayItem([day('2026-10-14', ['A'])], '2026-10-20')).toBeNull()
  })
})
