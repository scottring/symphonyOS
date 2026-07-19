import { describe, it, expect } from 'vitest'
import { cellIndex, cellFromIndex, adjacentCell, CELLS_PER_WEEK } from './mealGridOrder'

describe('mealGridOrder', () => {
  it('indexes day-major, slot-minor', () => {
    expect(cellIndex(0, 'breakfast')).toBe(0)
    expect(cellIndex(0, 'lunch')).toBe(1)
    expect(cellIndex(0, 'dinner')).toBe(2)
    expect(cellIndex(1, 'breakfast')).toBe(3)
    expect(cellIndex(6, 'dinner')).toBe(CELLS_PER_WEEK - 1) // 20
  })

  it('round-trips index <-> cell', () => {
    for (let i = 0; i < CELLS_PER_WEEK; i++) {
      const cell = cellFromIndex(i)
      expect(cellIndex(cell.dayOfWeek, cell.slot)).toBe(i)
    }
  })

  it('moves down to the next cell, crossing day boundaries', () => {
    expect(adjacentCell(3, 'dinner', 'down')).toEqual({ dayOfWeek: 4, slot: 'breakfast' })
    expect(adjacentCell(2, 'breakfast', 'down')).toEqual({ dayOfWeek: 2, slot: 'lunch' })
  })

  it('moves up to the previous cell, crossing day boundaries', () => {
    expect(adjacentCell(4, 'breakfast', 'up')).toEqual({ dayOfWeek: 3, slot: 'dinner' })
    expect(adjacentCell(2, 'lunch', 'up')).toEqual({ dayOfWeek: 2, slot: 'breakfast' })
  })

  it('returns null at the ends of the week', () => {
    expect(adjacentCell(0, 'breakfast', 'up')).toBeNull()
    expect(adjacentCell(6, 'dinner', 'down')).toBeNull()
  })
})
