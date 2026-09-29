// src/components/plan/v2/RefShelves.tsx
//
// What the Shelves drawer held, folded into the reference column (Scott,
// 2026-09-28: "fold shelves into the reference column"). The level above was
// already the column itself; what is left is quiet, folded sections that show
// only when they have something in them:
//
//   Week   — "Earlier, not done" (unfinished work not on this week) and
//            "Routines to place" (an occurrence on one day of this week).
//   Month / Season — the recurring commitments that already spend its time.
//
// Same data and writers the drawer used (useDayPlan, usePlanActions,
// panelActionsFor, WeekRoutineChoices, routinePatterns); nothing new stored.

import { useMemo } from 'react'
import { Repeat } from 'lucide-react'
import { useDayPlan } from '@/hooks/useDayPlan'
import { usePlanActions } from '@/hooks/usePlanActions'
import { useRoutines } from '@/hooks/useRoutines'
import { useDomain } from '@/hooks/useDomain'
import { panelActionsFor } from '@/components/reference/DayPlanPanel'
import { committedTo } from '@/lib/placement/model'
import { untimedRoutines } from '@/lib/planning/routinePatterns'
import { useSelectionOptional } from '@/shell/providers/SelectionProvider'
import { useNavigate } from 'react-router-dom'
import type { Task } from '@/types/task'

export function WeekRefShelves({ weekStart, isCurrent, onOpen, onTakeIn }: {
  weekStart: Date
  isCurrent: boolean
  onOpen: (kind: 'task' | 'routine', id: string) => void
  /** "+ This week": onto the week's list, any day — its old day comes off
   *  (the drawer's commit kept a passed date, so the task sat on that
   *  past day instead of the list). */
  onTakeIn: (task: Task) => void
}) {
  const today = useMemo(() => new Date(), [])
  const { plan } = useDayPlan(today, weekStart)
  const weekEnd = useMemo(() => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7), [weekStart])
  const planActions = usePlanActions(undefined, weekStart)
  const actions = useMemo(() => panelActionsFor(today, planActions, { open: onOpen }), [today, planActions, onOpen])
  if (!plan) return null
  const earlier = (plan.unfinished ?? []).filter((e) => !e.completed && !(e.task && committedTo(e.task, 'week', weekStart, { isCurrent })))
  return (
    <div className="pv2-refshelves">
      {(earlier.length > 0 || !!plan.olderUnfinished) && (
        <details className="pv2-refshelf" open>
          <summary>Earlier, not done</summary>
          {earlier.length > 0 ? (
            <ul className="pv2-list">{earlier.map((e) => (
              <li key={e.key} className="pv2-rrow pv2-rrow-sans">
                <span className="pv2-dash" style={{ marginTop: 10 }} aria-hidden="true" />
                <button type="button" className="flex-1 text-left" onClick={() => actions.open?.(e)}>{e.title}</button>
                <span className="pv2-refacts">
                  <button type="button" className="pv2-addbtn" onClick={() => (e.task ? onTakeIn(e.task) : actions.commit(e, 'week'))} aria-label={`Add ${e.title} to this week`}>+ This week</button>
                  {actions.someday && <button type="button" className="pv2-addbtn is-quiet" onClick={() => actions.someday!(e)} aria-label={`Move ${e.title} to Someday`}>Someday</button>}
                </span>
              </li>
            ))}</ul>
          ) : <p className="pv2-hint">Nothing waiting from the last few days.</p>}
          {!!plan.olderUnfinished && <a className="pv2-link pv2-quiet" href="/inbox#expired">Older unfinished work is in the Inbox →</a>}
        </details>
      )}
      <UntimedRoutines level="week" start={weekStart} end={weekEnd} noun="week" />
    </div>
  )
}

/** A month's or season's routines with no set time. */
export function PeriodRefRoutines({ level, start, end, noun }: {
  level: 'month' | 'season'
  start: Date
  end: Date
  noun: string
}) {
  return <UntimedRoutines level={level} start={start} end={end} noun={noun} />
}

/**
 * "Routines with no set time" (Scott, 2026-09-28): a routine is listed on its
 * own horizon's reference column only when it has no hour — a Sunday "kids
 * tidy their rooms" is something to plan around; a 7:30 routine is already on
 * the clock. The rule is untimedRoutines().
 */
function UntimedRoutines({ level, start, end, noun }: { level: 'week' | 'month' | 'season'; start: Date; end: Date; noun: string }) {
  const { activeRoutines } = useRoutines()
  const { layers } = useDomain()
  const selection = useSelectionOptional()
  const navigate = useNavigate()
  const rows = useMemo(() => untimedRoutines(activeRoutines, layers, { level, start, end }), [activeRoutines, layers, level, start, end])
  if (!rows.length) return null
  return (
    <details className="pv2-refshelf" open>
      <summary>Routines with no set time</summary>
      <ul className="pv2-list" aria-label={`Routines this ${noun} with no set time`}>{rows.map((p) => (
        <li key={p.id} className="pv2-rrow pv2-rrow-sans">
          <Repeat className="mt-1 h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden="true" />
          <button type="button" className="flex-1 text-left" onClick={() => (selection ? selection.setSelection({ kind: 'routine', id: p.id }) : navigate('/routines'))}>
            {p.name} <span className="pv2-hint">· {p.cadence}</span>
          </button>
        </li>
      ))}</ul>
    </details>
  )
}
