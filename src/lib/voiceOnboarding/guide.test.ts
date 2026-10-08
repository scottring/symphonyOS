import { describe, it, expect } from 'vitest'
import { guideRequest, guideSnapshot, proposalAction } from './guide'
import { newDraft, reduce, type ExistingPlan } from './flow'

const labels = { year: '2026', season: 'Fall', month: 'October', week: 'Oct 3 – 9', today: 'Thursday' }
const EXISTING: ExistingPlan = {
  goals: [{ id: 'g-garden', title: 'Grow food', context: 'family' }, { id: 'g-office', title: 'Home office' }],
  items: [
    { id: 'm-paint', title: 'Paint the walls', horizon: 'month', goalId: 'g-office' },
    { id: 'm-picnic', title: 'Book the picnic spot', horizon: 'month', goalId: null },
    { id: 'm-other', title: 'A goal not in this session', horizon: 'month', goalId: 'g-hidden' },
  ],
}
const env = { existing: EXISTING, newId: (() => { let n = 0; return () => `n${++n}` })() }
const turns = [{ role: 'user' as const, text: 'Food, kit and training' }]

describe('what the guide is sent', () => {
  it('goals by ref, their lines and the unlinked ones the page shows — nothing about goals it does not show', () => {
    const d = newDraft('month', EXISTING)
    const { request } = guideRequest(d, EXISTING, labels, turns)
    expect(request.goals).toEqual([{ ref: 'g1', title: 'Grow food' }, { ref: 'g2', title: 'Home office' }])
    expect(request.lines).toEqual([
      { goal: 'g2', horizon: 'month', text: 'Paint the walls', existing: true },
      { goal: null, horizon: 'month', text: 'Book the picnic spot', existing: true },
    ])
    expect(JSON.stringify(request)).not.toMatch(/g-garden|g-office|m-paint|A goal not in this session/)
  })

  it('a goal the person can no longer see is not sent, even from a resumed draft', () => {
    const d = newDraft('month', EXISTING)
    const now: ExistingPlan = { goals: [EXISTING.goals[1]], items: EXISTING.items }
    const { request } = guideRequest(d, now, labels, turns)
    expect(request.goals.map((g) => g.title)).toEqual(['Home office'])
  })
})

describe('what a proposal may become', () => {
  it('only at the horizon asked about, only for a goal that was sent', () => {
    const { goalOf } = guideRequest(newDraft('month', EXISTING), EXISTING, labels, turns)
    expect(proposalAction({ level: 'month', goal: 'g2', text: 'Order the desk' }, goalOf, 'month')).toEqual({ type: 'answer', text: 'Order the desk', level: 'month', goal: 'g-office' })
    expect(proposalAction({ level: 'week', goal: 'g2', text: 'x' }, goalOf, 'month')).toBeNull()
    expect(proposalAction({ level: 'month', goal: 'g7', text: 'x' }, goalOf, 'month')).toBeNull()
  })

  it('a reply is out of date once the step, session or visible goals change', () => {
    const d = newDraft('month', EXISTING)
    const at = guideSnapshot(d, EXISTING)
    expect(guideSnapshot(reduce(d, { type: 'continue' }, env), EXISTING)).not.toBe(at)
    expect(guideSnapshot(d, { ...EXISTING, goals: [EXISTING.goals[0]] })).not.toBe(at)
    expect(guideSnapshot(d, EXISTING)).toBe(at)
  })
})
