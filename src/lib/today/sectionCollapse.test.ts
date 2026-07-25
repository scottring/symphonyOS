import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  readCollapsed, writeCollapsed, toggleCollapsed, setCollapsed,
  onCollapsedChange, sectionKey, groupKey,
} from '@/lib/today/sectionCollapse'

describe('sectionCollapse', () => {
  beforeEach(() => localStorage.clear())

  it('starts with Unscheduled collapsed — it is the slab', () => {
    expect(readCollapsed().has(sectionKey('unscheduled'))).toBe(true)
  })

  it('round-trips through localStorage', () => {
    writeCollapsed(new Set([sectionKey('evening')]))
    expect(readCollapsed().has(sectionKey('evening'))).toBe(true)
    expect(readCollapsed().has(sectionKey('morning'))).toBe(false)
  })

  it('toggle flips and persists', () => {
    const after = toggleCollapsed(sectionKey('morning'))
    expect(after.has(sectionKey('morning'))).toBe(true)
    expect(readCollapsed().has(sectionKey('morning'))).toBe(true)
    toggleCollapsed(sectionKey('morning'))
    expect(readCollapsed().has(sectionKey('morning'))).toBe(false)
  })

  it('setCollapsed(key, true) folds and persists, independent of toggle', () => {
    const after = setCollapsed(sectionKey('afternoon'), true)
    expect(after.has(sectionKey('afternoon'))).toBe(true)
    expect(readCollapsed().has(sectionKey('afternoon'))).toBe(true)
  })

  it('setCollapsed(key, false) unfolds and persists, even if never folded', () => {
    // Evening is not in the default-collapsed set, so this proves setCollapsed
    // sets an explicit state rather than requiring a prior fold to undo.
    const after = setCollapsed(sectionKey('evening'), false)
    expect(after.has(sectionKey('evening'))).toBe(false)
    expect(readCollapsed().has(sectionKey('evening'))).toBe(false)

    setCollapsed(sectionKey('evening'), true)
    expect(readCollapsed().has(sectionKey('evening'))).toBe(true)
    const reopened = setCollapsed(sectionKey('evening'), false)
    expect(reopened.has(sectionKey('evening'))).toBe(false)
    expect(readCollapsed().has(sectionKey('evening'))).toBe(false)
  })

  it('namespaces sections and groups so they cannot collide', () => {
    expect(sectionKey('morning')).not.toBe(groupKey('morning'))
  })

  it('notifies subscribers in the same tab', () => {
    const cb = vi.fn()
    const off = onCollapsedChange(cb)
    toggleCollapsed(sectionKey('night'))
    expect(cb).toHaveBeenCalled()
    off()
  })

  it('survives localStorage being unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('nope') })
    expect(() => readCollapsed()).not.toThrow()
    spy.mockRestore()
  })
})
