import { describe, expect, it } from 'vitest'
import { parseTurnOutcome } from './turnOutcome'

describe('parseTurnOutcome', () => {
  it('reads a well-formed verdict', () => {
    expect(parseTurnOutcome({ state: 'saved', writes: [{ name: 'symphony_create_task', ok: true, ids: ['a'] }], say: 'Saved.' }))
      .toEqual({ state: 'saved', writes: [{ name: 'symphony_create_task', ok: true, ids: ['a'] }], say: 'Saved.' })
  })
  it('keeps the proposal and suggestion counts', () => {
    const o = parseTurnOutcome({ state: 'proposed', writes: [], proposal: { key: 'k', title: '2 changes', ops: 2 }, suggestions: 1, say: 's' })
    expect(o?.proposal).toEqual({ key: 'k', title: '2 changes', ops: 2 })
    expect(o?.suggestions).toBe(1)
  })
  it('refuses an unknown state or a non-object, and drops malformed writes', () => {
    expect(parseTurnOutcome({ state: 'done', writes: [] })).toBeUndefined()
    expect(parseTurnOutcome('saved')).toBeUndefined()
    expect(parseTurnOutcome(undefined)).toBeUndefined()
    expect(parseTurnOutcome({ state: 'saved', writes: [{ name: 1 }, { name: 'x', ok: true, ids: ['a', 2] }] })?.writes).toEqual([{ name: 'x', ok: true, ids: ['a'] }])
  })
})
