import { describe, it, expect, vi } from 'vitest'
import { applyTriageWhen } from './applyWhen'

// Spec S4: "Today" is the Today command — dated today AND chosen for my focus.
// Every other when is a date (or a list) only and never touches focus.
describe('applyTriageWhen — the Today command', () => {
  const handlers = () => ({
    onPushTask: vi.fn(async () => true),
    onSetBucket: vi.fn(async () => true),
    onFocus: vi.fn(async () => undefined),
  })

  it('"today" dates the task today and chooses it for focus', async () => {
    const h = handlers()
    expect(await applyTriageWhen('today', 't1', h)).toBe(true)
    const day = (h.onPushTask.mock.calls[0] as unknown[])[1] as Date
    expect(day.toDateString()).toBe(new Date().toDateString())
    expect(h.onFocus).toHaveBeenCalledWith('t1', day)
  })

  it.each(['tomorrow', 'tonight', 'next-week', 'this-week', 'someday'] as const)(
    '"%s" never touches focus', async (when) => {
      const h = handlers()
      await applyTriageWhen(when, 't1', h)
      expect(h.onFocus).not.toHaveBeenCalled()
    })

  it('a cancelled domain gate writes no focus either', async () => {
    const h = { ...handlers(), onPushTask: vi.fn(async () => false) }
    expect(await applyTriageWhen('today', 't1', h)).toBe(false)
    expect(h.onFocus).not.toHaveBeenCalled()
  })
})
