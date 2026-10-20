// The wall's one snake_case → Task mapper. Fixtures carry the RAW column
// shape (uuid[] in assigned_to_all), because that is what the real rows have.
import { describe, it, expect, vi } from 'vitest'
import { rowToTask, TASK_COLUMNS } from './useWallData'

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'test-user' } }) }))
vi.mock('@/hooks/useGoogleCalendar', () => ({ useGoogleCalendar: () => ({ isConnected: false, fetchEvents: vi.fn() }) }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({}) } }))

const raw = {
  id: 't1', title: 'Return Glee Club permission slip', completed: false,
  created_at: '2026-09-04T21:02:03Z', updated_at: '2026-09-04T21:02:03Z',
  scheduled_for: null, needed_on: '2026-09-14', is_all_day: null, is_waiting: null,
  context: 'family', category: 'homework', notes: null, phone_number: null, contact_id: null,
  assigned_to: null, project_id: null, parent_task_id: null, location: null, location_place_id: null,
}

describe('rowToTask', () => {
  it('carries assigned_to_all through as assignedToAll — a class-wide homework row names every child there', () => {
    const t = rowToTask({ ...raw, assigned_to_all: ['ella', 'kaleb'] })
    expect(t.assignedTo).toBeUndefined()
    expect(t.assignedToAll).toEqual(['ella', 'kaleb'])
    expect(t.category).toBe('homework')
  })

  it('leaves assignedToAll undefined for null or empty', () => {
    expect(rowToTask({ ...raw, assigned_to_all: null }).assignedToAll).toBeUndefined()
    expect(rowToTask({ ...raw, assigned_to_all: [] }).assignedToAll).toBeUndefined()
  })

  // Task 13: the order dragged on the Week page is the wall's untimed order
  // too (groupByDaySection reads sortOrder). Never ordered stays null, not 0.
  it('carries sort_order through as sortOrder, null when never ordered', () => {
    expect(rowToTask({ ...raw, sort_order: 1000 }).sortOrder).toBe(1000)
    expect(rowToTask({ ...raw, sort_order: 0 }).sortOrder).toBe(0)
    expect(rowToTask({ ...raw, sort_order: null }).sortOrder).toBeNull()
  })

  it('asks the database for sort_order', () => {
    expect(TASK_COLUMNS.split(',').map((c) => c.trim())).toContain('sort_order')
  })

  // School papers (2026-10-20): who has it, "Not ours", and when it went in the backpack.
  it('maps a paper\'s holder, dismissal and completion time', () => {
    const t = rowToTask({ ...raw, category: 'paper', held_by: 'iris', dismissed_at: '2026-10-20T15:00:00Z', completed_at: '2026-10-20T16:00:00Z' })
    expect(t.category).toBe('paper')
    expect(t.heldBy).toBe('iris')
    expect(t.dismissedAt).toEqual(new Date('2026-10-20T15:00:00Z'))
    expect(t.completedAt).toEqual(new Date('2026-10-20T16:00:00Z'))
    const open = rowToTask({ ...raw, held_by: null, dismissed_at: null, completed_at: null })
    expect(open.heldBy).toBeUndefined()
    expect(open.dismissedAt).toBeUndefined()
    expect(open.completedAt).toBeUndefined()
  })

  it('selects the paper columns', () => {
    for (const c of ['held_by', 'dismissed_at', 'completed_at']) expect(TASK_COLUMNS).toContain(c)
  })
})
