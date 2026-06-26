import { describe, it, expect } from 'vitest'
import { relativeStart } from './relativeStart'
const at = (h: number, m = 0) => new Date(2026, 5, 24, h, m)
describe('relativeStart', () => {
  it('Now when within 5 min', () => { expect(relativeStart(at(9, 2), at(9, 0))).toBe('Now') })
  it('minutes when <=90 min away', () => { expect(relativeStart(at(9, 18), at(9, 0))).toBe('Starts in 18 min') })
  it('hours when >90 min away same day', () => { expect(relativeStart(at(13, 0), at(9, 0))).toBe('Starts in 4 hr') })
  it('empty when in the past', () => { expect(relativeStart(at(8, 0), at(9, 0))).toBe('') })
})
