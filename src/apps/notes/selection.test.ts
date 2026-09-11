import { describe, it, expect } from 'vitest'
import { pickNotes } from './selection'

const ORDER = ['a', 'b', 'c', 'd']
const none = new Set<string>()

describe('pickNotes', () => {
  it('toggles one note on a plain click', () => {
    const one = pickNotes(none, ORDER, 'b', { extend: false, lastPicked: null })
    expect([...one]).toEqual(['b'])
    expect([...pickNotes(one, ORDER, 'b', { extend: false, lastPicked: 'b' })]).toEqual([])
  })

  it('takes the run from the last pick to this one', () => {
    const picked = pickNotes(new Set(['a']), ORDER, 'c', { extend: true, lastPicked: 'a' })
    expect([...picked].sort()).toEqual(['a', 'b', 'c'])
  })

  it('reads a run backwards too', () => {
    const picked = pickNotes(new Set(['d']), ORDER, 'b', { extend: true, lastPicked: 'd' })
    expect([...picked].sort()).toEqual(['b', 'c', 'd'])
  })

  it('adds a run without clearing an earlier one', () => {
    const first = pickNotes(none, ORDER, 'a', { extend: false, lastPicked: null })
    const run = pickNotes(first, ORDER, 'b', { extend: true, lastPicked: 'a' })
    const far = pickNotes(run, ORDER, 'd', { extend: false, lastPicked: 'b' })
    expect([...far].sort()).toEqual(['a', 'b', 'd'])
  })

  it('falls back to a plain toggle when there is nothing to extend from', () => {
    expect([...pickNotes(none, ORDER, 'c', { extend: true, lastPicked: null })]).toEqual(['c'])
    expect([...pickNotes(none, ORDER, 'c', { extend: true, lastPicked: 'gone' })]).toEqual(['c'])
  })
})
