// Where a floating menu goes, from its MEASURED size (2026-10-08: the month-
// line menu guessed its width, so long lines were cut and could leave the
// screen). Left-aligned with its button when it fits, slid in to keep an 8px
// edge when it doesn't; below the button unless above has more room; never
// taller than the room it is given — it scrolls up and down, never sideways.

export interface Rect { top: number; bottom: number; left: number; right: number }

export interface MenuPlace { top: number; left: number; maxHeight: number }

export const MENU_EDGE = 8
const GAP = 4
const MIN_HEIGHT = 120

export function placeMenu(anchor: Rect, menu: { width: number; height: number }, viewport: { width: number; height: number }, align: 'start' | 'end' = 'start'): MenuPlace {
  const width = Math.min(menu.width, viewport.width - 2 * MENU_EDGE)
  const want = align === 'start' ? anchor.left : anchor.right - width
  const left = Math.max(MENU_EDGE, Math.min(want, viewport.width - width - MENU_EDGE))
  const below = viewport.height - anchor.bottom - GAP - MENU_EDGE
  const above = anchor.top - GAP - MENU_EDGE
  const down = menu.height <= below || below >= above
  const maxHeight = Math.max(MIN_HEIGHT, down ? below : above)
  const height = Math.min(menu.height, maxHeight)
  return { top: down ? anchor.bottom + GAP : Math.max(MENU_EDGE, anchor.top - GAP - height), left, maxHeight }
}
