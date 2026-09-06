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
    expect(inferTaskVisualKind({ title: 'Call Dr. Patel about camp forms' })).toBe('call')
    expect(inferTaskVisualKind({ title: 'Send Acme proposal draft' })).toBe('call')
  })

  it('a call is a call before it is an appointment', () => {
    expect(inferTaskVisualKind({ title: 'Call Dr. Park re inhaler' })).toBe('call')
  })

  it('a birthday lunch out is an appointment, not a meal plan', () => {
    expect(inferTaskVisualKind({ title: "Grandma's 80th birthday lunch at Petit Louis" })).toBe('appointment')
  })

  it('dry cleaning is an errand task', () => {
    expect(inferTaskVisualKind({ title: 'Pick up dry cleaning' })).toBe('task')
  })

  it('meal planning is still a meal', () => {
    expect(inferTaskVisualKind({ title: 'Meal plan and grocery run' })).toBe('shopping')
  })
})
