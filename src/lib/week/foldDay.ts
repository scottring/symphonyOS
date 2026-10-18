// A day on the Week page shows a few things (Friday session; calm pass 2,
// 2026-10-18: the page must never look endless). The day's calendar events
// always show; beside them, at most two other things, timed or not, routines
// included. The rest wait behind "+N more".

/** Things shown in a day beside its calendar events. */
export const TASKS_SHOWN = 2

/** `event`: a calendar event, never hidden. `pinned`: a row that must stay in
 *  sight (one Symphony proposes or points at); it shows and takes one of the
 *  `cap` places. The day's order is kept. */
export function foldDay<T extends { event: boolean; pinned?: boolean }>(items: T[], cap = TASKS_SHOWN): { shown: T[]; hidden: number } {
  const pinned = items.filter((it) => !it.event && it.pinned).length
  let room = Math.max(0, cap - pinned)
  const shown: T[] = []
  for (const it of items) {
    if (it.event || it.pinned) shown.push(it)
    else if (room > 0) { shown.push(it); room-- }
  }
  return { shown, hidden: items.length - shown.length }
}
