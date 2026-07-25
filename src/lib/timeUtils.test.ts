import { describe, it, expect } from 'vitest'
import {
  isNow,
  isSoon,
  isLaterToday,
  isPast,
  getTimeSection,
  groupByTimeSection,
  formatTime,
  formatTimeRange,
  formatTimeLong,
  formatTimeRangeLong,
  getSectionForHour,
  getDaySectionLabel,
  getTimeOfDay,
  DAY_SECTION_BOUNDS,
  TIMED_SECTIONS,
  type DaySection,
} from './timeUtils'
import type { TimelineItem } from '@/types/timeline'

describe('isNow', () => {
  it('returns true for time within current hour', () => {
    const now = new Date('2024-01-15T10:30:00')
    const time = new Date('2024-01-15T10:45:00')
    expect(isNow(time, now)).toBe(true)
  })

  it('returns true for time at start of current hour', () => {
    const now = new Date('2024-01-15T10:30:00')
    const time = new Date('2024-01-15T10:00:00')
    expect(isNow(time, now)).toBe(true)
  })

  it('returns false for time in next hour', () => {
    const now = new Date('2024-01-15T10:30:00')
    const time = new Date('2024-01-15T11:00:00')
    expect(isNow(time, now)).toBe(false)
  })

  it('returns false for time in previous hour', () => {
    const now = new Date('2024-01-15T10:30:00')
    const time = new Date('2024-01-15T09:59:00')
    expect(isNow(time, now)).toBe(false)
  })
})

describe('isSoon', () => {
  it('returns true for time in next hour', () => {
    const now = new Date('2024-01-15T10:30:00')
    const time = new Date('2024-01-15T11:30:00')
    expect(isSoon(time, now)).toBe(true)
  })

  it('returns true for time 2 hours from now', () => {
    const now = new Date('2024-01-15T10:30:00')
    const time = new Date('2024-01-15T12:30:00')
    expect(isSoon(time, now)).toBe(true)
  })

  it('returns false for time in current hour (that is now)', () => {
    const now = new Date('2024-01-15T10:30:00')
    const time = new Date('2024-01-15T10:45:00')
    expect(isSoon(time, now)).toBe(false)
  })

  it('returns false for time more than 3 hours away', () => {
    const now = new Date('2024-01-15T10:30:00')
    const time = new Date('2024-01-15T14:00:00')
    expect(isSoon(time, now)).toBe(false)
  })
})

describe('isLaterToday', () => {
  it('returns true for time later today but not soon', () => {
    const now = new Date('2024-01-15T10:30:00')
    const time = new Date('2024-01-15T18:00:00')
    expect(isLaterToday(time, now)).toBe(true)
  })

  it('returns false for time that is now', () => {
    const now = new Date('2024-01-15T10:30:00')
    const time = new Date('2024-01-15T10:45:00')
    expect(isLaterToday(time, now)).toBe(false)
  })

  it('returns false for time that is soon', () => {
    const now = new Date('2024-01-15T10:30:00')
    const time = new Date('2024-01-15T11:30:00')
    expect(isLaterToday(time, now)).toBe(false)
  })

  it('returns false for tomorrow', () => {
    const now = new Date('2024-01-15T10:30:00')
    const time = new Date('2024-01-16T10:00:00')
    expect(isLaterToday(time, now)).toBe(false)
  })
})

describe('isPast', () => {
  it('returns true for time before current hour', () => {
    const now = new Date('2024-01-15T10:30:00')
    const time = new Date('2024-01-15T09:00:00')
    expect(isPast(time, now)).toBe(true)
  })

  it('returns false for time in current hour', () => {
    const now = new Date('2024-01-15T10:30:00')
    const time = new Date('2024-01-15T10:00:00')
    expect(isPast(time, now)).toBe(false)
  })

  it('returns false for future time', () => {
    const now = new Date('2024-01-15T10:30:00')
    const time = new Date('2024-01-15T11:00:00')
    expect(isPast(time, now)).toBe(false)
  })
})

describe('getTimeSection', () => {
  const now = new Date('2024-01-15T10:30:00')

  it('returns unscheduled for items without startTime', () => {
    const item: TimelineItem = {
      id: '1',
      type: 'task',
      title: 'Test',
      startTime: null,
      endTime: null,
      completed: false,
    }
    expect(getTimeSection(item, now)).toBe('unscheduled')
  })

  it('returns now for items in current hour', () => {
    const item: TimelineItem = {
      id: '1',
      type: 'event',
      title: 'Test',
      startTime: new Date('2024-01-15T10:45:00'),
      endTime: new Date('2024-01-15T11:45:00'),
      completed: false,
    }
    expect(getTimeSection(item, now)).toBe('now')
  })

  it('returns soon for items in next few hours', () => {
    const item: TimelineItem = {
      id: '1',
      type: 'event',
      title: 'Test',
      startTime: new Date('2024-01-15T12:00:00'),
      endTime: new Date('2024-01-15T13:00:00'),
      completed: false,
    }
    expect(getTimeSection(item, now)).toBe('soon')
  })

  it('returns later for items later today', () => {
    const item: TimelineItem = {
      id: '1',
      type: 'event',
      title: 'Test',
      startTime: new Date('2024-01-15T18:00:00'),
      endTime: new Date('2024-01-15T19:00:00'),
      completed: false,
    }
    expect(getTimeSection(item, now)).toBe('later')
  })
})

describe('groupByTimeSection', () => {
  const now = new Date('2024-01-15T10:30:00')

  it('groups items into correct sections', () => {
    const items: TimelineItem[] = [
      {
        id: '1',
        type: 'task',
        title: 'Unscheduled task',
        startTime: null,
        endTime: null,
        completed: false,
      },
      {
        id: '2',
        type: 'event',
        title: 'Now event',
        startTime: new Date('2024-01-15T10:15:00'),
        endTime: new Date('2024-01-15T11:00:00'),
        completed: false,
      },
      {
        id: '3',
        type: 'event',
        title: 'Soon event',
        startTime: new Date('2024-01-15T12:00:00'),
        endTime: new Date('2024-01-15T13:00:00'),
        completed: false,
      },
      {
        id: '4',
        type: 'event',
        title: 'Later event',
        startTime: new Date('2024-01-15T18:00:00'),
        endTime: new Date('2024-01-15T19:00:00'),
        completed: false,
      },
    ]

    const grouped = groupByTimeSection(items, now)

    expect(grouped.unscheduled).toHaveLength(1)
    expect(grouped.unscheduled[0].title).toBe('Unscheduled task')

    expect(grouped.now).toHaveLength(1)
    expect(grouped.now[0].title).toBe('Now event')

    expect(grouped.soon).toHaveLength(1)
    expect(grouped.soon[0].title).toBe('Soon event')

    expect(grouped.later).toHaveLength(1)
    expect(grouped.later[0].title).toBe('Later event')
  })

  it('sorts scheduled items by start time', () => {
    const items: TimelineItem[] = [
      {
        id: '1',
        type: 'event',
        title: 'Second',
        startTime: new Date('2024-01-15T10:45:00'),
        endTime: new Date('2024-01-15T11:00:00'),
        completed: false,
      },
      {
        id: '2',
        type: 'event',
        title: 'First',
        startTime: new Date('2024-01-15T10:15:00'),
        endTime: new Date('2024-01-15T10:30:00'),
        completed: false,
      },
    ]

    const grouped = groupByTimeSection(items, now)

    expect(grouped.now[0].title).toBe('First')
    expect(grouped.now[1].title).toBe('Second')
  })
})

describe('formatTime', () => {
  it('formats morning time correctly', () => {
    const time = new Date('2024-01-15T09:30:00')
    expect(formatTime(time)).toBe('9:30a')
  })

  it('formats afternoon time correctly', () => {
    const time = new Date('2024-01-15T14:00:00')
    expect(formatTime(time)).toBe('2p') // omits :00 in compact format
  })

  it('formats midnight correctly', () => {
    const time = new Date('2024-01-15T00:00:00')
    expect(formatTime(time)).toBe('12a')
  })

  it('formats noon correctly', () => {
    const time = new Date('2024-01-15T12:00:00')
    expect(formatTime(time)).toBe('12p')
  })
})

describe('formatTimeRange', () => {
  it('formats time range correctly', () => {
    const start = new Date('2024-01-15T09:30:00')
    const end = new Date('2024-01-15T10:30:00')
    expect(formatTimeRange(start, end)).toBe('9:30a|10:30a') // pipe separator for stacked display
  })

  it('returns All day for all-day events', () => {
    const start = new Date('2024-01-15T00:00:00')
    const end = new Date('2024-01-16T00:00:00')
    expect(formatTimeRange(start, end, true)).toBe('All day')
  })
})

describe('formatTimeLong', () => {
  it('formats whole hour as "1:00 PM"', () => {
    const d = new Date(2026, 4, 20, 13, 0)
    expect(formatTimeLong(d)).toBe('1:00 PM')
  })

  it('formats minutes with leading zero', () => {
    const d = new Date(2026, 4, 20, 17, 30)
    expect(formatTimeLong(d)).toBe('5:30 PM')
  })

  it('formats midnight as "12:00 AM"', () => {
    const d = new Date(2026, 4, 20, 0, 0)
    expect(formatTimeLong(d)).toBe('12:00 AM')
  })

  it('formats noon as "12:00 PM"', () => {
    const d = new Date(2026, 4, 20, 12, 0)
    expect(formatTimeLong(d)).toBe('12:00 PM')
  })

  it('returns empty string for invalid date', () => {
    expect(formatTimeLong(new Date('invalid'))).toBe('')
  })
})

describe('formatTimeRangeLong', () => {
  it('returns "All day" for allDay', () => {
    expect(formatTimeRangeLong(new Date(), new Date(), true)).toBe('All day')
  })

  it('joins start and end with pipe', () => {
    const start = new Date(2026, 4, 20, 13, 0)
    const end = new Date(2026, 4, 20, 14, 0)
    expect(formatTimeRangeLong(start, end)).toBe('1:00 PM|2:00 PM')
  })
})

describe('day section boundaries', () => {
  // Every boundary hour maps to the band its own label claims.
  const cases: [number, DaySection][] = [
    [0, 'earlyMorning'], [3, 'earlyMorning'], [7, 'earlyMorning'],
    [8, 'morning'], [11, 'morning'],
    [12, 'afternoon'], [16, 'afternoon'],
    [17, 'evening'], [20, 'evening'],
    [21, 'night'], [23, 'night'],
  ]
  it.each(cases)('hour %i is in %s', (hour, section) => {
    expect(getSectionForHour(hour)).toBe(section)
  })

  it('covers all 24 hours with no gaps or overlaps', () => {
    for (let h = 0; h < 24; h++) {
      const matches = DAY_SECTION_BOUNDS.filter(b => h >= b.startHour && h <= b.endHour)
      expect(matches, `hour ${h}`).toHaveLength(1)
    }
  })

  it('labels every section', () => {
    const all: DaySection[] = ['allday', 'earlyMorning', 'morning', 'afternoon', 'evening', 'night', 'unscheduled']
    for (const s of all) expect(getDaySectionLabel(s)).toBeTruthy()
  })
})

describe('getTimeOfDay', () => {
  // The 3-valued ambience band (FocusMode's "This Afternoon") must agree with
  // where Today actually files the item. It used to hardcode `hour < 18 →
  // afternoon`, so 17:30 read "This Afternoon" while Today filed it under
  // Evening. Boundaries now derive from DAY_SECTION_BOUNDS.
  const at = (h: number, m = 0) => new Date(2026, 6, 25, h, m)

  it('calls 17:30 evening, matching the evening band that starts at 17:00', () => {
    expect(getTimeOfDay(at(17, 30))).toBe('evening')
  })

  it('calls 07:00 morning even though it is the earlyMorning band', () => {
    expect(getTimeOfDay(at(7, 0))).toBe('morning')
  })

  it('folds night into evening and earlyMorning into morning', () => {
    expect(getTimeOfDay(at(0, 15))).toBe('morning')
    expect(getTimeOfDay(at(22, 45))).toBe('evening')
  })

  it('stays 3-valued across all 24 hours', () => {
    const seen = new Set<string>()
    for (let h = 0; h < 24; h++) seen.add(getTimeOfDay(at(h)))
    expect([...seen].sort()).toEqual(['afternoon', 'evening', 'morning'])
  })

  it('never disagrees with getSectionForHour about which half of the day it is', () => {
    for (let h = 0; h < 24; h++) {
      const section = getSectionForHour(h)
      const tod = getTimeOfDay(at(h))
      if (section === 'afternoon') expect(tod).toBe('afternoon')
      if (section === 'evening' || section === 'night') expect(tod).toBe('evening')
      if (section === 'morning' || section === 'earlyMorning') expect(tod).toBe('morning')
    }
  })
})

describe('TIMED_SECTIONS', () => {
  it('is derived from the bounds table, not a hand-written copy', () => {
    expect(TIMED_SECTIONS).toEqual(DAY_SECTION_BOUNDS.map(b => b.section))
  })

  it('spans the day from hour 0 to hour 23', () => {
    expect(getSectionForHour(0)).toBe(TIMED_SECTIONS[0])
    expect(getSectionForHour(23)).toBe(TIMED_SECTIONS[TIMED_SECTIONS.length - 1])
  })
})
