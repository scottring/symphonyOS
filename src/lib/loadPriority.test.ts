import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { afterPageData, markPageDataLoaded, PAGE_DATA_MAX_WAIT_MS, __resetLoadPriority } from './loadPriority'

describe('loadPriority — the page first, the rest after', () => {
  beforeEach(() => { vi.useFakeTimers(); __resetLoadPriority(true) })
  afterEach(() => { vi.useRealTimers(); __resetLoadPriority(false) })

  it('holds a deferred read until the page data is in', async () => {
    const ran = vi.fn()
    void afterPageData().then(ran)
    await vi.advanceTimersByTimeAsync(10)
    expect(ran).not.toHaveBeenCalled()
    markPageDataLoaded()
    await vi.advanceTimersByTimeAsync(0)
    expect(ran).toHaveBeenCalledTimes(1)
  })

  it('never holds longer than the cap — a page with no task list still loads the rest', async () => {
    const ran = vi.fn()
    void afterPageData().then(ran)
    await vi.advanceTimersByTimeAsync(PAGE_DATA_MAX_WAIT_MS - 1)
    expect(ran).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(ran).toHaveBeenCalledTimes(1)
  })

  it('once open, later reads go at once', async () => {
    markPageDataLoaded()
    const ran = vi.fn()
    void afterPageData().then(ran)
    await vi.advanceTimersByTimeAsync(0)
    expect(ran).toHaveBeenCalledTimes(1)
  })
})
