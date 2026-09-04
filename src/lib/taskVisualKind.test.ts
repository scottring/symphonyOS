import { describe, expect, it } from 'vitest'
import { inferTaskVisualKind } from './taskVisualKind'

describe('inferTaskVisualKind', () => {
  it('names household logistics as activities before generic shopping intent', () => {
    expect(inferTaskVisualKind({ title: 'Pick up Michael from soccer at 6' })).toBe('activity')
  })

  it('separates meals, shopping, appointments, calls, and paperwork', () => {
    expect(inferTaskVisualKind({ title: 'Dinner: tacos' })).toBe('meal')
    expect(inferTaskVisualKind({ title: 'Buy strawberries and lunch snacks' })).toBe('shopping')
    expect(inferTaskVisualKind({ title: 'Dentist appointment 2pm' })).toBe('appointment')
    expect(inferTaskVisualKind({ title: 'Call Dr. Patel about camp forms' })).toBe('appointment')
    expect(inferTaskVisualKind({ title: 'Send Acme proposal draft' })).toBe('call')
  })
})
