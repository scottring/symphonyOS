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
