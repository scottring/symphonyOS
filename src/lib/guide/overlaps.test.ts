import { describe, it, expect } from 'vitest'
import { findOverlaps, meaningfulWords } from './overlaps'

const g = (id: string, title: string) => ({ id, title })
const pairs = (a: string, b: string) => findOverlaps([g('a', a), g('b', b)])

describe('findOverlaps — goals that may say the same thing (precision over recall)', () => {
  it.each([
    ['Run a 10k', 'Run a half marathon'],
    ['Max the 401k', 'Redo the will'],
    ['Learn Spanish', 'Learn piano'],
    ['Pay off the mortgage', 'Pay for college'],
    ['New job', 'New roof'],
    ['Finish the basement', 'Finish the book'],
    ['Save $10k', 'Run a 10k'],
    ['Plant a vegetable garden out back', 'Plant trees along the front fence'],
    ['Get to the beach', 'Get the car to the shop'],
  ])('does not pair “%s” and “%s”', (a, b) => {
    expect(pairs(a, b)).toEqual([])
  })

  it.each([
    ['Get fit', 'Get fit this year'],
    ['Family trip to Maine', 'Maine family trip'],
    ['Spend weekends outdoors with the kids', 'More weekends with the kids'],
    ['Read more', 'Read more novels'],
  ])('pairs “%s” and “%s”', (a, b) => {
    expect(pairs(a, b)).toEqual([['a', 'b']])
  })

  it.each([
    ['Run a 10k', 'run a 10K'],
    ['Max the 401k', 'Max the 401k'],
    ['Read 12 books', 'Read  12 books.'],
    ['Save $10k', 'Save $10k'],
  ])('pairs the same title twice, numbers and all: “%s” / “%s”', (a, b) => {
    expect(pairs(a, b)).toEqual([['a', 'b']])
  })

  it('a number never counts as a shared word, nor makes one title hold the other', () => {
    expect(pairs('Run a 10k', 'Run a 10k in May')).toEqual([])
  })

  it('lowercases, drops punctuation and stop words', () => {
    expect(meaningfulWords('Run THE 10k, and a half!')).toEqual(['run', '10k', 'half'])
    expect(meaningfulWords('A new roof')).toEqual(['roof'])
  })

  it('lists every pair once, in list order', () => {
    expect(findOverlaps([g('a', 'Family trip to Maine'), g('x', 'Redo the will'), g('b', 'Maine family trip'), g('c', 'Family trip')]))
      .toEqual([['a', 'b'], ['a', 'c'], ['b', 'c']])
  })
})
