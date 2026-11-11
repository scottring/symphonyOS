// Scott, 2026-11-04: paper-style horizons. Chooses the fold layout (horizontal,
// vertical on phones, or Duo split) and sizes the two sheets.

export type FoldMode = 'h' | 'v' | 'duo'

export function detectFoldMode(i: {
  width: number
  height: number
  coarse: boolean
  segments: boolean
}): FoldMode {
  const ratio = i.height / i.width
  if (i.segments) return 'duo'
  // The Duo's inside screens, open as a book. An iPad in portrait (744–834
  // wide) is not a Duo: it folds like a desk page ('h'), or below 760 like a
  // phone ('v').
  if (i.coarse && i.width >= 560 && i.width <= 720 && ratio >= 1.2 && ratio <= 1.65) return 'duo'
  return i.width < 760 ? 'v' : 'h'
}

/** The narrowest each sheet may be when both companions lie open in 'h':
 *  the sheet above, this sheet, and the calendar. */
const MIN_COMPANION = 220
const MIN_CURRENT = 420

/** Can the sheet above and the calendar both lie open beside this sheet?
 *  Only in 'h', when the spread holds all three at their minimum widths
 *  (220 + 420 + 220). Otherwise opening one folds the other. */
export function spreadFits(mode: FoldMode, spreadWidth: number): { both: boolean } {
  return { both: mode === 'h' && spreadWidth >= MIN_COMPANION + MIN_CURRENT + MIN_COMPANION }
}

export interface FoldSizes {
  /** The sheet above's width (its height cap in 'v' is maxAboveHeight). */
  above: number
  /** The calendar's width (same as the sheet above's). */
  calendar: number
  /** This sheet's width. */
  current: number
  edge: number
  maxAboveHeight: number
  /** Both companions may lie open at once. */
  both: boolean
}

/** The sheet above, widened while it holds a look back (Scott, 2026-11-05:
 *  each row's four calls on one line). */
function wideAbove(spreadWidth: number): number {
  return Math.round(Math.min(440, Math.max(300, 0.36 * spreadWidth)))
}

export function foldSizes(
  mode: FoldMode,
  spreadWidth: number,
  viewportHeight: number,
  opts: { calendar?: boolean; wide?: boolean } = {},
): FoldSizes {
  if (mode === 'v') {
    return {
      above: spreadWidth,
      calendar: spreadWidth,
      current: spreadWidth,
      edge: 46,
      maxAboveHeight: Math.round(0.62 * viewportHeight),
      both: false,
    }
  }
  if (mode === 'duo') {
    // Two pages: this sheet and whichever companion is open. The other one
    // keeps its folded edge.
    const above = Math.round(0.38 * spreadWidth)
    const current = spreadWidth - above - (opts.calendar ? 22 : 0)
    return { above, calendar: above, current, edge: 22, maxAboveHeight: viewportHeight, both: false }
  }
  if (!opts.calendar) {
    const above = opts.wide ? wideAbove(spreadWidth) : Math.round(Math.min(340, Math.max(220, 0.36 * spreadWidth)))
    return {
      above,
      calendar: above,
      current: Math.min(560, spreadWidth - above),
      edge: 34,
      maxAboveHeight: viewportHeight,
      both: false,
    }
  }
  // A look back: the sheet above wide, and the calendar folded at its edge
  // (opening it folds the look back: no room for three).
  if (opts.wide) {
    const above = wideAbove(spreadWidth)
    const calendar = Math.round(Math.min(320, Math.max(MIN_COMPANION, 0.26 * spreadWidth)))
    return { above, calendar, current: Math.min(560, spreadWidth - above - 34), edge: 34, maxAboveHeight: viewportHeight, both: false }
  }
  // Three pages (the prototype's layout()): each companion about a quarter
  // of the spread (220–320). With room for all three, this sheet keeps at
  // least 420; otherwise one companion is open and the other folded at its edge.
  // Week as an open journal (2026-11-11): the three pages fill a wide
  // window — the companions up to 340, this sheet up to 760 (it holds the
  // masthead now) — rather than leaving wide margins of sky.
  const { both } = spreadFits(mode, spreadWidth)
  let comp = Math.round(Math.min(340, Math.max(MIN_COMPANION, 0.24 * spreadWidth)))
  if (both) comp = Math.max(MIN_COMPANION, Math.min(comp, Math.floor((spreadWidth - MIN_CURRENT) / 2)))
  const current = Math.min(760, both ? spreadWidth - 2 * comp : spreadWidth - comp - 34)
  return { above: comp, calendar: comp, current, edge: 34, maxAboveHeight: viewportHeight, both }
}
