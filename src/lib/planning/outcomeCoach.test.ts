// src/lib/planning/outcomeCoach.test.ts
import { describe, it, expect } from 'vitest'
import { looksLikeActivity } from './outcomeCoach'

describe('looksLikeActivity', () => {
  it.each([
    'Start working on estate planning and will',
    'start the garden project',
    'Continue piano practice',
    'Keep working on the budget',
    'Work on the yard',
    'Get a rough outline of spring and summer breaks',
    'Plan to exercise more',
    'Try to eat better',
    'Make progress on the renovation',
    'Focus on health',
  ])('flags activity phrasing: %s', (t) => {
    expect(looksLikeActivity(t)).toBe(true)
  })

  it.each([
    'Will drafted and signed',
    'A money plan we actually follow',
    'Winter vacation booked',
    'Bikes bought, family riding weekly',
    'Kitchen dishwasher ordered and installed',
    'Plan the week', // imperative but concrete + short — not coached
  ])('accepts outcome phrasing: %s', (t) => {
    expect(looksLikeActivity(t)).toBe(false)
  })
})
