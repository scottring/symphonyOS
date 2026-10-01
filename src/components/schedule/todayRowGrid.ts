// Today's row grid, in ONE place (layout system, 2026-10-01).
//
// Three row types share it — ScheduleItem, RoutineCollectionRow and the
// dinner row — and each used to copy the class lists by hand, which is how
// the routine-with-steps rows ended up with their people 90px left of every
// other row's. Change the grid here and every Today row moves together.
//
// Desktop (md+), measured from the page column's left edge:
//
//   0      64   76   96  108                          … who │ ctx │ verb │ ⋯
//   │ lane │ gap│mark│gap│ title / 12px meta line under it
//
// The lane is the column's margin: the time in Schedule, nothing in For
// today, and the date numeral above in the masthead — so check circles and
// titles line up down the whole page. The row's hover box bleeds 13px past
// the column on both sides (-mx = px-3 + the 1px border) so the CONTENT sits
// exactly on the column, and the bulk-select box hangs in the page gutter.
//
// Phones keep their own grid (the 20px bulk gutter, card rows) — the native
// app anchors phone design.

/** The row's hover/selected box. */
export const ROW_SHELL = 'rounded-xl border px-3 py-2 md:py-1 md:-mx-[13px]'

/** The row's grid line: lane · mark · title · rail. */
export const ROW_GRID = 'relative flex items-center gap-3 pl-5 md:pl-0'

/** The margin lane (time). */
export const LANE = 'w-16 shrink-0'

/** The completion mark's column. */
export const MARK = 'w-5 shrink-0'

/** Lines under the row that align with the TITLE (lane + gap + mark + gap). */
export const UNDER_TITLE = 'ml-[5.75rem] md:ml-[6.75rem]'

/** Where the bulk-select box sits: the row's left edge on a phone, hanging
 *  in the page gutter on desktop. */
export const BULK_BOX_X = 'left-1.5 md:-left-5'

/** The timeline spine runs through the centre of the mark column. */
export const SPINE_X = 'left-[106px] md:left-[86px]'

/** The trailing rail: who · context · verb · ⋯, every cell a reserved width
 *  on every row type (see RowActionRail for why). */
export const RAIL = 'shrink-0 flex items-center gap-1'
/** An icon cell — 28px. */
export const RAIL_SLOT = 'w-7 h-7 flex items-center justify-center'
/** The people cell: up to three 24px initials and a "+N" at -4px overlap. */
export const RAIL_WHO = 'w-[5.25rem] h-7 flex items-center justify-end'
