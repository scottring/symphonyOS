import { describe, it, expect } from 'vitest'
import { dbTaskToTask, type DbTask } from './useSupabaseTasks'

// A capture-derived candidate carries the id of the capture that produced it.
// The School pool selects on exactly this field, so it must survive the mapper.
const row = (over: Partial<DbTask>): DbTask => ({
  id: 't1', user_id: 'u1', title: 'Bring a white t-shirt', completed: false,
  bucket: 'inbox', scheduled_for: null, deferred_until: null, defer_count: null,
  is_all_day: null, is_someday: null, context: 'family', scope: 'compound',
  category: 'task', notes: null, capture_id: null, links: null,
  phone_number: null, email: null, contact_id: null, assigned_to: null,
  assigned_to_all: null, project_id: null, parent_task_id: null,
  group_members: null, linked_event_id: null, link_type: null,
  linked_activity_type: null, linked_activity_id: null, estimated_duration: null,
  location: null, location_place_id: null, directions: null, is_waiting: null,
  waiting_since: null, waiting_for: null, needs_discussion: null,
  created_at: '2026-08-25T12:00:00Z', updated_at: '2026-08-25T12:00:00Z',
  ...over,
} as DbTask)

describe('dbTaskToTask captureId', () => {
  it('maps capture_id through', () => {
    expect(dbTaskToTask(row({ capture_id: 'cap-1' })).captureId).toBe('cap-1')
  })

  it('leaves captureId undefined for an ordinary task', () => {
    expect(dbTaskToTask(row({ capture_id: null })).captureId).toBeUndefined()
  })
})
