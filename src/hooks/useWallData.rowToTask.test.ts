// The wall's one snake_case → Task mapper. Fixtures carry the RAW column
// shape (uuid[] in assigned_to_all), because that is what the real rows have.
import { describe, it, expect, vi } from 'vitest'
import { rowToTask } from './useWallData'

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
})
