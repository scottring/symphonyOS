import { describe, it, expect } from 'vitest'
import type { TimelineItem } from '@/types/timeline'
import { colorFor } from './weekColorMap'

function mk(overrides: Partial<TimelineItem>): TimelineItem {
  return {
    id: 'x',
    type: 'task',
    title: 'X',
    completed: false,
    startTime: null,
    endTime: null,
    allDay: false,
    ...overrides,
  } as TimelineItem
}

describe('colorFor', () => {
  it('returns purple variant for calendar events', () => {
    const c = colorFor(mk({ type: 'event' }))
    expect(c.bg).toContain('271')
  })

  it('returns yellow variant for routines', () => {
    const c = colorFor(mk({ type: 'routine' }))
    expect(c.bg).toContain('45')
  })

  it('returns cream variant for errand-category tasks', () => {
    const c = colorFor(mk({ type: 'task', category: 'errand' }))
    expect(c.bg).toContain('38')
  })

  it('returns cream variant for chore-category tasks', () => {
    const c = colorFor(mk({ type: 'task', category: 'chore' }))
    expect(c.bg).toContain('38')
  })

  it('returns purple variant for activity-category tasks', () => {
    const c = colorFor(mk({ type: 'task', category: 'activity' }))
    expect(c.bg).toContain('271')
  })

  it('returns peach variant for meal items (id starts with "meal:")', () => {
    const c = colorFor(mk({ id: 'meal:abc', type: 'event' }))
    expect(c.bg).toContain('28')
  })

  it('returns green variant for plain tasks', () => {
    const c = colorFor(mk({ type: 'task' }))
    expect(c.bg).toContain('142')
  })

  it('adds rose ring class when item is overdue', () => {
    const c = colorFor(mk({ type: 'task', isOverdue: true }))
    expect(c.ring).toContain('rose')
  })

  it('returns green (fallback) for unknown shapes', () => {
    const c = colorFor(mk({ type: 'unknown' as never }))
    expect(c.bg).toContain('142')
  })
})
