// Regression coverage for the "first/next item" preview picker
// (WallCalendar's tomorrowPreview).
//
// SECTIONS_ORDER lists 'allday' FIRST, which is right for rendering a whole
// day top-to-bottom but wrong for "what's the next thing": all-day events
// carry a midnight startTime, so walking SECTIONS_ORDER would preview an
// all-day event ("Trash day") ahead of a real timed morning commitment
// ("School run"). This is the test that would have caught that defect.

import { describe, it, expect } from 'vitest'
import { pickFirstPreviewItem, PREVIEW_SECTIONS } from './tomorrowPreview'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import { emptySections } from '@/lib/today/types'

function mkItem(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'x',
    type: 'task',
    title: 'Title',
    startTime: null,
    endTime: null,
    completed: false,
    ...overrides,
  }
}

function sections(
  partial: Partial<Record<DaySection, TimelineItem[]>>,
): Record<DaySection, TimelineItem[]> {
  return { ...emptySections<TimelineItem>(), ...partial }
}

describe('PREVIEW_SECTIONS', () => {
  it('puts allday last and excludes unscheduled', () => {
    expect(PREVIEW_SECTIONS).toEqual([
      'earlyMorning', 'morning', 'afternoon', 'evening', 'night', 'allday',
    ])
  })
})

describe('pickFirstPreviewItem', () => {
  it('previews the timed morning item, not the all-day event, when a day has both', () => {
    const allDayEvent = mkItem({
      id: 'trash', title: 'Trash day', type: 'event', allDay: true,
      startTime: new Date('2026-07-26T00:00:00'),
    })
    const timedMorning = mkItem({
      id: 'school-run', title: 'School run',
      startTime: new Date('2026-07-26T07:00:00'),
    })
    const result = pickFirstPreviewItem(
      sections({ allday: [allDayEvent], earlyMorning: [timedMorning] }),
    )
    expect(result).toEqual({ title: 'School run', startTime: timedMorning.startTime })
  })

  it('falls back to the all-day event when nothing timed exists', () => {
    const allDayEvent = mkItem({ id: 'trash', title: 'Trash day', type: 'event', allDay: true })
    const result = pickFirstPreviewItem(sections({ allday: [allDayEvent] }))
    expect(result?.title).toBe('Trash day')
  })

  it('never surfaces an unscheduled/untriaged item', () => {
    const untriaged = mkItem({ id: 'someday', title: 'Someday task' })
    const result = pickFirstPreviewItem(sections({ unscheduled: [untriaged] }))
    expect(result).toBeNull()
  })

  it('returns null for undefined sections', () => {
    expect(pickFirstPreviewItem(undefined)).toBeNull()
  })
})
