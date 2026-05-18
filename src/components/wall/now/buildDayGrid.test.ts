import { describe, it, expect } from 'vitest'
import { buildDayGrid, type BuildDayGridInput } from './buildDayGrid'
import type { WallDayData } from '@/hooks/useWallData'
import type { TimelineItem } from '@/types/timeline'
import type { TodayItem } from '../today/todayItem'

const NOW = new Date('2026-05-18T13:00:00')

function timeline(id: string, title: string, hh: number, dayOffset = 0): TimelineItem {
  const d = new Date(NOW)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hh, 0, 0, 0)
  return { id, title, startTime: d } as unknown as TimelineItem
}

function emptyDay(dayOffset: number): WallDayData {
  const date = new Date(NOW)
  date.setDate(date.getDate() + dayOffset)
  date.setHours(0, 0, 0, 0)
  return {
    date,
    isToday: dayOffset === 0,
    items: { allday: [], morning: [], afternoon: [], evening: [], unscheduled: [] },
    birthdays: [],
    milestones: [],
  } as unknown as WallDayData
}

function todayItem(id: string, title: string, hh: number | null, completed = false): TodayItem {
  let startTime: Date | null = null
  if (hh !== null) { startTime = new Date(NOW); startTime.setHours(hh, 0, 0, 0) }
  return { id, kind: 'task', title, completed, ownerId: null, startTime, sourceId: id }
}

function baseInput(overrides: Partial<BuildDayGridInput> = {}): BuildDayGridInput {
  return {
    days: [emptyDay(0), emptyDay(1)],
    now: NOW,
    todayItems: [],
    overdueTasks: [],
    inboxCount: 0,
    emailCount: 0,
    familyPrompt: 'What was the best part of today?',
    ...overrides,
  }
}

describe('buildDayGrid', () => {
  it('Up Next surfaces the next future timed item across the week', () => {
    const day0 = emptyDay(0)
    day0.items.afternoon = [timeline('e1', 'Soccer practice', 17)]
    const grid = buildDayGrid(baseInput({ days: [day0, emptyDay(1)] }))
    expect(grid.upNext.headline).toBe('Soccer practice')
    expect(grid.upNext.tap).toEqual({ quadrant: 'upNext', itemId: 'e1' })
  })

  it('Up Next falls back to a later day when nothing is left today', () => {
    const day1 = emptyDay(1)
    day1.items.morning = [timeline('e2', 'Dentist', 8, 1)]
    const grid = buildDayGrid(baseInput({ days: [emptyDay(0), day1] }))
    expect(grid.upNext.headline).toBe('Dentist')
  })

  it('Up Next never reads as empty', () => {
    const grid = buildDayGrid(baseInput())
    expect(grid.upNext.headline).toBe('Nothing scheduled')
    expect(grid.upNext.tap).toEqual({ quadrant: 'upNext', itemId: null })
  })

  it('Today returns all remaining timed items (visual cap applied downstream)', () => {
    const grid = buildDayGrid(baseInput({
      todayItems: [
        todayItem('t1', 'A', 14), todayItem('t2', 'B', 15),
        todayItem('t3', 'C', 16), todayItem('t4', 'D', 17),
        todayItem('done', 'E', 18, true),
      ],
    }))
    expect(grid.today.headline).toBe('A quiet afternoon')
    expect(grid.today.lines).toHaveLength(4)
    expect(grid.today.lines.map(l => l.text)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('Pending returns all overflow items so the expand view can show them', () => {
    const grid = buildDayGrid(baseInput({
      overdueTasks: [
        timeline('o1', 'One', 9, -1), timeline('o2', 'Two', 9, -1),
        timeline('o3', 'Three', 9, -1), timeline('o4', 'Four', 9, -1),
        timeline('o5', 'Five', 9, -1),
      ],
    }))
    expect(grid.pending.headline).toBe('5 things waiting')
    expect(grid.pending.lines).toHaveLength(5)
    expect(grid.pending.lines.every(l => l.tag === 'overdue')).toBe(true)
  })

  it('Pending is neutral by default and tags only overdue lines', () => {
    const grid = buildDayGrid(baseInput({
      overdueTasks: [timeline('o1', 'Pay water bill', 9, -1)],
      inboxCount: 2,
      emailCount: 8,
    }))
    expect(grid.pending.headline).toBe('3 things waiting')
    expect(grid.pending.lines).toHaveLength(3)
    expect(grid.pending.lines[0]).toEqual({ text: 'Pay water bill', tag: 'overdue' })
    expect(grid.pending.lines[1].tag).toBeUndefined()
    expect(grid.pending.lines[2].tag).toBeUndefined()
  })

  it('Pending shows a calm caught-up state with no lines when nothing waits', () => {
    const grid = buildDayGrid(baseInput())
    expect(grid.pending.headline).toBe('All caught up')
    expect(grid.pending.lines).toHaveLength(0)
  })

  it('Family Question carries the prompt and falls back when absent', () => {
    expect(buildDayGrid(baseInput()).familyQuestion.headline)
      .toBe('"What was the best part of today?"')
    expect(buildDayGrid(baseInput({ familyPrompt: null })).familyQuestion.headline)
      .toBe('No question today')
  })
})
