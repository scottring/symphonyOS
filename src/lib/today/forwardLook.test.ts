import { describe, it, expect } from 'vitest'
import { forwardLook, forwardLine } from './forwardLook'

describe('forwardLook / forwardLine', () => {
  it('names tomorrow’s first item, no time for all-day', () => {
    const t = new Date(2026, 8, 6)
    const item = forwardLook([{ title: 'Book flights', scheduledFor: new Date(2026, 8, 7), isAllDay: true }], t)
    expect(forwardLine(item, t)).toBe('Tomorrow: Book flights')
  })

  it('names the weekday past tomorrow, with a time when timed', () => {
    const t = new Date(2026, 8, 6)
    const item = forwardLook([{ title: 'Piano', scheduledFor: new Date(2026, 8, 10, 16, 0), isAllDay: false }], t)
    expect(forwardLine(item, t)).toBe('Thursday: Piano · 4:00 PM')
  })

  it('nothing within 7 days', () => {
    expect(forwardLine(forwardLook([], new Date(2026, 8, 6)), new Date(2026, 8, 6))).toBe('Nothing on the board this week.')
  })

  it('skips completed and today\'s own items, and anything beyond the window', () => {
    const t = new Date(2026, 8, 6)
    const tasks = [
      { title: 'Done tomorrow', scheduledFor: new Date(2026, 8, 7), isAllDay: true, completed: true },
      { title: 'Today', scheduledFor: new Date(2026, 8, 6, 9, 0), isAllDay: false },
      { title: 'Too far out', scheduledFor: new Date(2026, 8, 20), isAllDay: true },
    ]
    expect(forwardLook(tasks, t)).toBeNull()
  })

  it('picks the earliest item; an all-day row sorts before a timed row on the same day', () => {
    const t = new Date(2026, 8, 6)
    const tasks = [
      { title: 'Timed', scheduledFor: new Date(2026, 8, 7, 8, 0), isAllDay: false },
      { title: 'All day', scheduledFor: new Date(2026, 8, 7), isAllDay: true },
    ]
    const item = forwardLook(tasks, t)
    expect(item?.title).toBe('All day')
  })
})
