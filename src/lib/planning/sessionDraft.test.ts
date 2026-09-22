import { describe, it, expect, beforeEach, vi } from 'vitest'
import { emptyDraft } from './session'
import { readDraft, writeDraft, clearDraft } from './sessionDraft'

describe('sessionDraft', () => {
  beforeEach(() => localStorage.clear())
  const d = { ...emptyDraft('month', new Date(2026, 9, 1), new Date(2026, 8, 1)), wentWell: 'bike rack' }

  it('round-trips per user and period', () => {
    writeDraft('u1', d)
    expect(readDraft('u1', 'month', '2026-10-01')?.wentWell).toBe('bike rack')
    expect(readDraft('u2', 'month', '2026-10-01')).toBeNull()
    clearDraft('u1', 'month', '2026-10-01')
    expect(readDraft('u1', 'month', '2026-10-01')).toBeNull()
  })

  it('survives a storage that throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readDraft('u1', 'month', '2026-10-01')).toBeNull()
    spy.mockRestore()
  })

  it('keys a draft by level, so a week draft and a month draft for the same day never collide', () => {
    const m = { ...emptyDraft('month', new Date(2026, 9, 1), new Date(2026, 8, 1)), wentWell: 'month' }
    const w = { ...emptyDraft('week', new Date(2026, 9, 1), new Date(2026, 8, 24)), wentWell: 'week' }
    writeDraft('u', m); writeDraft('u', w)
    expect(readDraft('u', 'month', '2026-10-01')?.wentWell).toBe('month')
    expect(readDraft('u', 'week', '2026-10-01')?.wentWell).toBe('week')
    clearDraft('u', 'week', '2026-10-01')
    expect(readDraft('u', 'week', '2026-10-01')).toBeNull()
    expect(readDraft('u', 'month', '2026-10-01')?.wentWell).toBe('month')
  })
})
