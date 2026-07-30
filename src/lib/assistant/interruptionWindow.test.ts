import { describe, it, expect } from 'vitest'
import { inInterruptionWindow } from './interruptionWindow'
import { isQuietHours } from '@/lib/quietHours'

const at = (h: number, m = 0) => new Date(2026, 6, 30, h, m, 0, 0)

describe('inInterruptionWindow', () => {
  it('allows the working day', () => {
    expect(inInterruptionWindow(at(7))).toBe(true)
    expect(inInterruptionWindow(at(12))).toBe(true)
    expect(inInterruptionWindow(at(20, 59))).toBe(true)
  })

  it('is closed before 07:00 and from 21:00', () => {
    expect(inInterruptionWindow(at(6, 59))).toBe(false)
    expect(inInterruptionWindow(at(21))).toBe(false)
    expect(inInterruptionWindow(at(23, 30))).toBe(false)
    expect(inInterruptionWindow(at(3))).toBe(false)
  })

  it('is a DIFFERENT concept from quietHours', () => {
    // quietHours is a Supabase-egress guard (23:00-06:00). 22:00 is outside it
    // but must still be outside the interruption window. Keeping these separate
    // is deliberate: widening quietHours would change wall polling behavior.
    expect(isQuietHours(at(22))).toBe(false)
    expect(inInterruptionWindow(at(22))).toBe(false)
  })
})
