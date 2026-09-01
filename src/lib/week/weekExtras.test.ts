import { describe, it, expect } from 'vitest'
import { partitionWeekExtras } from './weekExtras'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

function ev(over: { id: string; title: string; start: string }): CalendarEvent {
  return {
    id: over.id,
    title: over.title,
    start_time: over.start,
    end_time: over.start,
  } as unknown as CalendarEvent
}

describe('partitionWeekExtras', () => {
  it('pulls dinner events out of the grid, grouped by day, label stripped', () => {
    const dinner = ev({ id: 'd1', title: 'Dinner: Salmon, potatoes, and salad', start: '2026-09-01T07:40:00' })
    const other = ev({ id: 'e1', title: 'PT appointment', start: '2026-09-01T09:00:00' })
    const { dinnersByDay, rest } = partitionWeekExtras([dinner, other])
    expect(dinnersByDay.get('2026-09-01')).toEqual([
      { event: dinner, label: 'Salmon, potatoes, and salad' },
    ])
    expect(rest).toEqual([other])
  })

  it('pulls specials events, stripping the prefix through em-dash or colon', () => {
    const sp = ev({ id: 's1', title: 'Specials — Ella: Visual Art · Kaleb: PE', start: '2026-09-01T07:45:00' })
    const { specialsByDay, rest } = partitionWeekExtras([sp])
    expect(specialsByDay.get('2026-09-01')).toEqual([
      { event: sp, label: 'Ella: Visual Art · Kaleb: PE' },
    ])
    expect(rest).toEqual([])
  })

  it('keeps multiple dinners on one day in order', () => {
    const a = ev({ id: 'd1', title: 'Dinner: Soup', start: '2026-09-01T07:40:00' })
    const b = ev({ id: 'd2', title: 'Dinner: Bread', start: '2026-09-01T07:50:00' })
    const { dinnersByDay } = partitionWeekExtras([a, b])
    expect(dinnersByDay.get('2026-09-01')?.map((d) => d.label)).toEqual(['Soup', 'Bread'])
  })

  it('leaves non-matching and startless events in rest', () => {
    const noStart = { id: 'x', title: 'Dinner: ghost' } as unknown as CalendarEvent
    const plain = ev({ id: 'e2', title: 'Grampappa', start: '2026-09-04T16:00:00' })
    const { dinnersByDay, rest } = partitionWeekExtras([noStart, plain])
    expect(dinnersByDay.size).toBe(0)
    expect(rest).toEqual([noStart, plain])
  })
})
