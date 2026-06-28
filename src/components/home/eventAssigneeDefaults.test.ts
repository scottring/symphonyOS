import { describe, it, expect } from 'vitest'
import { withDefaultEventAssignees } from './eventAssigneeDefaults'
import type { EventNote } from '@/hooks/useEventNotes'

const ME = 'member-iris'
const OTHER = 'member-scott'

function note(partial: Partial<EventNote> & { googleEventId: string }): EventNote {
  return {
    id: `note:${partial.googleEventId}`,
    notes: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...partial,
  }
}

describe('withDefaultEventAssignees', () => {
  it('defaults an unassigned event with no note to the current user', () => {
    const out = withDefaultEventAssignees(new Map(), [{ google_event_id: 'evt-1' }], ME)
    expect(out.get('evt-1')?.assignedTo).toBe(ME)
  })

  it('defaults an event that has a note but no assignee, preserving other fields', () => {
    const map = new Map<string, EventNote>([
      ['evt-1', note({ googleEventId: 'evt-1', notes: 'bring snacks', sharedWithFamily: true })],
    ])
    const out = withDefaultEventAssignees(map, [{ google_event_id: 'evt-1' }], ME)
    expect(out.get('evt-1')?.assignedTo).toBe(ME)
    expect(out.get('evt-1')?.notes).toBe('bring snacks')
    expect(out.get('evt-1')?.sharedWithFamily).toBe(true)
  })

  it('never overrides an explicit single assignment', () => {
    const map = new Map<string, EventNote>([
      ['evt-1', note({ googleEventId: 'evt-1', assignedTo: OTHER })],
    ])
    const out = withDefaultEventAssignees(map, [{ google_event_id: 'evt-1' }], ME)
    expect(out.get('evt-1')?.assignedTo).toBe(OTHER)
  })

  it('never overrides an explicit multi-assignment', () => {
    const map = new Map<string, EventNote>([
      ['evt-1', note({ googleEventId: 'evt-1', assignedToAll: [OTHER] })],
    ])
    const out = withDefaultEventAssignees(map, [{ google_event_id: 'evt-1' }], ME)
    expect(out.get('evt-1')?.assignedTo).toBeUndefined()
    expect(out.get('evt-1')?.assignedToAll).toEqual([OTHER])
  })

  it('falls back to event.id when google_event_id is absent', () => {
    const out = withDefaultEventAssignees(new Map(), [{ id: 'local-1' }], ME)
    expect(out.get('local-1')?.assignedTo).toBe(ME)
  })

  it('returns the map unchanged when there is no current user', () => {
    const map = new Map<string, EventNote>([['evt-1', note({ googleEventId: 'evt-1' })]])
    const out = withDefaultEventAssignees(map, [{ google_event_id: 'evt-1' }], undefined)
    expect(out.get('evt-1')?.assignedTo).toBeUndefined()
  })

  it('does not mutate the input map', () => {
    const map = new Map<string, EventNote>()
    withDefaultEventAssignees(map, [{ google_event_id: 'evt-1' }], ME)
    expect(map.has('evt-1')).toBe(false)
  })

  it('preserves existing notes for events not in the current list', () => {
    const map = new Map<string, EventNote>([
      ['evt-other', note({ googleEventId: 'evt-other', assignedTo: OTHER })],
    ])
    const out = withDefaultEventAssignees(map, [{ google_event_id: 'evt-1' }], ME)
    expect(out.get('evt-other')?.assignedTo).toBe(OTHER)
    expect(out.get('evt-1')?.assignedTo).toBe(ME)
  })
})
