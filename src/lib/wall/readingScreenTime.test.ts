import { describe, it, expect } from 'vitest'
import {
  readingEarns, elapsedMinutes, minutesToLog, elapsedLabel, readReadingTimer, writeReadingTimer, readingTimerKey,
  startReadingTimer, pauseReadingTimer, resumeReadingTimer, isTimerRunning,
} from './readingScreenTime'

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
  const timer = startReadingTimer(at(0))
  it('counts whole minutes', () => expect(elapsedMinutes(timer, at(7, 40))).toBe(7))
  it('logs at least a minute once the kid has read for half of one', () => {
    expect(minutesToLog(timer, at(0, 20))).toBe(0)
    expect(minutesToLog(timer, at(0, 45))).toBe(1)
    expect(minutesToLog(timer, at(12, 59))).toBe(12)
  })
  it('reads like a clock', () => expect(elapsedLabel(timer, at(7, 5))).toBe('7:05'))

  it('pause keeps what was read and stops the clock; resume starts it again', () => {
    const paused = pauseReadingTimer(timer, at(4))
    expect(isTimerRunning(paused)).toBe(false)
    expect(elapsedMinutes(paused, at(30))).toBe(4) // an hour later, still 4
    const resumed = resumeReadingTimer(paused, at(30))
    expect(isTimerRunning(resumed)).toBe(true)
    expect(elapsedMinutes(resumed, at(33))).toBe(7)
    expect(resumeReadingTimer(resumed, at(40))).toBe(resumed) // resuming a running timer is a no-op
  })

  it('survives in storage, keyed by kid and day, and still reads the old shape', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    } as unknown as Storage
    const key = readingTimerKey('kid', '2026-09-03')
    writeReadingTimer(storage, key, timer)
    expect(readReadingTimer(storage, key)).toEqual(timer)
    storage.setItem(key, JSON.stringify({ startedAt: at(0).toISOString() }))
    expect(readReadingTimer(storage, key)).toEqual({ carriedMs: 0, runningSince: at(0).toISOString() })
    writeReadingTimer(storage, key, null)
    expect(readReadingTimer(storage, key)).toBeNull()
    expect(readReadingTimer(null, key)).toBeNull()
  })
})
