import { describe, it, expect } from 'vitest'
import { parseSpecials } from './specials'

describe('parseSpecials', () => {
  it('reads each kid’s special', () => {
    expect(parseSpecials('Specials — Ella: Library · Kaleb: Art')).toEqual([{ who: 'Ella', special: 'Library' }, { who: 'Kaleb', special: 'Art' }])
  })
  it('leaves any other all-day title alone', () => {
    expect(parseSpecials('No school')).toBeNull()
    expect(parseSpecials('Specials — rotation changes')).toBeNull()
  })
})
