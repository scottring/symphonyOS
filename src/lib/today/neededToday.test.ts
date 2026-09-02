import { describe, it, expect } from 'vitest'
import { neededToday, neededWindow, NEEDED_TODAY_VISIBLE, NEEDED_TODAY_EXPANDED_MAX } from './neededToday'
import { isSameDay } from '@/lib/dateUtils'
import type { Task } from '@/types/task'
import type { ListItem } from '@/types/list'

const DAY = new Date(2026, 7, 19)

function task(over: Partial<Task>): Task {
  return {
    id: 't', title: 'Task', completed: false, scheduledFor: null, context: null,
    createdAt: DAY, updatedAt: DAY, ...over,
  } as Task
}

function item(over: Partial<ListItem>): ListItem {
  return {
    id: 'i', listId: 'shop', text: 'Item', sortOrder: 0, completed: false,
    createdAt: DAY, updatedAt: DAY, ...over,
  } as ListItem
}

const SHOPPING = new Set(['shop'])

describe('neededToday', () => {
  it('includes only items marked for the viewed day', () => {
    const { items } = neededToday(
      [task({ id: 'a', neededOn: DAY }), task({ id: 'b', neededOn: new Date(2026, 7, 18) }), task({ id: 'c' })],
      [], DAY, SHOPPING,
    )
    expect(items.map(i => i.id)).toEqual(['a'])
  })

  // A task scheduled ON the viewed day is already in the day's agenda (timed
  // row or all-day section) — the note lists only the UNTIMED needs, so the
  // same item never shows twice on Today. Unscheduling drops it back in.
  it('excludes a marked task that is scheduled on the viewed day', () => {
    const { items } = neededToday(
      [
        task({ id: 'timed', neededOn: DAY, scheduledFor: new Date(2026, 7, 19, 14, 0) }),
        task({ id: 'allday', neededOn: DAY, scheduledFor: DAY, isAllDay: true }),
      ],
      [], DAY, SHOPPING,
    )
    expect(items).toEqual([])
  })

  it('keeps a marked task scheduled on a DIFFERENT day in the note', () => {
    const { items } = neededToday(
      [task({ id: 'a', neededOn: DAY, scheduledFor: new Date(2026, 7, 21, 9, 0) })],
      [], DAY, SHOPPING,
    )
    expect(items.map(i => i.id)).toEqual(['a'])
  })

  it('matches by calendar day, ignoring time of day', () => {
    const { items } = neededToday([task({ id: 'a', neededOn: new Date(2026, 7, 19, 23, 30) })], [], DAY, SHOPPING)
    expect(items).toHaveLength(1)
  })

  it('excludes completed items from both sources', () => {
    const { items } = neededToday(
      [task({ id: 'a', neededOn: DAY, completed: true })],
      [item({ id: 'i1', neededOn: DAY, completed: true })],
      DAY, SHOPPING,
    )
    expect(items).toEqual([])
  })

  it('derives kind: shopping list item is buy, needsDiscussion is discuss, else urgent', () => {
    const { items } = neededToday(
      [task({ id: 'd', neededOn: DAY, needsDiscussion: true }), task({ id: 'u', neededOn: DAY })],
      [item({ id: 'b', neededOn: DAY })],
      DAY, SHOPPING,
    )
    expect(items.find(i => i.id === 'd')!.kind).toBe('discuss')
    expect(items.find(i => i.id === 'u')!.kind).toBe('urgent')
    expect(items.find(i => i.id === 'b')!.kind).toBe('buy')
  })

  it('treats a non-shopping list item as urgent, not buy', () => {
    const { items } = neededToday([], [item({ id: 'x', listId: 'other', neededOn: DAY })], DAY, SHOPPING)
    expect(items[0].kind).toBe('urgent')
  })

  it('sorts discuss, then buy, then urgent', () => {
    const { items } = neededToday(
      [task({ id: 'u', neededOn: DAY }), task({ id: 'd', neededOn: DAY, needsDiscussion: true })],
      [item({ id: 'b', neededOn: DAY })],
      DAY, SHOPPING,
    )
    expect(items.map(i => i.kind)).toEqual(['discuss', 'buy', 'urgent'])
  })

  it('uses list item text as the title', () => {
    const { items } = neededToday([], [item({ id: 'b', neededOn: DAY, text: 'Pull-ups' })], DAY, SHOPPING)
    expect(items[0].title).toBe('Pull-ups')
  })

  it('caps visible items and reports the overflow count', () => {
    const many = Array.from({ length: 8 }, (_, n) => task({ id: `t${n}`, neededOn: DAY }))
    const { items, overflow } = neededToday(many, [], DAY, SHOPPING)
    expect(items).toHaveLength(NEEDED_TODAY_VISIBLE)
    expect(overflow).toBe(3)
  })

  it('reports zero overflow when under the cap', () => {
    const { overflow } = neededToday([task({ id: 'a', neededOn: DAY })], [], DAY, SHOPPING)
    expect(overflow).toBe(0)
  })

  it('returns everything with no overflow when visible is Infinity', () => {
    const many = Array.from({ length: 8 }, (_, n) => task({ id: `t${n}`, neededOn: DAY }))
    const { items, overflow } = neededToday(many, [], DAY, SHOPPING, Infinity)
    expect(items).toHaveLength(8)
    expect(overflow).toBe(0)
  })

  // The expanded note is a bigger budget, not an unbounded one — Today is a
  // fixed-space surface and the note must never be able to push the day off it.
  it('still folds past the expanded cap', () => {
    const many = Array.from(
      { length: NEEDED_TODAY_EXPANDED_MAX + 4 },
      (_, n) => task({ id: `t${n}`, neededOn: DAY }),
    )
    const { items, overflow } = neededToday(many, [], DAY, SHOPPING, NEEDED_TODAY_EXPANDED_MAX)
    expect(items).toHaveLength(NEEDED_TODAY_EXPANDED_MAX)
    expect(overflow).toBe(4)
  })
})

// ── The evening "Tomorrow" group. ─────────────────────────────────────────
//
// Same "a date expires" semantics as the rest of the note: nothing is written
// and nothing is cleared. The READ window simply widens by a day once the
// evening arrives — the moment tomorrow is still something you can act on.
const TOMORROW = new Date(2026, 7, 20)
const EVENING = new Date(2026, 7, 19, 18, 0)
const MORNING = new Date(2026, 7, 19, 9, 0)

describe('neededWindow', () => {
  it('offers tomorrow from 17:00 on the day being viewed', () => {
    const w = neededWindow(DAY, EVENING)
    expect(w.today).toEqual(DAY)
    expect(w.tomorrow && isSameDay(w.tomorrow, TOMORROW)).toBe(true)
  })

  it('offers no tomorrow before 17:00', () => {
    expect(neededWindow(DAY, MORNING).tomorrow).toBeNull()
  })

  it('opens exactly at 17:00, not at 16:59', () => {
    expect(neededWindow(DAY, new Date(2026, 7, 19, 16, 59)).tomorrow).toBeNull()
    expect(neededWindow(DAY, new Date(2026, 7, 19, 17, 0)).tomorrow).not.toBeNull()
  })

  // Reading a past (or future) day is reading THAT day's note, not planning
  // this evening — there is no "tomorrow" to assemble there.
  it('offers no tomorrow when the viewed day is not the current day', () => {
    expect(neededWindow(new Date(2026, 7, 18), EVENING).tomorrow).toBeNull()
    expect(neededWindow(new Date(2026, 7, 21), EVENING).tomorrow).toBeNull()
  })
})

describe('neededToday tomorrow group', () => {
  it('lists tomorrow-marked tasks in the evening', () => {
    const { tomorrow } = neededToday(
      [task({ id: 'a', neededOn: TOMORROW, title: 'Swim bag' })],
      [], DAY, SHOPPING, undefined, EVENING,
    )
    expect(tomorrow.map(i => i.id)).toEqual(['a'])
    expect(tomorrow[0].title).toBe('Swim bag')
  })

  it('lists nothing for tomorrow in the morning', () => {
    const { tomorrow } = neededToday(
      [task({ id: 'a', neededOn: TOMORROW })], [], DAY, SHOPPING, undefined, MORNING,
    )
    expect(tomorrow).toEqual([])
  })

  it('lists nothing for tomorrow when a past day is being viewed', () => {
    const past = new Date(2026, 7, 18)
    const { tomorrow } = neededToday(
      [task({ id: 'a', neededOn: DAY })], [], past, SHOPPING, undefined, EVENING,
    )
    expect(tomorrow).toEqual([])
  })

  it('never lists a completed task for tomorrow', () => {
    const { tomorrow } = neededToday(
      [task({ id: 'a', neededOn: TOMORROW, completed: true })],
      [], DAY, SHOPPING, undefined, EVENING,
    )
    expect(tomorrow).toEqual([])
  })

  // Same rule as today's group: a task already scheduled on that day is in
  // that day's agenda, so listing it here says the same thing twice.
  it('excludes a tomorrow task already scheduled on tomorrow', () => {
    const { tomorrow } = neededToday(
      [task({ id: 'a', neededOn: TOMORROW, scheduledFor: new Date(2026, 7, 20, 9, 0) })],
      [], DAY, SHOPPING, undefined, EVENING,
    )
    expect(tomorrow).toEqual([])
  })

  it('carries the assignee through so the note can draw a member pill', () => {
    const { items, tomorrow } = neededToday(
      [task({ id: 'a', neededOn: TOMORROW, assignedTo: 'm1' }), task({ id: 'b', neededOn: DAY, assignedTo: 'm2' })],
      [], DAY, SHOPPING, undefined, EVENING,
    )
    expect(tomorrow[0].assignedTo).toBe('m1')
    expect(items[0].assignedTo).toBe('m2')
  })

  // Today is a fixed-space surface: the two groups share ONE budget, and what
  // the budget can't hold is admitted in the overflow count, never dropped.
  it('shares the visible budget with today and reports the fold', () => {
    const todayTasks = Array.from({ length: 4 }, (_, n) => task({ id: `t${n}`, neededOn: DAY }))
    const tomorrowTasks = Array.from({ length: 3 }, (_, n) => task({ id: `m${n}`, neededOn: TOMORROW }))
    const { items, tomorrow, overflow } = neededToday(
      [...todayTasks, ...tomorrowTasks], [], DAY, SHOPPING, undefined, EVENING,
    )
    expect(items).toHaveLength(4)
    expect(tomorrow).toHaveLength(1)
    expect(overflow).toBe(2)
  })

  it('returns an empty group when nothing is marked for tomorrow', () => {
    const { tomorrow } = neededToday([task({ id: 'a', neededOn: DAY })], [], DAY, SHOPPING, undefined, EVENING)
    expect(tomorrow).toEqual([])
  })
})
