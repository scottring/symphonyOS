import { describe, expect, it } from 'vitest'
import { BROWSER_PAUSE_MS, spokenText } from './useTellSymphony'

describe('browser listening on the wall', () => {
  it('waits through a thinking pause', () => {
    expect(BROWSER_PAUSE_MS).toBeGreaterThanOrEqual(3000)
  })
  it('one phrase: the alternative the wall understands', () => {
    expect(spokenText([['ad milk', 'add milk to groceries']])).toBe('add milk to groceries')
  })
  it('several phrases (a pause between them) are one turn, in order', () => {
    expect(spokenText([['Add milk'], [' and eggs']])).toBe('Add milk and eggs')
  })
  it('nothing heard is nothing sent', () => {
    expect(spokenText([])).toBe('')
  })
})
