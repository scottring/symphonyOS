import { describe, it, expect } from 'vitest'
import { selectUpNext, formatUpNextStatus } from './upNext'
import type { TimelineItem } from '@/types/timeline'

const NOW = new Date('2026-07-07T07:40:00')

function item(overrides: Partial<TimelineItem>): TimelineItem {
  return {
    id: 'task-1',
    type: 'task',
    title: 'Call the pediatrician',
    startTime: new Date('2026-07-07T08:00:00'),
    endTime: null,
    completed: false,
    ...overrides,
  } as TimelineItem
}

describe('selectUpNext', () => {
  it('picks the earliest upcoming incomplete item with a countdown', () => {
    const sel = selectUpNext(
      [
        item({ id: 'later', startTime: new Date('2026-07-07T15:15:00') }),
        item({ id: 'first', startTime: new Date('2026-07-07T08:00:00') }),
      ],
      NOW,
    )
    expect(sel?.item.id).toBe('first')
    expect(sel?.status).toBe('upcoming')
    expect(sel?.minutes).toBe(20)
    expect(formatUpNextStatus(sel!)).toBe('starts in ~20 min')
  })

  it('keeps a recently-started item in the hero ("since 8:00 AM")', () => {
    const sel = selectUpNext(
      [item({ startTime: new Date('2026-07-07T08:00:00') })],
      new Date('2026-07-07T08:25:00'),
    )
    expect(sel?.status).toBe('started')
    expect(sel?.minutes).toBe(25)
    expect(formatUpNextStatus(sel!)).toBe('since 8:00 AM')
  })

  it('yields to the next item once the grace window (2h) passes', () => {
    const sel = selectUpNext(
      [
        item({ id: 'stale', startTime: new Date('2026-07-07T08:00:00') }),
        item({ id: 'next', startTime: new Date('2026-07-07T15:15:00') }),
      ],
      new Date('2026-07-07T10:30:00'),
    )
    expect(sel?.item.id).toBe('next')
  })

  it('skips completed, all-day, unscheduled, other-day, and routine-collection items', () => {
    const sel = selectUpNext(
      [
        item({ id: 'done', completed: true }),
        item({ id: 'allday', allDay: true }),
        item({ id: 'unscheduled', startTime: null }),
        item({ id: 'tomorrow', startTime: new Date('2026-07-08T08:00:00') }),
        item({ id: 'collection', type: 'routine-collection' }),
      ],
      NOW,
    )
    expect(sel).toBeNull()
  })

  it('returns null when the day is clear (hero hides)', () => {
    expect(selectUpNext([], NOW)).toBeNull()
  })

  it('formats imminent and long countdowns sensibly', () => {
    const inOneMin = selectUpNext([item({ startTime: new Date('2026-07-07T07:40:30') })], NOW)
    expect(formatUpNextStatus(inOneMin!)).toBe('starting now')

    const inFourHours = selectUpNext([item({ startTime: new Date('2026-07-07T11:40:00') })], NOW)
    expect(formatUpNextStatus(inFourHours!)).toBe('starts in ~4 hr')
  })
})
