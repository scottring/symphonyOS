import { describe, it, expect } from 'vitest'
import { placesRow, reviveIfPlaced } from './letGoRow.ts'

const gone = { dismissed_at: '2026-11-04T09:00:00Z', category: 'task' }

describe('letGoRow — a let-go item placed again comes back', () => {
  it('a day, a pick, a stamp or a period list clears dismissed_at', () => {
    for (const u of [{ scheduled_for: '2026-11-04' }, { planned_on: '2026-11-04' }, { week_start: '2026-11-01' }, { month_start: '2026-11-01' }, { season_start: '2026-09-01' }, { bucket: 'week' }, { bucket: 'quarter' }]) {
      expect(reviveIfPlaced(u, gone)).toEqual({ dismissed_at: null })
    }
  })
  it('Someday, the Inbox, a title or a cleared day do not', () => {
    for (const u of [{ bucket: 'someday' }, { bucket: 'inbox' }, { title: 'x' }, { scheduled_for: null }]) {
      expect(placesRow(u)).toBe(false)
      expect(reviveIfPlaced(u, gone)).toEqual({})
    }
  })
  it('a stated dismissed_at, a school paper, or a live row are left alone', () => {
    expect(reviveIfPlaced({ scheduled_for: '2026-11-04', dismissed_at: gone.dismissed_at }, gone)).toEqual({})
    expect(reviveIfPlaced({ scheduled_for: '2026-11-04' }, { ...gone, category: 'paper' })).toEqual({})
    expect(reviveIfPlaced({ scheduled_for: '2026-11-04' }, { dismissed_at: null, category: 'task' })).toEqual({})
    expect(reviveIfPlaced({ scheduled_for: '2026-11-04' }, null)).toEqual({})
  })
})
