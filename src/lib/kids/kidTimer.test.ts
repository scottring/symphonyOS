import { describe, expect, it } from 'vitest'
import { fractionLeft, hasRung, leftLabel, leftMs, pauseTimer, readTimer, resumeTimer, startTimer, writeTimer } from './kidTimer'
import { asTimerSound } from './timerSounds'

const T0 = 1_000_000

describe('a kid’s timer', () => {
  it('counts down and rings at zero', () => {
    const t = startTimer('Reading', 20, T0, 'routine:read')
    expect(leftLabel(t, T0)).toBe('20:00')
    expect(leftLabel(t, T0 + 6 * 60_000 + 30_000)).toBe('13:30')
    expect(fractionLeft(t, T0 + 10 * 60_000)).toBe(0.5)
    expect(hasRung(t, T0 + 20 * 60_000 - 1)).toBe(false)
    expect(hasRung(t, T0 + 20 * 60_000)).toBe(true)
  })

  it('pauses and picks up where it left off', () => {
    const t = startTimer('Math', 10, T0)
    const paused = pauseTimer(t, T0 + 4 * 60_000)
    expect(leftMs(paused, T0 + 60 * 60_000)).toBe(6 * 60_000)
    expect(hasRung(paused, T0 + 60 * 60_000)).toBe(false)
    const resumed = resumeTimer(paused, T0 + 60 * 60_000)
    expect(leftMs(resumed, T0 + 61 * 60_000)).toBe(5 * 60_000)
  })

  it('survives a reload, and ignores junk', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } as unknown as Storage
    const t = startTimer('Cooking', 5, T0)
    writeTimer(storage, 'k', t)
    expect(readTimer(storage, 'k')).toEqual(t)
    store.set('k', '{"label":3}')
    expect(readTimer(storage, 'k')).toBeNull()
    writeTimer(storage, 'k', null)
    expect(readTimer(storage, 'k')).toBeNull()
    expect(readTimer(null, 'k')).toBeNull()
  })

  it('a sound it does not know is wind chimes', () => {
    expect(asTimerSound('drums')).toBe('drums')
    expect(asTimerSound('kazoo')).toBe('chimes')
  })
})
