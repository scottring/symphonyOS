import { describe, it, expect, vi, beforeEach } from 'vitest'

const showToast = vi.fn()
vi.mock('@/hooks/useToast', () => ({ showToast: (...a: unknown[]) => showToast(...a) }))

import { explainCopyDownOnce, copyDownExplanation, COPY_DOWN_EXPLAINED_KEY } from './copyDownExplainer'

describe('explainCopyDownOnce', () => {
  beforeEach(() => { localStorage.clear(); showToast.mockClear() })

  it('says what a copy-down did, the first time only', () => {
    expect(explainCopyDownOnce('season', 'month')).toBe(true)
    expect(showToast).toHaveBeenCalledWith(copyDownExplanation('season', 'month'), 'info', 12000)
    expect(localStorage.getItem(COPY_DOWN_EXPLAINED_KEY)).toBe('1')
    expect(explainCopyDownOnce('month', 'week')).toBe(false)
    expect(showToast).toHaveBeenCalledTimes(1)
  })

  it('names both rungs and the two marks the original will carry', () => {
    const s = copyDownExplanation('month', 'week')
    expect(s).toMatch(/Copied into this week/)
    expect(s).toMatch(/The month keeps it as a record/)
    expect(s).toMatch(/→ placed/)
    expect(s).toMatch(/→ done/)
  })
})
