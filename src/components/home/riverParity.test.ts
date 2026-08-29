import { describe, it, expect } from 'vitest'
import { resolveRoutine } from '@/lib/routineUtils'
import { createMockRoutine } from '@/test/mocks/factories'
import { ALL_LAYERS } from '@/lib/domains'

const DATE = new Date(2026, 7, 24, 9, 0, 0)
const PREFS = { hideRoutines: false, layers: ALL_LAYERS }

/** The river's filter before migration: assigned_to only. */
function riverBefore(r: import('@/types/actionable').Routine, selected: string[]): boolean {
  if (!r.assigned_to || !selected.includes(r.assigned_to)) return false
  if (r.show_on_timeline === false) return false
  return !!r.time_of_day
}

describe('river view — multi-assigned routines', () => {
  const multi = createMockRoutine({
    assigned_to: null,
    assigned_to_all: ['scott', 'iris'],
    time_of_day: '09:00',
  })

  it('was invisible before, because assigned_to was null', () => {
    expect(riverBefore(multi, ['scott'])).toBe(false)
  })

  it('is visible after, via owners', () => {
    expect(resolveRoutine(multi, { date: DATE, member: ['scott'], prefs: PREFS }).shows).toBe(true)
  })

  it('still excludes a routine owned by nobody selected', () => {
    const theirs = createMockRoutine({ assigned_to: 'ella', time_of_day: '09:00' })
    expect(resolveRoutine(theirs, { date: DATE, member: ['scott'], prefs: PREFS }).shows).toBe(false)
  })
})
