import { describe, it, expect, afterEach } from 'vitest'
import { readPlanLayout, writePlanLayout } from './planLayout'

describe('planLayout — Open journal by default, an explicit Lists choice kept', () => {
  afterEach(() => localStorage.clear())
  it('a device with no choice opens the journal', () => {
    expect(readPlanLayout('month')).toBe('journal')
    expect(readPlanLayout('week')).toBe('journal')
  })
  it('a device that chose Lists keeps Lists, per page', () => {
    writePlanLayout('week', 'lists')
    expect(readPlanLayout('week')).toBe('lists')
    expect(readPlanLayout('month')).toBe('journal')
  })
  it('an unknown stored value is not read as a choice', () => {
    localStorage.setItem('symphony-plan-layout.month', 'grid')
    expect(readPlanLayout('month')).toBe('journal')
  })
})
