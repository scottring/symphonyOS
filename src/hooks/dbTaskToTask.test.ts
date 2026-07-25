import { describe, it, expect } from 'vitest'
import { dbTaskToTask, type DbTask } from './useSupabaseTasks'

function baseRow(overrides: Partial<DbTask> = {}): DbTask {
  return {
    id: 't1', title: 'x', completed: false, bucket: 'inbox',
    user_id: 'u1',
    scheduled_for: null, deferred_until: null, defer_count: null,
    is_all_day: null, is_someday: null, context: null, scope: null, category: null,
    notes: null, links: null, phone_number: null, contact_id: null,
    assigned_to: null, assigned_to_all: null, project_id: null,
    parent_task_id: null, linked_event_id: null, link_type: null,
    linked_activity_type: null, linked_activity_id: null, estimated_duration: null,
    location: null, location_place_id: null, is_waiting: null, waiting_since: null,
    needs_discussion: null, discussion_note: null, week_deferred_at: null,
    week_start: null,
    group_members: [],
    created_at: '2026-06-05T00:00:00Z', updated_at: '2026-06-05T00:00:00Z',
    ...overrides,
  } as DbTask
}

describe('dbTaskToTask groupMembers', () => {
  it('maps an empty group_members to undefined', () => {
    expect(dbTaskToTask(baseRow()).groupMembers).toBeUndefined()
  })
  it('maps populated group_members refs through', () => {
    const refs = [{ type: 'event' as const, id: 'e1' }, { type: 'routine' as const, id: 'r1' }]
    expect(dbTaskToTask(baseRow({ group_members: refs })).groupMembers).toEqual(refs)
  })

  it('maps scope, defaulting to individual when the column is null', () => {
    expect(dbTaskToTask(baseRow({ scope: 'compound' })).scope).toBe('compound')
    expect(dbTaskToTask(baseRow({ scope: null })).scope).toBe('individual')
  })
})

describe('dbTaskToTask week_start', () => {
  it('is undefined when the column is null — NULL means "the current week" (legacy rows)', () => {
    expect(dbTaskToTask(baseRow({ week_start: null })).weekStart).toBeUndefined()
  })

  // The trap: `week_start` is a DATE column, so `new Date('2026-07-20')` would parse
  // as UTC midnight and read back as the 19th anywhere west of Greenwich — a week
  // placement silently landing on the wrong week.
  it('parses the date string to LOCAL midnight, not UTC', () => {
    const d = dbTaskToTask(baseRow({ week_start: '2026-07-20' })).weekStart!
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(6) // July
    expect(d.getDate()).toBe(20)
    expect(d.getHours()).toBe(0)
  })

  it('tolerates a full timestamp coming back from the column', () => {
    const d = dbTaskToTask(baseRow({ week_start: '2026-07-20T00:00:00Z' })).weekStart!
    expect(d.getDate()).toBe(20)
  })
})
