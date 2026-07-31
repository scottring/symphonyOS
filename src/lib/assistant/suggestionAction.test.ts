import { describe, it, expect } from 'vitest'
import { revealItemId } from './suggestionAction'
import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'

function suggestion(over: Partial<ProactiveSuggestion> = {}): ProactiveSuggestion {
  return {
    id: 'sug-1',
    entityType: 'task',
    entityId: 'abc-123',
    suggestionType: 'followup',
    title: 'Find backup babysitter',
    actionPayload: {},
    ...over,
  } as ProactiveSuggestion
}

describe('revealItemId', () => {
  // Today's selection API is keyed by a PREFIXED composite id (`task-<uuid>`,
  // `event-<uuid>`) — never a bare entity uuid. Passing the bare id matches no
  // row, so the panel silently never opens. That was the "clicking Show me does
  // nothing" bug.
  it('prefixes a task entity so it matches a Today row id', () => {
    expect(revealItemId(suggestion({ entityType: 'task', entityId: 'abc-123' }))).toBe('task-abc-123')
  })

  it('prefixes a calendar_event entity with the event- prefix', () => {
    expect(revealItemId(suggestion({ entityType: 'calendar_event', entityId: 'evt-9' }))).toBe('event-evt-9')
  })

  it('returns null for entity types that have no Today row to reveal', () => {
    expect(revealItemId(suggestion({ entityType: 'general' }))).toBeNull()
    expect(revealItemId(suggestion({ entityType: 'email_action' }))).toBeNull()
  })

  it('returns null when the entity id is missing', () => {
    expect(revealItemId(suggestion({ entityType: 'task', entityId: '' }))).toBeNull()
  })
})
