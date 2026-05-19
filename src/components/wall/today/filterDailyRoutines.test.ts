import { describe, it, expect } from 'vitest'
import { filterDailyRoutines } from './filterDailyRoutines'
import type { TodayItem } from './todayItem'

function item(id: string, kind: TodayItem['kind'], everyday?: boolean): TodayItem {
  return {
    id, kind, title: id, completed: false, ownerId: null,
    startTime: null, sourceId: id, isEverydayRoutine: everyday,
  }
}

describe('filterDailyRoutines', () => {
  const items = [
    item('daily', 'routine-step', true),
    item('weekly', 'routine-step', false),
    item('task', 'task'),
    item('event', 'event'),
  ]

  it('returns the same array reference when hideDaily is false', () => {
    expect(filterDailyRoutines(items, false)).toBe(items)
  })

  it('drops only everyday-routine items when hideDaily is true', () => {
    const out = filterDailyRoutines(items, true)
    expect(out.map(i => i.id)).toEqual(['weekly', 'task', 'event'])
  })
})
