// Regression coverage for the "first/next item" preview pickers
// (WallCalendar's tomorrowPreview, BedtimeView's tomorrowItems).
//
// SECTIONS_ORDER lists 'allday' FIRST, which is right for rendering a whole
// day top-to-bottom but wrong for "what's the next thing": all-day events
// carry a midnight startTime, so walking SECTIONS_ORDER would preview an
// all-day event ("Trash day") ahead of a real timed morning commitment
// ("School run"). This is the test that would have caught that defect.

import { describe, it, expect } from 'vitest'
import { pickFirstPreviewItem, pickPreviewItems, PREVIEW_SECTIONS } from './tomorrowPreview'
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

describe('pickPreviewItems', () => {
  it('orders the timed morning item before the all-day event', () => {
    const allDayEvent = mkItem({
      id: 'trash', title: 'Trash day', type: 'event', allDay: true,
      startTime: new Date('2026-07-26T00:00:00'),
    })
    const timedMorning = mkItem({
      id: 'school-run', title: 'School run',
      startTime: new Date('2026-07-26T07:00:00'),
    })
    const result = pickPreviewItems(
      sections({ allday: [allDayEvent], morning: [timedMorning] }),
      5,
    )
    expect(result.map((i) => i.title)).toEqual(['School run', 'Trash day'])
  })

  it('excludes unscheduled items and respects the limit', () => {
    const untriaged = mkItem({ id: 'someday', title: 'Someday task' })
    const timed = [1, 2, 3].map((n) =>
      mkItem({ id: `t${n}`, title: `Item ${n}`, startTime: new Date(`2026-07-26T0${n}:00:00`) }),
    )
    const result = pickPreviewItems(
      sections({ unscheduled: [untriaged], morning: timed }),
      2,
    )
    expect(result).toHaveLength(2)
    expect(result.every((i) => i.title !== 'Someday task')).toBe(true)
  })

  it('drops skipped items', () => {
    const skipped = mkItem({ id: 'skip', title: 'Skipped', skipped: true })
    const kept = mkItem({ id: 'keep', title: 'Kept' })
    const result = pickPreviewItems(sections({ morning: [skipped, kept] }), 5)
    expect(result.map((i) => i.title)).toEqual(['Kept'])
  })

  it('returns [] for undefined sections', () => {
    expect(pickPreviewItems(undefined, 5)).toEqual([])
  })
})
