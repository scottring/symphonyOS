import { describe, it, expect } from 'vitest'
import { openScratchpadRows, recentlySorted, whenWritten, rowByline, dbToScratchpadNote, type ScratchpadNote } from './scratchpad'

const now = new Date(2026, 9, 7, 16, 10)
const note = (o: Partial<ScratchpadNote>): ScratchpadNote => ({
  id: 'n', body: 'x', kind: 'note', authorMemberId: null, status: 'open', resolution: null,
  sentToMemberId: null, createdAt: new Date(2026, 9, 7, 9), resolvedAt: null, ...o,
})

describe('scratchpad', () => {
  it('open rows: wall notes newest first, then what was brought up in the app', () => {
    const rows = openScratchpadRows(
      [
        note({ id: 'old', createdAt: new Date(2026, 9, 5) }),
        note({ id: 'new', createdAt: new Date(2026, 9, 7, 15) }),
        note({ id: 'gone', status: 'done', resolvedAt: now }),
      ],
      [{ kind: 'event', id: 'evt', title: 'Thanksgiving travel', note: '  ' }],
    )
    expect(rows.map((r) => r.key)).toEqual(['note:new', 'note:old', 'event:evt'])
    expect(rows[2]).toMatchObject({ kind: 'talk', detail: null, source: 'event' })
  })

  it('done this week keeps 7 days of sorted notes, newest first', () => {
    const sorted = recentlySorted([
      note({ id: 'a', status: 'done', resolvedAt: new Date(2026, 9, 6) }),
      note({ id: 'b', status: 'sent', resolvedAt: new Date(2026, 9, 7, 12) }),
      note({ id: 'stale', status: 'done', resolvedAt: new Date(2026, 8, 29) }),
      note({ id: 'open' }),
    ], now)
    expect(sorted.map((n) => n.id)).toEqual(['b', 'a'])
  })

  it('says when a note was written in words', () => {
    expect(whenWritten(new Date(2026, 9, 7, 16, 9), now)).toBe('Just now')
    expect(whenWritten(new Date(2026, 9, 7, 15, 40), now)).toBe('30 min ago')
    expect(whenWritten(new Date(2026, 9, 7, 8), now)).toBe('This morning')
    expect(whenWritten(new Date(2026, 9, 6, 20), now)).toBe('Yesterday')
    expect(whenWritten(new Date(2026, 9, 5, 20), now)).toBe('Mon')
    expect(whenWritten(new Date(2026, 8, 28), now)).toBe('Sep 28')
  })

  it('bylines name the kind and the writer, or where a flag came from', () => {
    const [own, flagged] = openScratchpadRows(
      [note({ kind: 'talk', authorMemberId: 'ir', createdAt: new Date(2026, 9, 6, 9) })],
      [{ kind: 'task', id: 't', title: 'Fence quote' }],
    )
    const nameOf = (id: string) => (id === 'ir' ? 'Iris' : undefined)
    expect(rowByline(own, nameOf, now)).toBe('Talk about · Iris · Yesterday')
    expect(rowByline(flagged, nameOf, now)).toBe('Brought up from a task')
  })

  it('reads an unknown kind or status from the database as a plain open note', () => {
    const n = dbToScratchpadNote({ id: '1', body: 'b', kind: '?', author_member_id: null, status: '?', resolution: ' ', sent_to_member_id: null, created_at: now.toISOString(), resolved_at: null })
    expect(n).toMatchObject({ kind: 'note', status: 'open', resolution: null })
  })
})
