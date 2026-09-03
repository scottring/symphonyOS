import { describe, it, expect } from 'vitest'
import { readingEarns, elapsedMinutes, minutesToLog, elapsedLabel, readReadingTimer, writeReadingTimer, readingTimerKey } from './readingScreenTime'

const at = (m: number, s = 0) => new Date(2026, 8, 3, 16, m, s)

describe('readingEarns — one for one, capped, nothing banks', () => {
  it('read 20, earn 20', () => expect(readingEarns(20, 20)).toBe(20))
  it('read 10, earn 10', () => expect(readingEarns(10, 20)).toBe(10))
  it('read nothing, earn nothing', () => expect(readingEarns(0, 20)).toBe(0))
  it('reading past the target earns no more than the target', () => expect(readingEarns(45, 20)).toBe(20))
  it('never negative, never fractional', () => {
    expect(readingEarns(-5, 20)).toBe(0)
    expect(readingEarns(7.9, 20)).toBe(7)
  })
})

describe('the timer', () => {
  const timer = { startedAt: at(0).toISOString() }
  it('counts whole minutes', () => expect(elapsedMinutes(timer, at(7, 40))).toBe(7))
  it('logs at least a minute once the kid has read for half of one', () => {
    expect(minutesToLog(timer, at(0, 20))).toBe(0)
    expect(minutesToLog(timer, at(0, 45))).toBe(1)
    expect(minutesToLog(timer, at(12, 59))).toBe(12)
  })
  it('reads like a clock', () => expect(elapsedLabel(timer, at(7, 5))).toBe('7:05'))
  it('survives in storage, keyed by kid and day', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    } as unknown as Storage
    const key = readingTimerKey('kid', '2026-09-03')
    writeReadingTimer(storage, key, timer)
    expect(readReadingTimer(storage, key)).toEqual(timer)
    writeReadingTimer(storage, key, null)
    expect(readReadingTimer(storage, key)).toBeNull()
    expect(readReadingTimer(null, key)).toBeNull()
  })
})
