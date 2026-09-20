import { describe, it, expect } from 'vitest'
import {
  adaptWeekendBoard, isWeekendBoardDay, WEEKEND_COLUMNS, COLUMN_ITEM_CAP,
} from './wallWeekend'
import { HOUSEHOLD_ID } from './wallEventAttribution'
import type { WallDayData } from '@/hooks/useWallData'
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'
import type { Task } from '@/types/task'

// Sat 19 Sep 2026 — the page Scott photographed ran SAT / SUN / MON.
const SAT = new Date(2026, 8, 19)

const at = (dayOffset: number, h: number, m = 0) =>
  new Date(2026, 8, 19 + dayOffset, h, m)

const member = (id: string, name: string): FamilyMember =>
  ({ id, name, user_id: 'u', initials: name.slice(0, 2), color: 'blue',
     avatar_url: null, is_full_user: true, display_order: 0, created_at: '' }) as FamilyMember

const item = (o: Partial<TimelineItem>): TimelineItem =>
  ({ id: Math.random().toString(36).slice(2), type: 'event', title: 'thing',
     startTime: null, endTime: null, completed: false, ...o }) as TimelineItem

/** Sections are real DaySection keys, as the adapter walks them. */
const day = (dayOffset: number, items: TimelineItem[]): WallDayData =>
  ({
    date: at(dayOffset, 0),
    isToday: dayOffset === 0,
    items: {
      allday: items.filter((i) => i.allDay),
      morning: items.filter((i) => !i.allDay),
    },
    birthdays: [],
    milestones: [],
  }) as unknown as WallDayData

const scott = member('m-scott', 'Scott')
const iris = member('m-iris', 'Iris')
const MEMBERS = [scott, iris]

/** Seven days, as useWallData always returns; only the first few carry items. */
const week = (...loaded: WallDayData[]): WallDayData[] => {
  const out = [...loaded]
  for (let i = out.length; i < 7; i++) out.push(day(i, []))
  return out
}

describe('isWeekendBoardDay — the board replaces the day board on the weekend', () => {
  it('is on for Saturday and Sunday', () => {
    expect(isWeekendBoardDay(new Date(2026, 8, 19))).toBe(true) // Sat
    expect(isWeekendBoardDay(new Date(2026, 8, 20))).toBe(true) // Sun
  })

  it('is off on a weekday, when the day board is the right board', () => {
    for (const d of [21, 22, 23, 24, 25]) {
      expect(isWeekendBoardDay(new Date(2026, 8, d))).toBe(false)
    }
  })
})

describe('adaptWeekendBoard — three day columns, today first', () => {
  it('draws exactly three columns starting at today', () => {
    const board = adaptWeekendBoard(MEMBERS, week(), SAT)
    expect(board.columns).toHaveLength(WEEKEND_COLUMNS)
    expect(board.columns.map((c) => c.dayLabel)).toEqual(['SAT', 'SUN', 'MON'])
    expect(board.columns[0].isToday).toBe(true)
    expect(board.columns[1].isToday).toBe(false)
  })

  it('labels each column with its own date, not today repeated', () => {
    const board = adaptWeekendBoard(MEMBERS, week(), SAT)
    expect(board.columns.map((c) => c.dateLabel)).toEqual(['19 Sep', '20 Sep', '21 Sep'])
  })

  it('survives a short days array rather than inventing empty columns', () => {
    // useWallData returns [] before its first fetch resolves.
    const board = adaptWeekendBoard(MEMBERS, [], SAT)
    expect(board.columns).toHaveLength(0)
  })
})

describe('the written time replaces the axis', () => {
  it('puts a timed item in its column with a readable time', () => {
    const board = adaptWeekendBoard(
      MEMBERS,
      week(day(0, []), day(1, [item({ title: 'Baseball', startTime: at(1, 10), assignedTo: 'm-scott' })])),
      SAT,
    )
    expect(board.columns[1].items).toHaveLength(1)
    expect(board.columns[1].items[0]).toMatchObject({ time: '10:00a', title: 'Baseball' })
  })

  it('writes afternoon times in 12-hour form, as the paper page does', () => {
    const board = adaptWeekendBoard(
      MEMBERS,
      week(day(0, [item({ title: 'Museum time', startTime: at(0, 14) })])),
      SAT,
    )
    expect(board.columns[0].items[0].time).toBe('2:00p')
  })

  it('orders a column by start time, not by section order', () => {
    const board = adaptWeekendBoard(
      MEMBERS,
      week(day(0, [
        item({ title: 'Bins out', startTime: at(0, 17, 30) }),
        item({ title: 'Bike', startTime: at(0, 9) }),
        item({ title: 'Lunch', startTime: at(0, 12, 30) }),
      ])),
      SAT,
    )
    expect(board.columns[0].items.map((i) => i.title)).toEqual(['Bike', 'Lunch', 'Bins out'])
  })
})

describe('the anytime band — where the paper page parks its parentheses', () => {
  it('holds an untimed task, which the day board sends to the strip instead', () => {
    // The strip only ever covers TODAY. On a weekend board Sunday's untimed
    // work has nowhere else to be, so it belongs at the foot of its column.
    const board = adaptWeekendBoard(
      MEMBERS,
      week(day(0, []), day(1, [item({ type: 'task', title: 'Peloton research' })])),
      SAT,
    )
    expect(board.columns[1].anytime.map((a) => a.title)).toEqual(['Peloton research'])
    expect(board.columns[1].items).toHaveLength(0)
  })

  it('keeps an all-day event out of the band — it describes the day', () => {
    const board = adaptWeekendBoard(
      MEMBERS,
      week(day(0, [item({ title: 'Labor Day', allDay: true })])),
      SAT,
    )
    expect(board.columns[0].specials).toEqual(['Labor Day'])
    expect(board.columns[0].anytime).toHaveLength(0)
  })
})

describe('what earns a column, and what does not', () => {
  it('drops a daily routine — the week\'s shape is not news', () => {
    const board = adaptWeekendBoard(
      MEMBERS,
      week(day(0, [item({
        type: 'routine',
        title: 'Brush teeth',
        startTime: at(0, 7),
        recurrencePattern: { type: 'daily' },
      } as Partial<TimelineItem>)])),
      SAT,
    )
    expect(board.columns[0].items).toHaveLength(0)
  })

  it('drops a completed commitment but keeps an all-day fact', () => {
    const board = adaptWeekendBoard(
      MEMBERS,
      week(day(0, [
        item({ title: 'Bike', startTime: at(0, 9), completed: true }),
        item({ title: 'Picture Day', allDay: true, completed: true }),
      ])),
      SAT,
    )
    expect(board.columns[0].items).toHaveLength(0)
    expect(board.columns[0].specials).toEqual(['Picture Day'])
  })

  it('shows an item once, not once per owner', () => {
    // The day board draws a bar per person row; a day column is not a row,
    // so a family event must not appear three times in one column.
    const board = adaptWeekendBoard(
      MEMBERS,
      week(day(0, [item({ title: 'Sunday dinner', startTime: at(0, 17), assignedToAll: true })])),
      SAT,
    )
    expect(board.columns[0].items).toHaveLength(1)
  })
})

describe('whose it is', () => {
  it('names the owner and gives them a stable accent', () => {
    const board = adaptWeekendBoard(
      MEMBERS,
      week(day(0, [
        item({ title: 'Bike', startTime: at(0, 9), assignedTo: 'm-scott' }),
        item({ title: 'Gym with Kelly', startTime: at(0, 11), assignedTo: 'm-iris' }),
      ])),
      SAT,
    )
    const [bike, gym] = board.columns[0].items
    expect(bike.ownerName).toBe('Scott')
    expect(gym.ownerName).toBe('Iris')
    expect(bike.accentIndex).not.toBe(gym.accentIndex)
  })

  it('leaves an unowned commitment to the household, with no name to read', () => {
    const board = adaptWeekendBoard(
      MEMBERS,
      week(day(0, [item({ type: 'task', title: 'Bins out', startTime: at(0, 17, 30) })])),
      SAT,
    )
    expect(board.columns[0].items[0].ownerName).toBeNull()
    expect(board.columns[0].items[0].memberId).toBe(HOUSEHOLD_ID)
  })
})

describe('density — a column that overflows says so', () => {
  it('caps the list and counts the rest rather than clipping the column', () => {
    const many = Array.from({ length: COLUMN_ITEM_CAP + 3 }, (_, i) =>
      item({ title: `Thing ${i}`, startTime: at(0, 8 + i) }))
    const board = adaptWeekendBoard(MEMBERS, week(day(0, many)), SAT)
    expect(board.columns[0].items).toHaveLength(COLUMN_ITEM_CAP)
    expect(board.columns[0].overflowCount).toBe(3)
  })

  it('reports no overflow when everything fits', () => {
    const board = adaptWeekendBoard(
      MEMBERS,
      week(day(0, [item({ title: 'Bike', startTime: at(0, 9) })])),
      SAT,
    )
    expect(board.columns[0].overflowCount).toBe(0)
  })
})

describe('past items — only today has a past', () => {
  it('dims what has already finished today', () => {
    const board = adaptWeekendBoard(
      MEMBERS,
      week(day(0, [
        item({ title: 'Bike', startTime: at(0, 9), endTime: at(0, 10) }),
        item({ title: 'Museum time', startTime: at(0, 14) }),
      ])),
      at(0, 12),
    )
    expect(board.columns[0].items[0].past).toBe(true)
    expect(board.columns[0].items[1].past).toBe(false)
  })

  it('never dims tomorrow, whatever the clock says', () => {
    const board = adaptWeekendBoard(
      MEMBERS,
      week(day(0, []), day(1, [item({ title: 'Baseball', startTime: at(1, 10) })])),
      at(0, 23),
    )
    expect(board.columns[1].items[0].past).toBe(false)
  })
})

describe('homework rides along, as it does on the day board', () => {
  const hw = (o: Partial<Task>): Task =>
    ({ id: 'hw1', title: 'Reading log', completed: false, ...o }) as Task

  it('lands in the anytime band of the day it is needed', () => {
    const board = adaptWeekendBoard(MEMBERS, week(), SAT, [hw({ neededOn: at(2, 0) })])
    expect(board.columns[2].anytime.map((a) => a.title)).toContain('Reading log')
  })

  it('ignores homework needed outside the three columns', () => {
    const board = adaptWeekendBoard(MEMBERS, week(), SAT, [hw({ neededOn: at(5, 0) })])
    expect(board.columns.flatMap((c) => c.anytime)).toHaveLength(0)
  })
})
