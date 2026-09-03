import { describe, it, expect } from 'vitest'
import { buildInboxRows } from './inbox'

const scott = { id: 'u1', name: 'Scott', kind: 'member' }
const iris = { id: 'u2', name: 'Iris', kind: 'member' }

function session(over: Partial<Parameters<typeof buildInboxRows>[0][number]>) {
  return {
    id: 's',
    entity_type: 'task',
    entity_id: 't1',
    title: 'Respond to Christian',
    messages: [],
    updated_at: '2026-09-02T10:00:00Z',
    scope: 'compound',
    ...over,
  }
}

describe('buildInboxRows', () => {
  it('skips threads with no messages', () => {
    expect(buildInboxRows([session({ messages: [] })], {}, 'u1')).toEqual([])
  })

  it('previews the last message with its author and orders newest first', () => {
    const rows = buildInboxRows([
      session({
        id: 'old', entity_id: 't1', title: 'Old', updated_at: '2026-09-01T09:00:00Z',
        messages: [{ role: 'user', content: 'first', timestamp: '2026-09-01T09:00:00Z', author: scott }],
      }),
      session({
        id: 'new', entity_id: 't2', title: 'New', updated_at: '2026-09-02T09:00:00Z',
        messages: [
          { role: 'user', content: 'hey', timestamp: '2026-09-02T08:00:00Z', author: scott },
          { role: 'user', content: 'Can you take this one?', timestamp: '2026-09-02T09:00:00Z', author: iris },
        ],
      }),
    ], {}, 'u1')
    expect(rows.map((r) => r.sessionId)).toEqual(['new', 'old'])
    expect(rows[0]).toMatchObject({
      entityType: 'task', entityId: 't2', title: 'New',
      lastAuthor: 'Iris', lastText: 'Can you take this one?', unread: true,
    })
    expect(rows[1].unread).toBe(false) // my own last word
  })

  it('marks read when my stamp is after the last message', () => {
    const rows = buildInboxRows([
      session({
        messages: [{ role: 'user', content: 'hi', timestamp: '2026-09-02T09:00:00Z', author: iris }],
      }),
    ], { s: '2026-09-02T09:30:00Z' }, 'u1')
    expect(rows[0].unread).toBe(false)
  })

  it('names Symphony as the author of an assistant reply', () => {
    const rows = buildInboxRows([
      session({
        messages: [
          { role: 'user', content: 'plan it', timestamp: '2026-09-02T09:00:00Z', author: scott },
          { role: 'assistant', content: 'Three steps…', timestamp: '2026-09-02T09:01:00Z', author: { id: null, name: 'Symphony', kind: 'symphony' } },
        ],
      }),
    ], {}, 'u2')
    expect(rows[0].lastAuthor).toBe('Symphony')
    expect(rows[0].unread).toBe(true)
  })

  it('ignores sessions whose entity kind has no panel', () => {
    const rows = buildInboxRows([
      session({ entity_type: 'meal', messages: [{ role: 'user', content: 'x', author: scott }] }),
    ], {}, 'u1')
    expect(rows).toEqual([])
  })
})
