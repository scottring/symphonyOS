import { describe, it, expect } from 'vitest'
import type { TimelineItem } from '@/types/timeline'
import { rowSubtitle } from './rowSubtitle'

function baseItem(overrides: Partial<TimelineItem>): TimelineItem {
  return {
    id: 't1',
    type: 'task',
    title: 'X',
    completed: false,
    startTime: null,
    endTime: null,
    allDay: false,
    ...overrides,
  } as TimelineItem
}

describe('rowSubtitle', () => {
  it('returns empty string for a plain task with no category', () => {
    expect(rowSubtitle(baseItem({ type: 'task' }))).toBe('')
  })

  it('returns empty string for category=task (the default, no value)', () => {
    expect(rowSubtitle(baseItem({ type: 'task', category: 'task' }))).toBe('')
  })

  it('returns "Errand" for an errand without time', () => {
    expect(rowSubtitle(baseItem({ type: 'task', category: 'errand' }))).toBe('Errand')
  })

  it('returns "Chore" for a chore', () => {
    expect(rowSubtitle(baseItem({ type: 'task', category: 'chore' }))).toBe('Chore')
  })

  it('returns "Routine" for a routine row', () => {
    expect(rowSubtitle(baseItem({ type: 'routine' }))).toBe('Routine')
  })

  it('returns "Event · 60 min" for a 1-hour event', () => {
    const start = new Date(2026, 4, 20, 13, 0)
    const end = new Date(2026, 4, 20, 14, 0)
    expect(
      rowSubtitle(baseItem({ type: 'event', startTime: start, endTime: end })),
    ).toBe('Event · 60 min')
  })

  it('returns "Errand · 20 min" combining category + duration', () => {
    const start = new Date(2026, 4, 20, 17, 30)
    const end = new Date(2026, 4, 20, 17, 50)
    expect(
      rowSubtitle(baseItem({ type: 'task', category: 'errand', startTime: start, endTime: end })),
    ).toBe('Errand · 20 min')
  })

  it('returns "Event" for an all-day event (no duration shown)', () => {
    expect(
      rowSubtitle(baseItem({ type: 'event', allDay: true })),
    ).toBe('Event')
  })
})
