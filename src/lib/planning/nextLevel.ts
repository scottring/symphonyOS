// src/lib/planning/nextLevel.ts
//
// The way DOWN from a plan page (nested horizons, Scott and Iris, 2026-09-26).
//
// Year, season and month hold outcomes; the week and the day hold the next
// actions and the events. Once a month's work has its weeks, the month page
// used to fold it all under "Already assigned" and offer nothing next — the
// work had moved, and the page did not say where (onboarding-program-findings,
// "Month → Week"). This lists the periods one rung down with how much is on
// each, and where to open it:
//
//   Month  → its weeks    ("Sep 6 – 12 · 3 on the list · Open week")
//   Season → its months
//   Year   → its seasons
//
// Each count is read with the SAME selector the destination page draws its
// list with (weekListTasks for a week, selectPeriodTasks for a month or
// season), so the number you see here is the number you land on — never a
// scoreboard of its own.

import type { Task } from '@/types/task'
import type { Seasons } from '@/lib/cadence/seasons'
import { readCadenceConfig, localYmd } from '@/lib/cadence/config'
import { weeksOfMonth } from './monthWeeks'
import { weekListTasks } from './weekList'
import { periodBounds, isCurrentPeriod, selectPeriodTasks, type PlanLevel } from './periodPage'

export interface NextLevelChoice {
  level: 'week' | 'month' | 'season'
  start: Date
  /** "Sep 6 – 12", "October", "Winter". */
  label: string
  /** Open items on that period's own list. */
  open: number
  /** Where "Open" goes. */
  href: string
  /** The period containing today. */
  current: boolean
}

export function nextLevelChoices(
  level: PlanLevel,
  bounds: { start: Date; end: Date },
  tasks: readonly Task[],
  meId: string | null,
  seasons: Seasons,
  today: Date = new Date(),
): NextLevelChoice[] {
  if (level === 'month') {
    return weeksOfMonth(bounds.start, readCadenceConfig().weekStartsOn).map((w) => {
      const end = new Date(w.start.getFullYear(), w.start.getMonth(), w.start.getDate() + 7)
      const current = w.start <= today && today < end
      return {
        level: 'week' as const,
        start: w.start,
        label: w.label,
        open: weekListTasks(tasks, w.start, meId, { isCurrent: current }).filter((t) => !t.completed).length,
        href: `/week?start=${localYmd(w.start)}`,
        current,
      }
    })
  }
  const childLevel = level === 'season' ? 'month' : 'season'
  const out: NextLevelChoice[] = []
  for (let d = new Date(bounds.start); d < bounds.end;) {
    const b = periodBounds(childLevel, d, seasons)
    const current = isCurrentPeriod(b, today)
    out.push({
      level: childLevel,
      start: b.start,
      label: childLevel === 'month' ? b.start.toLocaleDateString('en-US', { month: 'long' }) : b.label.replace(/\s+\d{4}$/, ''),
      open: selectPeriodTasks(tasks, childLevel, b.start, current, meId, seasons).filter((t) => !t.completed).length,
      href: `/${childLevel}?start=${localYmd(b.start)}`,
      current,
    })
    d = b.end
  }
  return out
}
