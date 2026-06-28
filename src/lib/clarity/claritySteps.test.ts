import { describe, it, expect } from 'vitest'
import { computeClaritySteps } from './claritySteps'

const base = { inboxCount: 0, overdueCount: 0, placeableCount: 0, isEvening: false }

describe('computeClaritySteps', () => {
  it('is all-clear when nothing needs attention (daytime)', () => {
    const { steps, allClear } = computeClaritySteps(base)
    expect(allClear).toBe(true)
    expect(steps.every((s) => s.status === 'done')).toBe(true)
    expect(steps.map((s) => s.id)).toEqual(['inbox', 'carried', 'plan']) // no review during the day
  })

  it('marks the first unmet step as the next move, later ones as todo', () => {
    const { steps, allClear } = computeClaritySteps({ ...base, inboxCount: 3, placeableCount: 2 })
    expect(allClear).toBe(false)
    const byId = Object.fromEntries(steps.map((s) => [s.id, s.status]))
    expect(byId.inbox).toBe('next')   // first unmet
    expect(byId.carried).toBe('done') // met
    expect(byId.plan).toBe('todo')    // unmet but not first
  })

  it('surfaces carried-over as the next move when inbox is clear', () => {
    const { steps } = computeClaritySteps({ ...base, overdueCount: 1, placeableCount: 4 })
    const byId = Object.fromEntries(steps.map((s) => [s.id, s.status]))
    expect(byId.inbox).toBe('done')
    expect(byId.carried).toBe('next')
  })

  it('includes a review step in the evening', () => {
    const { steps, allClear } = computeClaritySteps({ ...base, isEvening: true })
    expect(steps.map((s) => s.id)).toContain('review')
    // everything else clear → review is the next move
    expect(steps.find((s) => s.id === 'review')?.status).toBe('next')
    expect(allClear).toBe(false)
  })

  it('writes human counts into the detail line', () => {
    const { steps } = computeClaritySteps({ ...base, inboxCount: 1 })
    expect(steps.find((s) => s.id === 'inbox')?.detail).toBe('1 item to triage')
    const { steps: s2 } = computeClaritySteps({ ...base, inboxCount: 5 })
    expect(s2.find((s) => s.id === 'inbox')?.detail).toBe('5 items to triage')
  })
})
