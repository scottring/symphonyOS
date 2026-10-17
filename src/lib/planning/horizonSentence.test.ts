import { describe, it, expect } from 'vitest'
import { horizonSentence } from './horizonSentence'

const items = (open: number, done: number, serving = 0) => [
  ...Array.from({ length: open }, (_, i) => ({ done: false, hasParent: i < serving })),
  ...Array.from({ length: done }, () => ({ done: true, hasParent: true })),
]

describe('horizonSentence', () => {
  it('says the counts and how many serve the list above (the mockup line)', () => {
    expect(horizonSentence({ items: items(11, 5, 4), parentWord: 'Fall' })).toBe('11 open, 5 done. Four serve a Fall goal.')
  })
  it('an empty list says nothing', () => {
    expect(horizonSentence({ items: [], parentWord: 'Fall' })).toBe('')
  })
  it('leaves out a zero count and the second sentence when nothing serves', () => {
    expect(horizonSentence({ items: items(3, 0), parentWord: 'Fall' })).toBe('3 open.')
    expect(horizonSentence({ items: items(0, 2), parentWord: 'Fall' })).toBe('2 done.')
  })
  it('a line moved on to a later period is not open here (the screenshot of 2026-10-17)', () => {
    expect(horizonSentence({ items: [{ done: false, moved: true, hasParent: true }], parentWord: 'Fall' })).toBe('1 moved on.')
    expect(horizonSentence({ items: [...items(2, 1, 2), { done: false, moved: true, hasParent: true }], parentWord: 'Fall' })).toBe('2 open, 1 done, 1 moved on. Both serve a Fall goal.')
  })
  it('counts only open items as serving; done ones are history', () => {
    expect(horizonSentence({ items: items(2, 3, 0), parentWord: 'Fall' })).toBe('2 open, 3 done.')
  })
  it('one, both, all, and past ten', () => {
    expect(horizonSentence({ items: items(4, 0, 1), parentWord: 'Fall' })).toBe('4 open. One serves a Fall goal.')
    expect(horizonSentence({ items: items(1, 0, 1), parentWord: 'Fall' })).toBe('1 open. It serves a Fall goal.')
    expect(horizonSentence({ items: items(2, 0, 2), parentWord: 'Fall' })).toBe('2 open. Both serve a Fall goal.')
    expect(horizonSentence({ items: items(5, 1, 5), parentWord: 'Fall' })).toBe('5 open, 1 done. All serve a Fall goal.')
    expect(horizonSentence({ items: items(14, 0, 12), parentWord: 'Fall' })).toBe('14 open. 12 serve a Fall goal.')
  })
  it('names the list above with its article, and a year has none above', () => {
    expect(horizonSentence({ items: items(3, 0, 2), parentWord: 'October' })).toBe('3 open. Two serve an October goal.')
    expect(horizonSentence({ items: items(3, 0, 2), parentWord: '2026' })).toBe('3 open. Two serve a 2026 goal.')
    expect(horizonSentence({ items: items(3, 0, 2), parentWord: null })).toBe('3 open.')
  })
})
