// src/lib/week/weekStartParam.ts
//
// /week keeps the week it is showing in `?start=` (S2-25). The rule lives
// here rather than inline in HomeView so it is testable on its own and cannot
// drift from `weekRangeFromStartParam`, which reads the parameter back.

import { localYmd } from '@/lib/cadence/config'
import type { HomeViewType } from '@/types/homeView'

/**
 * The search string /week should carry after paging to `weekAnchor`, or
 * `null` when the URL should be left alone.
 *
 * Only the seven-day week round-trips. A weekend or a custom run cannot be
 * rebuilt from `start` alone (`?range=custom` carries no dates), so writing
 * `start` for one would reopen it as a full week — worse than not writing it.
 * Views other than /week do not read `start` on arrival, so writing it there
 * would be a parameter nothing honours.
 */
export function weekStartParam(
  view: HomeViewType | undefined,
  rangeDays: number,
  search: string,
  weekAnchor: Date,
): URLSearchParams | null {
  if (view !== 'week' || rangeDays !== 7) return null
  const next = new URLSearchParams(search)
  next.set('start', localYmd(weekAnchor))
  return next
}
