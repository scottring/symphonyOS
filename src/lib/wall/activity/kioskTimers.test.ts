import { describe, it, expect } from 'vitest'
import {
  startTimer, remainingMs, isTimerDone, addMinute, formatRemaining, soonestTimer, timerProgress, durationsInStep, MINUTE_MS,
} from './kioskTimers'

const T0 = Date.UTC(2026, 9, 10, 22, 0, 0)

describe('kiosk timers', () => {
  it('store an absolute end time and compute remaining from the clock', () => {
    const t = startTimer('a', 'Simmer', 20, T0)
    expect(t.endsAt).toBe(T0 + 20 * MINUTE_MS)
    expect(remainingMs(t, T0 + 5 * MINUTE_MS)).toBe(15 * MINUTE_MS)
    // A reload 7 minutes later reads the same end time: nothing drifts.
    const reloaded = JSON.parse(JSON.stringify(t))
    expect(remainingMs(reloaded, T0 + 7 * MINUTE_MS)).toBe(13 * MINUTE_MS)
  })

  it('never go negative, and are done at the end time', () => {
    const t = startTimer('a', 'x', 1, T0)
    expect(isTimerDone(t, T0 + MINUTE_MS - 1)).toBe(false)
    expect(isTimerDone(t, T0 + MINUTE_MS)).toBe(true)
    expect(remainingMs(t, T0 + 10 * MINUTE_MS)).toBe(0)
  })

  it('+1 min extends a running timer, and restarts a finished one from now', () => {
    const t = startTimer('a', 'x', 5, T0)
    expect(addMinute(t, T0 + MINUTE_MS).endsAt).toBe(T0 + 6 * MINUTE_MS)
    const late = T0 + 9 * MINUTE_MS
    const again = addMinute(t, late)
    expect(again.endsAt).toBe(late + MINUTE_MS)
    expect(isTimerDone(again, late)).toBe(false)
  })

  it('format as m:ss, rounding up so a live timer never reads 0:00', () => {
    expect(formatRemaining(6 * MINUTE_MS + 12_000)).toBe('6:12')
    expect(formatRemaining(400)).toBe('0:01')
    expect(formatRemaining(0)).toBe('0:00')
    expect(formatRemaining(3_725_000)).toBe('1:02:05')
  })

  it('soonest: a ringing timer first, else least time left', () => {
    const a = startTimer('a', 'a', 10, T0)
    const b = startTimer('b', 'b', 3, T0)
    expect(soonestTimer([a, b], T0)?.id).toBe('b')
    const rung = startTimer('c', 'c', 1, T0 - 5 * MINUTE_MS)
    expect(soonestTimer([a, b, rung], T0)?.id).toBe('c')
    expect(soonestTimer([], T0)).toBeNull()
  })

  it('progress runs 0 → 1', () => {
    const t = startTimer('a', 'x', 10, T0)
    expect(timerProgress(t, T0)).toBe(0)
    expect(timerProgress(t, T0 + 5 * MINUTE_MS)).toBeCloseTo(0.5)
    expect(timerProgress(t, T0 + 20 * MINUTE_MS)).toBe(1)
  })

  it('read the durations a step names', () => {
    expect(durationsInStep('Simmer, covered, for 20 minutes.')).toEqual([20])
    expect(durationsInStep('Bake 5–7 min until golden')).toEqual([5])
    expect(durationsInStep('Rest 1 hour, then roast 1 1/2 hours')).toEqual([60, 90])
    expect(durationsInStep('Chop the onion')).toEqual([])
  })
})
