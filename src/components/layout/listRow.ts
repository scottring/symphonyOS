// The library row (layout system, 2026-10-01) — Lists, Contacts, Documents,
// Discussions, Notes, Archive, Inbox and Routines rows share this grid with
// Today's: a margin lane (an icon, an avatar, a date or a time), the body
// (a 16px title with a 12px line under it), and anything trailing on the
// right. No rules between rows — the same hover tint Today's rows use marks
// the one under your hand. The box bleeds 12px past the column on both sides
// (-mx-3 px-3) so its CONTENT sits exactly on the column edge.
//
//   0      64 76
//   │ lane │gap│ title · meta under it                     trailing │
//
// Phones get a 40px lane; everything else is the same.

/** The row box + grid. Apply to the row's clickable root (a, button, div). */
export const LIST_ROW =
  'group grid grid-cols-[40px_minmax(0,1fr)_auto] md:grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-x-3 -mx-3 px-3 py-2.5 rounded-xl border border-transparent text-left transition-colors hover:bg-primary-50/50 hover:border-primary-100'

/** The lane cell: an icon or avatar at its left, or a small date/time. */
export const LIST_ROW_LANE = 'flex items-center min-w-0 text-[12px] leading-tight text-neutral-500 tabular-nums'

/** The body cell. */
export const LIST_ROW_BODY = 'min-w-0'

/** The title — one size everywhere a row is read. */
export const LIST_ROW_TITLE = 'block text-[16px] leading-snug text-neutral-900 truncate'

/** The one muted line under the title. */
export const LIST_ROW_META = 'block mt-0.5 text-[12px] leading-snug text-neutral-500 truncate'

/** The trailing cell: a count, a time, a chevron, quiet actions. */
export const LIST_ROW_TRAIL = 'flex shrink-0 items-center gap-2 text-[12px] text-neutral-500'
