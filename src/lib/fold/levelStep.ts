// Stepping between horizons (Scott, 2026-11-07): going down a level slides
// this period's sheet into the next page's left fold ("Go to this week →",
// "Go to today →", the horizon tabs). The pages name their sheets
// (vt-sheet-year … vt-sheet-day, levelStep.css) and the browser's view
// transition moves each named sheet from where it was to where it lands. This
// says which way the step goes, so the sheets that leave and arrive slide the
// right way: down (to a smaller period) moves left, up moves right.

export const LEVEL_ORDER = ['today', 'week', 'month', 'season', 'year'] as const
export type LevelName = typeof LEVEL_ORDER[number]

export function markLevelStep(from: LevelName | undefined, to: LevelName): void {
  if (typeof document === 'undefined') return
  const a = from ? LEVEL_ORDER.indexOf(from) : -1
  const b = LEVEL_ORDER.indexOf(to)
  document.documentElement.dataset.levelStep = a === -1 || a === b ? 'same' : b < a ? 'down' : 'up'
}
