import { describe, it, expect } from 'vitest'
import { forwardLook, forwardLine, comingUp } from './forwardLook'

describe('forwardLook / forwardLine', () => {
  it('names tomorrow’s first item, no time for all-day', () => {
    const t = new Date(2026, 8, 6)
    const item = forwardLook([{ title: 'Book flights', scheduledFor: new Date(2026, 8, 7), isAllDay: true }], t)
    expect(forwardLine(item, t)).toBe('Next: Book flights · Tomorrow')
  })

  it('names the weekday past tomorrow, with a time when timed', () => {
    const t = new Date(2026, 8, 6)
    const item = forwardLook([{ title: 'Piano', scheduledFor: new Date(2026, 8, 10, 16, 0), isAllDay: false }], t)
    expect(forwardLine(item, t)).toBe('Next: Piano · Thu 4:00 PM')
  })

  it('nothing within 7 days', () => {
    expect(forwardLine(forwardLook([], new Date(2026, 8, 6)), new Date(2026, 8, 6))).toBe('Nothing else coming up this week.')
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

  // Walkthrough 2026-10-02 (#7): "Monday: Talk to Tim on Monday · 11:45 AM".
  it('says the day once: a title that names it keeps only the time', () => {
    const fri = new Date(2026, 9, 2)
    const item = forwardLook([{ title: 'Talk to Tim on Monday', scheduledFor: new Date(2026, 9, 5, 11, 45), isAllDay: false }], fri)
    expect(forwardLine(item, fri)).toBe('Next: Talk to Tim on Monday · 11:45 AM')
    const other = forwardLook([{ title: 'Talk to Tim', scheduledFor: new Date(2026, 9, 5, 11, 45), isAllDay: false }], fri)
    expect(forwardLine(other, fri)).toBe('Next: Talk to Tim · Mon 11:45 AM')
  })
})

describe('comingUp', () => {
  const fri = new Date(2026, 9, 2, 9, 0)
  it('lists open work in the seven days after today, in order, and nothing from today, goals or done rows', () => {
    const rows = [
      { id: 'b', title: 'Timed Mon', scheduledFor: new Date(2026, 9, 5, 11, 45), isAllDay: false },
      { id: 'a', title: 'All day Mon', scheduledFor: new Date(2026, 9, 5), isAllDay: true },
      { id: 'c', title: 'Sat', scheduledFor: new Date(2026, 9, 3, 8, 0), isAllDay: false },
      { id: 'today', title: 'Today', scheduledFor: new Date(2026, 9, 2, 15, 0), isAllDay: false },
      { id: 'done', title: 'Done', scheduledFor: new Date(2026, 9, 4), isAllDay: true, completed: true },
      { id: 'goal', title: 'Goal', scheduledFor: new Date(2026, 9, 4), isAllDay: true, isGoal: true },
      { id: 'day7', title: 'Next Friday', scheduledFor: new Date(2026, 9, 9), isAllDay: true },
      { id: 'day8', title: 'Too far', scheduledFor: new Date(2026, 9, 10), isAllDay: true },
    ]
    expect(comingUp(rows, fri).map((r) => r.id)).toEqual(['c', 'a', 'b', 'day7'])
  })
})
