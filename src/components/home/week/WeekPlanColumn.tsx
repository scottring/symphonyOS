//
// This week's list, in /week's own column.
//
// It used to be two lists: this lane's pool and the Today pin's THIS WEEK
// group, built from different predicates and disagreeing about which rows
// were "this week" (Scott, 2026-09-19 — "it no longer makes sense to have the
// 'this week' list at all, it's redundant to the pinned list"). There is one
// definition now, `weekListEntries`, drawn here and in the pin.
//
// It is NOT a pin: pins are opt-in and live in sessionStorage, so a page that
// leaned on one would come up empty in every new tab. It folds away and the
// fold is remembered — but it folds to its own header, never to nothing, so
// the way back is always on screen.
//
// Pure on purpose: the rows come from the `tasks` the week view already has,
// never from its own fetch. A hook in here would drag Supabase into every
// WeekViewV2 test.
//
import { useCallback, useMemo, useState } from 'react'
import type { Task } from '@/types/task'
import { DayPlanWeekList } from '@/components/reference/DayPlanPanel'
import type { DayPlanPanelActions } from '@/components/reference/DayPlanPanel'
import { weekListEntries } from '@/lib/today/dayPlan'
import { doableBy } from '@/lib/planning/poolViews'
import { localYmd } from '@/lib/cadence/config'
import type { DayPlan } from '@/lib/today/dayPlan'

const OPEN_KEY = 'symphony-week-list-open'

function readOpen(): boolean {
  try { return localStorage.getItem(OPEN_KEY) !== 'false' } catch { return true }
}

export function WeekPlanColumn({ tasks, weekStart, meId, userId, actions, draggable = true }: {
  tasks: Task[]
  weekStart: Date
  /** The planning member. The list offers what this person could do, as the
   *  pin's does — a task assigned only to someone else is not my candidate. */
  meId: string | null
  /** The signed-in user: whose focus rows mean "planned today". */
  userId?: string | null
  actions: DayPlanPanelActions
  draggable?: boolean
}) {
  // The rows are the week's; the row verbs ("Today", set a time) act on the
  // real current day — choosing work for a day you are not living in is what
  // the day picker is for.
  // Keyed on today's DATE, so a tab left open past midnight moves on with
  // the calendar instead of judging "planned today" against yesterday.
  const todayKey = localYmd(new Date())
  const day = useMemo(() => {
    const [y, m, d] = todayKey.split('-').map(Number)
    return new Date(y, m - 1, d)
  }, [todayKey])

  const plan = useMemo(() => ({
    carried: [], scheduled: [], available: [], month: [],
    week: weekListEntries(
      tasks,
      (assignedTo: string | null | undefined, assignedToAll?: readonly string[] | null) => !meId || doableBy(
        { assignedTo: assignedTo ?? undefined, assignedToAll: assignedToAll ? [...assignedToAll] : undefined },
        meId,
      ),
      weekStart,
      localYmd(day),
      userId,
    ),
    counts: { scheduled: 0, available: 0 },
  } as unknown as DayPlan), [tasks, meId, userId, weekStart, day])

  const [open, setOpenState] = useState(readOpen)
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next)
    try { localStorage.setItem(OPEN_KEY, next ? 'true' : 'false') } catch { /* the fold still works in memory */ }
  }, [])

  return (
    <DayPlanWeekList
      plan={plan}
      day={day}
      actions={actions}
      weekStart={weekStart}
      draggable={draggable}
      open={open}
      onOpenChange={setOpen}
    />
  )
}
