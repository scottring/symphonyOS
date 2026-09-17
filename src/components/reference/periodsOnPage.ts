// Which period lists a page ALREADY shows, so a pinned copy never competes
// with them (parity pass 2026-09-17).
//
// The reference dock and the pages grew independently: /week has folded the
// month list beneath its own week list since the planning-lists work, and
// /month IS the month list. Pin those same periods beside the work and the
// same list appears twice on one screen — and the two copies don't even
// agree, because a pinned panel draws the horizon POOL (what is still open)
// while the page draws the period's whole record, completed and placed rows
// included.
//
// So the page wins: it holds the fuller record. The pin is kept — it comes
// back the moment you navigate somewhere that isn't showing that period —
// and the Reference control says "on this page" rather than going quiet.
import type { ReferenceKind } from './ReferenceListsContext'

/** The period lists this route already has on screen. */
export function periodsShownOnPage(pathname: string): ReferenceKind[] {
  // /week draws the week itself and folds This month beneath it
  // (WeekMonthRail), so both lists are already here.
  if (pathname.startsWith('/week') || pathname.startsWith('/workweek')) return ['week', 'month']
  // /month is the month's own list. Its fold shows the SEASON, not the week.
  if (pathname.startsWith('/month')) return ['month']
  // /season and /year fold the level above them; neither is a week or month.
  return []
}

/** Is a pinned list redundant on this route? */
export function pinIsOnPage(pathname: string, kind: ReferenceKind): boolean {
  return periodsShownOnPage(pathname).includes(kind)
}
