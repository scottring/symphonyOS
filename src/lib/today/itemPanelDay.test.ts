import { describe, it, expect } from 'vitest'
import { viewedDayFromParam, isNeededOn, neededTodayToggle, isOnDay, dayRemovalWithUndo } from './itemPanelDay'
import { createMockTask } from '@/test/mocks/factories'

const day = new Date(2026, 9, 14)
const other = new Date(2026, 9, 15)

describe('itemPanelDay — the row menu jobs, for the panel', () => {
  it('reads the viewed day from ?date=, else today', () => {
    expect(viewedDayFromParam('2026-01-05')).toEqual(new Date(2026, 0, 5))
    expect(viewedDayFromParam(null, new Date(2026, 9, 14, 15, 30))).toEqual(day)
    expect(viewedDayFromParam('nonsense', new Date(2026, 9, 14, 9))).toEqual(day)
  })

  // The menu's regression, carried over: the mark is stamped with the VIEWED
  // day, never the real one, or it shows up on a page nobody is reading.
  it('stamps Need today with the viewed day, and clears it there', () => {
    const viewed = new Date(2026, 0, 5)
    expect(neededTodayToggle({ neededOn: undefined }, viewed)).toEqual({ neededOn: viewed })
    expect(neededTodayToggle({ neededOn: viewed }, viewed)).toEqual({ neededOn: undefined })
    // A mark from another day has expired: toggling sets the viewed day's.
    expect(neededTodayToggle({ neededOn: other }, day)).toEqual({ neededOn: day })
    expect(isNeededOn({ neededOn: new Date(2026, 9, 14, 18) }, day)).toBe(true)
    expect(isNeededOn({ neededOn: other }, day)).toBe(false)
  })

  it('a task is on the day when dated it or chosen for it', () => {
    expect(isOnDay(createMockTask({ scheduledFor: new Date(2026, 9, 14, 9) }), day)).toBe(true)
    expect(isOnDay(createMockTask({ scheduledFor: other }), day)).toBe(false)
    expect(isOnDay(createMockTask({ scheduledFor: undefined, plannedOn: day }), day)).toBe(true)
    expect(isOnDay(createMockTask({ scheduledFor: undefined, focus: [{ userId: 'u', date: day }] }), day)).toBe(true)
    expect(isOnDay(createMockTask({ scheduledFor: undefined, focus: [{ userId: 'u', date: other }] }), day)).toBe(false)
  })

  it('removing the day clears its date and choice, keeps the rest, and can be undone', () => {
    const task = createMockTask({
      scheduledFor: day, isAllDay: true,
      focus: [{ userId: 'u', date: day }, { userId: 'u', date: other }],
    })
    const { updates, previous } = dayRemovalWithUndo(task, day)
    expect(updates).toEqual({ focus: [{ userId: 'u', date: other }], scheduledFor: undefined, isAllDay: undefined })
    expect(previous).toEqual({ focus: task.focus, scheduledFor: day, isAllDay: true })
  })

  it('a task only chosen for the day keeps its own date', () => {
    const task = createMockTask({ scheduledFor: other, plannedOn: day, focus: undefined })
    expect(dayRemovalWithUndo(task, day).updates).toEqual({ focus: [] })
  })
})
