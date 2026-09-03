import { describe, it, expect, vi } from 'vitest'
import { requestPlanFromPaper, onPlanFromPaperRequest, consumePlanFromPaperRequest } from './planFromPaperSignal'

describe('planFromPaperSignal', () => {
  it('a mounted view takes the request; nothing stays pending', () => {
    const cb = vi.fn()
    const off = onPlanFromPaperRequest(cb)
    expect(requestPlanFromPaper()).toBe(true)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(consumePlanFromPaperRequest()).toBe(false)
    off()
  })
  it('with nobody listening it stays pending until a view mounts and consumes it', () => {
    expect(requestPlanFromPaper()).toBe(false)
    expect(consumePlanFromPaperRequest()).toBe(true)
    expect(consumePlanFromPaperRequest()).toBe(false)
  })
})
