import { describe, it, expect } from 'vitest'
import { routineMoveKind } from './routineMove'

// What a routine occurrence's drag onto another day writes (final review,
// 2026-10-03: a Weekend-rule routine moved Saturday → Sunday by a one-day
// reschedule fell back into Sometime).
describe('routineMoveKind', () => {
  const weekend = ['2026-10-03', '2026-10-04']
  it('from Sometime, it is given the day', () => {
    expect(routineMoveKind({ patternType: 'weekend', fromIso: '2026-10-03', toIso: '2026-10-03', weekendKeys: weekend, inSometime: true })).toBe('plan')
  })
  it('a Weekend-rule routine moved between its weekend days changes which day it is planned on', () => {
    expect(routineMoveKind({ patternType: 'weekend', fromIso: '2026-10-03', toIso: '2026-10-04', weekendKeys: weekend, inSometime: false })).toBe('replan')
  })
  it('anything else moves as a one-day reschedule', () => {
    expect(routineMoveKind({ patternType: 'weekly', fromIso: '2026-10-03', toIso: '2026-10-04', weekendKeys: weekend, inSometime: false })).toBe('reschedule')
    expect(routineMoveKind({ patternType: 'weekend', fromIso: '2026-10-03', toIso: '2026-10-06', weekendKeys: weekend, inSometime: false })).toBe('reschedule')
  })
})
