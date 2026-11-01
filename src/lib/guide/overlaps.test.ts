import { describe, it, expect } from 'vitest'
import { findOverlaps, meaningfulWords } from './overlaps'

const g = (id: string, title: string) => ({ id, title })

describe('findOverlaps — goals that may say the same thing', () => {
  it('pairs two running goals', () => {
    expect(findOverlaps([g('a', 'Run a 10k'), g('b', 'Run a half marathon')])).toEqual([['a', 'b']])
  })
  it('leaves goals with nothing in common alone', () => {
    expect(findOverlaps([g('a', 'Max the 401k'), g('b', 'Redo the will')])).toEqual([])
  })
  it('pairs titles that share two meaningful words', () => {
    expect(findOverlaps([g('a', 'Spend weekends outdoors with the kids'), g('b', 'More outdoor weekends with kids')])).toEqual([['a', 'b']])
  })
  it('pairs one title that holds the other', () => {
    expect(findOverlaps([g('a', 'Read more'), g('b', 'Read more novels this year')])).toEqual([['a', 'b']])
  })
  it('does not pair long titles that share one word', () => {
    expect(findOverlaps([g('a', 'Plant a vegetable garden out back'), g('b', 'Plant trees along the front fence')])).toEqual([])
  })
  it('ignores case and punctuation; stop words never count', () => {
    expect(meaningfulWords('Run THE 10k, and a half!')).toEqual(['run', '10k', 'half'])
    expect(findOverlaps([g('a', 'Get to the beach'), g('b', 'Get the car to the shop')])).toEqual([])
  })
  it('lists every pair once, in list order', () => {
    expect(findOverlaps([g('a', 'Run a 10k'), g('x', 'Redo the will'), g('b', 'Run a half marathon'), g('c', 'Run every week')]))
      .toEqual([['a', 'b'], ['a', 'c'], ['b', 'c']])
  })
})
