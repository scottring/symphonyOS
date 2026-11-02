import { describe, it, expect } from 'vitest'
import { goNext, isLastStep, jumpTo, parseProgress, skipStep, startProgress } from './progress'
import { stepsFor } from './steps'

describe('guide progress', () => {
  it('starts on the first step', () => {
    expect(startProgress('week')).toEqual({ current: 'look-back', done: [], skipped: [] })
  })

  it('goNext marks current done and moves on', () => {
    const p = goNext(startProgress('week'), 'week')
    expect(p.current).toBe('calendar')
    expect(p.done).toEqual(['look-back'])
  })

  it('skipStep records skipped, not done', () => {
    const p = skipStep(startProgress('week'), 'week')
    expect(p.skipped).toEqual(['look-back'])
    expect(p.done).toEqual([])
    expect(p.current).toBe('calendar')
  })

  it('goNext clears a prior skip and skipStep clears a prior done', () => {
    const a = goNext({ current: 'look-back', done: [], skipped: ['look-back'] }, 'week')
    expect(a.skipped).toEqual([])
    expect(a.done).toEqual(['look-back'])
    const b = skipStep({ current: 'look-back', done: ['look-back'], skipped: [] }, 'week')
    expect(b.done).toEqual([])
    expect(b.skipped).toEqual(['look-back'])
  })

  it('goNext on the last step stays put', () => {
    const last = stepsFor('day').at(-1)!.id
    const p = goNext({ current: last, done: [], skipped: [] }, 'day')
    expect(p.current).toBe(last)
    expect(p.done).toEqual([last])
    expect(isLastStep(p, 'day')).toBe(true)
    expect(isLastStep(startProgress('day'), 'day')).toBe(false)
  })

  it('jumpTo moves to a known step and ignores unknown ids', () => {
    const p = startProgress('week')
    expect(jumpTo(p, 'inbox').current).toBe('inbox')
    expect(jumpTo(p, 'nope')).toBe(p)
  })

  it('goNext skips steps already done', () => {
    const p = goNext({ current: 'look-back', done: ['read-month', 'calendar'], skipped: [] }, 'week')
    expect(p.current).toBe('inbox')
  })

  it('parseProgress falls back on junk or unknown step', () => {
    expect(parseProgress({ current: 'nope' }, 'week')).toEqual(startProgress('week'))
    expect(parseProgress(null, 'week')).toEqual(startProgress('week'))
    expect(parseProgress('x', 'week')).toEqual(startProgress('week'))
  })

  it('parseProgress keeps valid fields and drops unknown ids', () => {
    const p = parseProgress(
      { current: 'inbox', done: ['look-back', 'bogus', 3], skipped: ['calendar'], plannedAt: 'a', threadId: 't' },
      'week',
    )
    expect(p).toEqual({ current: 'inbox', done: ['look-back'], skipped: ['calendar'], plannedAt: 'a', threadId: 't' })
  })
})
