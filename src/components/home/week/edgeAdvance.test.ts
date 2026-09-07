import { describe, it, expect } from 'vitest'
import { edgeForPointer, EDGE_PX } from './edgeAdvance'

// The grid box as /week lays it out: the list column occupies 0–556, the day
// columns start at 556.
const BOX = { left: 556, right: 1704 }

describe('edgeForPointer', () => {
  it('does not arm an edge while a drag that began in the list column is still on its way in', () => {
    // A pill's own rect sits at x≈300 — left of the grid, but this drag has
    // never touched the grid, so nothing should advance the week.
    let state = edgeForPointer(309, BOX, false)
    expect(state).toEqual({ edge: null, entered: false })

    // Crossing the left band on the way to a day column: still not an edge.
    state = edgeForPointer(BOX.left + 5, BOX, state.entered)
    expect(state.edge).toBeNull()

    // Landing on Wednesday: interior, so the drag has now entered.
    state = edgeForPointer(1100, BOX, state.entered)
    expect(state).toEqual({ edge: null, entered: true })
  })

  it('arms the left edge once the drag has been on the grid', () => {
    const entered = edgeForPointer(1100, BOX, false).entered
    expect(edgeForPointer(BOX.left + 5, BOX, entered)).toEqual({ edge: 'left', entered: true })
    // Carried past the grid entirely, back over the list.
    expect(edgeForPointer(300, BOX, entered).edge).toBe('left')
  })

  it('arms the right edge once the drag has been on the grid', () => {
    const entered = edgeForPointer(1100, BOX, false).entered
    expect(edgeForPointer(BOX.right - 5, BOX, entered)).toEqual({ edge: 'right', entered: true })
    expect(edgeForPointer(BOX.right + 200, BOX, entered).edge).toBe('right')
  })

  it('clears the edge when the pointer returns to the interior', () => {
    const entered = true
    expect(edgeForPointer(BOX.left + EDGE_PX + 1, BOX, entered)).toEqual({ edge: null, entered: true })
  })
})
