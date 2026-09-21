import { describe, it, expect, beforeEach, vi } from 'vitest'
import { emptyDraft } from './session'
import { readDraft, writeDraft, clearDraft } from './sessionDraft'

describe('sessionDraft', () => {
  beforeEach(() => localStorage.clear())
  const d = { ...emptyDraft(new Date(2026, 9, 1), new Date(2026, 8, 1)), wentWell: 'bike rack' }

  it('round-trips per user and period', () => {
    writeDraft('u1', d)
    expect(readDraft('u1', '2026-10-01')?.wentWell).toBe('bike rack')
    expect(readDraft('u2', '2026-10-01')).toBeNull()
    clearDraft('u1', '2026-10-01')
    expect(readDraft('u1', '2026-10-01')).toBeNull()
  })

  it('survives a storage that throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readDraft('u1', '2026-10-01')).toBeNull()
    spy.mockRestore()
  })
})
