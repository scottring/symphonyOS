import { describe, it, expect } from 'vitest'
import { findClashes } from './clashes'

const at = (h: number, m = 0, day = 2) => new Date(2026, 10, day, h, m)
const ev = (id: string, start: Date, end: Date, place?: string) => ({ id, title: id, start, end, ...(place !== undefined ? { place } : {}) })

describe('findClashes', () => {
  it('two events whose times cross overlap', () => {
    expect(findClashes([ev('a', at(9), at(10)), ev('b', at(9, 30), at(10, 30))]))
      .toEqual([{ kind: 'overlap', a: 'a', b: 'b', day: '2026-11-02' }])
  })

  it('less than 15 minutes between two places is tight', () => {
    expect(findClashes([ev('b', at(10, 10), at(11), 'School'), ev('a', at(9), at(10), 'Home')]))
      .toEqual([{ kind: 'tight', a: 'a', b: 'b', day: '2026-11-02' }])
  })

  it('the same place, or no place, is never tight', () => {
    expect(findClashes([ev('a', at(9), at(10), 'Home'), ev('b', at(10, 5), at(11), 'Home')])).toEqual([])
    expect(findClashes([ev('a', at(9), at(10), 'Home'), ev('b', at(10, 5), at(11))])).toEqual([])
    expect(findClashes([ev('a', at(9), at(10), ' home '), ev('b', at(10, 5), at(11), 'Home')])).toEqual([])
  })

  it('one ending as the next starts does not overlap; 15 minutes apart is not tight', () => {
    expect(findClashes([ev('a', at(9), at(10)), ev('b', at(10), at(11))])).toEqual([])
    expect(findClashes([ev('a', at(9), at(10), 'Home'), ev('b', at(10, 15), at(11), 'School')])).toEqual([])
  })

  it('days apart are nothing', () => {
    expect(findClashes([ev('a', at(9, 0, 2), at(10, 0, 2), 'Home'), ev('b', at(9, 30, 3), at(10, 0, 3), 'School')])).toEqual([])
  })
})
