// A day on the Week page shows a few things (Friday session, Stage 1: the page
// must never look endless). Anything with a time is fixed in the day and is
// never folded away; the untimed things fill what room is left, with at least
// a couple always showing. The rest wait behind "+N more".

/** About this many things a day before the rest fold. */
export const DAY_CAP = 4
/** Untimed things shown however full the calendar is. */
export const MIN_TASKS_SHOWN = 2

/** `timed`: never hidden. The day's order is kept. */
export function foldDay<T extends { timed: boolean }>(items: T[], cap = DAY_CAP, minTasks = MIN_TASKS_SHOWN): { shown: T[]; hidden: number } {
  const timedCount = items.filter((it) => it.timed).length
  let room = Math.max(minTasks, cap - timedCount)
  const shown: T[] = []
  for (const it of items) {
    if (it.timed) shown.push(it)
    else if (room > 0) { shown.push(it); room-- }
  }
  return { shown, hidden: items.length - shown.length }
}
