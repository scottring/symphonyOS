// Cross-week auto-advance: which edge of the grid is the dragged pointer
// hovering, if any?
//
// The rule the naive "x < left + EDGE" test got wrong: with THIS WEEK'S LIST
// standing in a column to the LEFT of the grid, every pill drag *starts* left
// of the grid box. That armed the left-edge timer the instant the drag began,
// and a human drag takes longer than the 500ms dwell — so the week flipped
// backwards mid-drag and the drop landed on last week (usually a past day,
// which the drop guard then refuses). The list's pills looked undraggable.
//
// Auto-advance means "carry this off the edge of the grid", which presupposes
// being ON the grid: an edge only arms once the pointer has been in the grid's
// interior during this drag. A drag that begins beside the grid is on its way
// IN, not off an edge.

/** Width of the hot band at each side of the grid. */
export const EDGE_PX = 40

export type Edge = 'left' | 'right' | null

export interface EdgeBox {
  left: number
  right: number
}

/**
 * @param x        pointer x, viewport coordinates
 * @param box      the grid's bounding box (day columns only — not the list)
 * @param entered  has the pointer been inside the grid interior this drag?
 */
export function edgeForPointer(
  x: number,
  box: EdgeBox,
  entered: boolean,
): { edge: Edge; entered: boolean } {
  const inInterior = x > box.left + EDGE_PX && x < box.right - EDGE_PX
  if (inInterior) return { edge: null, entered: true }
  if (!entered) return { edge: null, entered: false }
  if (x > box.right - EDGE_PX) return { edge: 'right', entered: true }
  return { edge: 'left', entered: true }
}
