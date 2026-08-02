import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  MAX_WALL_PINNED_LISTS,
  readPinnedLists,
  writePinnedLists,
  togglePinnedList,
  onPinnedListsChange,
} from './wallPinnedLists'

describe('wallPinnedLists', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('reads an empty array when nothing is stored', () => {
    expect(readPinnedLists()).toEqual([])
  })

  it('round-trips ids through localStorage', () => {
    writePinnedLists(['a'])
    expect(readPinnedLists()).toEqual(['a'])
  })

  it('caps at MAX_WALL_PINNED_LISTS, keeping the most recent', () => {
    expect(MAX_WALL_PINNED_LISTS).toBe(2)
    writePinnedLists(['a', 'b', 'c'])
    expect(readPinnedLists()).toEqual(['b', 'c'])
  })

  it('drops duplicates', () => {
    writePinnedLists(['a', 'a'])
    expect(readPinnedLists()).toEqual(['a'])
  })

  it('returns an empty array for corrupt stored JSON', () => {
    localStorage.setItem('symphony-wall-pinned-lists', 'not json')
    expect(readPinnedLists()).toEqual([])
  })

  it('ignores non-string entries', () => {
    localStorage.setItem('symphony-wall-pinned-lists', JSON.stringify(['a', 7, null]))
    expect(readPinnedLists()).toEqual(['a'])
  })

  it('toggles a list on and back off', () => {
    expect(togglePinnedList('a')).toEqual(['a'])
    expect(togglePinnedList('a')).toEqual([])
  })

  it('pinning past the cap drops the oldest pin', () => {
    togglePinnedList('a')
    togglePinnedList('b')
    expect(togglePinnedList('c')).toEqual(['b', 'c'])
  })

  it('notifies subscribers in the same tab and stops after cleanup', () => {
    const cb = vi.fn()
    const off = onPinnedListsChange(cb)
    writePinnedLists(['a'])
    expect(cb).toHaveBeenCalledWith(['a'])
    off()
    writePinnedLists(['b'])
    expect(cb).toHaveBeenCalledTimes(1)
  })
})
