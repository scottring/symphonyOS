import { describe, it, expect } from 'vitest'
import { gapAt, gapToListIndex } from './dayReorder'

// Task 13: a drop inside its own day lands in the gap between two task rows,
// read from where the pointer let go.
describe('gapAt', () => {
  const rows = [{ top: 0, bottom: 40 }, { top: 40, bottom: 80 }, { top: 80, bottom: 120 }]
  it('above a row’s middle is the gap above it', () => {
    expect(gapAt(-5, rows)).toBe(0)
    expect(gapAt(19, rows)).toBe(0)
    expect(gapAt(45, rows)).toBe(1)
    expect(gapAt(99, rows)).toBe(2)
  })
  it('below the last row’s middle is the gap after it', () => {
    expect(gapAt(101, rows)).toBe(3)
    expect(gapAt(500, rows)).toBe(3)
  })
  it('no rows: the only gap', () => expect(gapAt(10, [])).toBe(0))
})

describe('gapToListIndex', () => {
  const all = ['a', 'b', 'c', 'd']
  it('a gap among the shown rows is that row’s place in the whole day', () => {
    expect(gapToListIndex(0, ['a', 'b'], all)).toBe(0)
    expect(gapToListIndex(1, ['a', 'b'], all)).toBe(1)
  })
  it('the gap after the last shown row is just after it, not the end of the day', () => {
    expect(gapToListIndex(2, ['a', 'b'], all)).toBe(2)
  })
  it('follows the shown rows when they are not the first ones (a row Symphony points at)', () => {
    expect(gapToListIndex(1, ['a', 'd'], all)).toBe(3)
    expect(gapToListIndex(2, ['a', 'd'], all)).toBe(4)
  })
  it('nothing shown: the top', () => expect(gapToListIndex(0, [], all)).toBe(0))
})
