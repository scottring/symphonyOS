import { describe, it, expect } from 'vitest'
// The mapper is exported from WallV2Shell.tsx for testability; production
// callers consume it from inside that file. Keeping the export public so
// the test file doesn't need to duplicate the logic.
import { pushPresetToUpdates } from './WallV2Shell'

describe('pushPresetToUpdates', () => {
  it("this-week → bucket 'week', no weekDeferredAt, scheduledFor cleared", () => {
    const u = pushPresetToUpdates('this-week')
    expect(u.bucket).toBe('week')
    expect(u.weekDeferredAt).toBeUndefined()
    expect(u.scheduledFor).toBeUndefined()
    expect(u.isSomeday).toBe(false)
  })

  it("next-week → bucket 'week' + weekDeferredAt set to a Date close to now", () => {
    const before = new Date()
    const u = pushPresetToUpdates('next-week')
    const after = new Date()
    expect(u.bucket).toBe('week')
    expect(u.weekDeferredAt).toBeInstanceOf(Date)
    // Should be within the test execution window.
    expect(u.weekDeferredAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(u.weekDeferredAt!.getTime()).toBeLessThanOrEqual(after.getTime())
    expect(u.scheduledFor).toBeUndefined()
    expect(u.isSomeday).toBe(false)
  })

  it("next-month → bucket 'month', no weekDeferredAt", () => {
    const u = pushPresetToUpdates('next-month')
    expect(u.bucket).toBe('month')
    expect(u.weekDeferredAt).toBeUndefined()
    expect(u.scheduledFor).toBeUndefined()
    expect(u.isSomeday).toBe(false)
  })

  it("someday → bucket 'quarter' (longest existing bucket, label-only diff)", () => {
    const u = pushPresetToUpdates('someday')
    expect(u.bucket).toBe('quarter')
    expect(u.weekDeferredAt).toBeUndefined()
    expect(u.scheduledFor).toBeUndefined()
    // isSomeday is the legacy flag — we explicitly clear it since the bucket
    // system replaced it; the family-readable "Someday" label is UI-only.
    expect(u.isSomeday).toBe(false)
  })
})
