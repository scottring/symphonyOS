import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readSchoolSeenAt, writeSchoolSeenAt, onSchoolSeenChange } from './schoolSeen'

describe('schoolSeen', () => {
  beforeEach(() => localStorage.clear())

  it('reads null before the pool has ever been opened', () => {
    expect(readSchoolSeenAt()).toBeNull()
  })

  it('round-trips a timestamp', () => {
    const at = new Date('2026-08-27T09:00:00Z')
    writeSchoolSeenAt(at)
    expect(readSchoolSeenAt()?.toISOString()).toBe(at.toISOString())
  })

  it('reads null rather than an Invalid Date when the stored value is junk', () => {
    localStorage.setItem('symphony-school-seen-at', 'not a date')
    expect(readSchoolSeenAt()).toBeNull()
  })

  it('notifies the writing tab, which a native storage event would not', () => {
    const cb = vi.fn()
    const off = onSchoolSeenChange(cb)
    const at = new Date('2026-08-27T09:00:00Z')
    writeSchoolSeenAt(at)
    expect(cb).toHaveBeenCalledWith(at)
    off()
  })

  it('stops notifying after cleanup', () => {
    const cb = vi.fn()
    onSchoolSeenChange(cb)()
    writeSchoolSeenAt(new Date())
    expect(cb).not.toHaveBeenCalled()
  })
})
