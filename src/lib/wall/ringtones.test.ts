import { describe, it, expect } from 'vitest'
import {
  PLAYERS, RINGTONES, DEFAULT_RINGTONE, RINGTONE_STORAGE_KEY,
  asRingtone, loadRingtone, saveRingtone, type AudioCtx,
} from './ringtones'

// A fake Web Audio context that records what each player schedules and
// enforces the rules a real context throws on.
interface Rec { starts: number[]; stops: number[]; problems: string[] }

function fakeCtx(rec: Rec): AudioCtx & { destination: object } {
  const param = () => {
    const p = {
      value: 1,
      setValueAtTime(v: number, t: number) { check(v, t, 'set'); return p },
      linearRampToValueAtTime(v: number, t: number) { check(v, t, 'linear'); return p },
      exponentialRampToValueAtTime(v: number, t: number) {
        check(v, t, 'exp')
        // A real context throws on an exponential ramp to zero or below.
        if (!(v > 0)) rec.problems.push(`exponential ramp to ${v}`)
        return p
      },
      cancelScheduledValues() { return p },
    }
    return p
  }
  const check = (v: number, t: number, what: string) => {
    if (!Number.isFinite(v)) rec.problems.push(`${what} value ${v}`)
    if (!Number.isFinite(t) || t < 0) rec.problems.push(`${what} time ${t}`)
  }
  const node = () => ({ connect: (n: unknown) => n, disconnect: () => undefined })
  return {
    currentTime: 0,
    destination: node(),
    createOscillator: () => ({
      ...node(), type: 'sine', frequency: param(), detune: param(),
      start: (t: number) => rec.starts.push(t),
      stop: (t: number) => rec.stops.push(t),
    }),
    createGain: () => ({ ...node(), gain: param() }),
    createBiquadFilter: () => ({ ...node(), type: 'lowpass', frequency: param(), Q: param(), gain: param() }),
  } as unknown as AudioCtx & { destination: object }
}

describe('ringtone catalog', () => {
  it('has a player for every ringtone and a mix of calm and fun', () => {
    for (const r of RINGTONES) expect(PLAYERS[r.id]).toBeTypeOf('function')
    expect(Object.keys(PLAYERS).sort()).toEqual(RINGTONES.map((r) => r.id).sort())
    expect(RINGTONES.filter((r) => r.mood === 'calm').length).toBeGreaterThanOrEqual(5)
    expect(RINGTONES.filter((r) => r.mood === 'fun').length).toBeGreaterThanOrEqual(5)
  })

  it.each(RINGTONES.map((r) => r.id))('%s schedules sane notes that all end within its length', (id) => {
    const rec: Rec = { starts: [], stops: [], problems: [] }
    const ctx = fakeCtx(rec)
    const t0 = 10
    const seconds = PLAYERS[id]({ ctx, dest: ctx.destination as AudioNode }, t0)
    expect(rec.problems).toEqual([])
    expect(seconds).toBeGreaterThan(1)
    expect(seconds).toBeLessThanOrEqual(6)
    expect(rec.starts.length).toBeGreaterThan(0)
    expect(rec.stops.length).toBe(rec.starts.length)
    expect(Math.min(...rec.starts)).toBeGreaterThanOrEqual(t0)
    // Nothing keeps sounding into the next ring (small release tails allowed).
    expect(Math.max(...rec.stops)).toBeLessThanOrEqual(t0 + seconds + 0.3)
  })
})

describe('ringtone choice', () => {
  it('falls back to the default for anything unknown', () => {
    expect(asRingtone('frog-chorus')).toBe('frog-chorus')
    expect(asRingtone('nokia')).toBe(DEFAULT_RINGTONE)
    expect(asRingtone(null)).toBe(DEFAULT_RINGTONE)
  })

  it('round-trips through storage and survives storage that throws', () => {
    const m = new Map<string, string>()
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } }
    expect(loadRingtone(store)).toBe(DEFAULT_RINGTONE)
    saveRingtone(store, 'robot')
    expect(m.get(RINGTONE_STORAGE_KEY)).toBe('robot')
    expect(loadRingtone(store)).toBe('robot')
    const broken = { getItem: () => { throw new Error('no') }, setItem: () => { throw new Error('no') } }
    expect(loadRingtone(broken)).toBe(DEFAULT_RINGTONE)
    expect(() => saveRingtone(broken, 'robot')).not.toThrow()
    expect(loadRingtone(null)).toBe(DEFAULT_RINGTONE)
  })
})
