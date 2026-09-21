// src/components/home/week/WeekPlanHost.tsx
//
// "Plan this week" (spec: guided planning, Phase 2). The same session machine
// the month page runs, wrapped around the week page: look back at last week,
// plan this one with the month beside you, save once. While the session is
// open it stands IN PLACE OF the days — planning the week is not a thing you
// do in the margin of the week.

import { useCallback, useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useGatedTaskActions } from '@/hooks/useGatedTaskActions'
import { useDomain } from '@/hooks/useDomain'
import { useHouseholdSeasons } from '@/hooks/useHouseholdSeasons'
import { weekToken } from '@/hooks/usePlanningSession'
import { usePlanSessionHost } from '@/hooks/usePlanSessionHost'
import { lookBackRows, isEmptyDraft } from '@/lib/planning/session'
import { weekListTasks } from '@/lib/planning/weekList'
import { periodBounds, isCurrentPeriod, selectPeriodTasks } from '@/lib/planning/periodPage'
import { monthStartOf } from '@/lib/planning/periodPlacement'
import { localYmd } from '@/lib/cadence/config'
import { formatWeekRangeShort } from '@/lib/dateHelpers'
import { PlanSession } from '@/components/plan/PlanSession'
import type { DomainId } from '@/lib/domains'
import type { Task } from '@/types/task'

const DAY = 86_400_000

export function WeekPlanHost({ tasks, weekStart, meId, isPast, children }: {
  /** Layer-filtered tasks, as the page receives them. */
  tasks: Task[]
  weekStart: Date
  meId: string | null
  isPast: boolean
  /** The page's normal content (list + journal), shown when the session is closed. */
  children: (host: { openSession: () => void }) => ReactNode
}) {
  const navigate = useNavigate()
  const { loading, addTask, updateTask, updateTasksBulk, pushTask, keepForward, dropCommitment, completeTask } = useSupabaseTasks()
  const gated = useGatedTaskActions({ updateTask, pushTask, updateTasksBulk }, (id) => tasks.find((t) => t.id === id))
  const { soleDomain } = useDomain()
  const { seasons, loading: seasonsLoading } = useHouseholdSeasons()

  const token = weekToken(weekStart)
  const prevStart = useMemo(() => new Date(weekStart.getTime() - 7 * DAY), [weekStart])
  // The month this week mostly lives in — its midpoint, so a week that straddles
  // a month boundary references the month it spends most of itself in.
  const monthStart = useMemo(() => monthStartOf(new Date(weekStart.getTime() + 3 * DAY)), [weekStart])
  const today = useMemo(() => new Date(), [])

  const back = useMemo(() => lookBackRows(tasks, prevStart, meId, 'week'), [tasks, prevStart, meId])
  const current = useMemo(() => weekListTasks(tasks, weekStart, meId).filter((t) => !t.completed), [tasks, weekStart, meId])
  const aboveTasks = useMemo(
    () => selectPeriodTasks(tasks, 'month', monthStart, isCurrentPeriod(periodBounds('month', monthStart, seasons), today), meId, seasons)
      .filter((t) => !t.completed),
    [tasks, monthStart, seasons, today, meId],
  )
  const above = useMemo(() => aboveTasks.filter((t) => !t.isGoal), [aboveTasks])
  const aboveGoals = useMemo(() => aboveTasks.filter((t) => t.isGoal), [aboveTasks])
  const aboveLabel = monthStart.toLocaleDateString('en-US', { month: 'long' })

  const isCurrentWeek = weekStart <= today && today.getTime() < weekStart.getTime() + 7 * DAY
  const periodLabel = isCurrentWeek ? 'this week' : `the week of ${formatWeekRangeShort(weekStart)}`
  const prevLabel = isCurrentWeek ? 'last week' : `the week of ${formatWeekRangeShort(prevStart)}`
  const dayOptions = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart.getTime() + i * DAY)
    return { ymd: localYmd(d), label: d.toLocaleDateString('en-US', { weekday: 'short' }) }
  }), [weekStart])

  const writers = useMemo(() => ({
    keep: async (id: string, periodStart: Date, prev: Date) => !!(await keepForward(id, { weekStart: periodStart }, prev)),
    // A dated new task is created ON the week first, then given its day: addTask
    // writes `week_start` only for a bucket='week' insert (a `scheduledFor`
    // insert lands as 'timed' with no week), so creating it dated would leave it
    // off the week list entirely. A date keeps the week commitment (planPlacement).
    addTask: async (title: string, o: { id: string; periodStart: Date; day?: Date; isGoal?: boolean; goalTaskId?: string; context: DomainId | null }) => {
      const id = await addTask(title, undefined, undefined, undefined, {
        id: o.id, bucket: 'week' as const, weekStart: o.periodStart, goalTaskId: o.goalTaskId, context: o.context,
      })
      if (!id) return undefined
      // A lost day is a lost decision: report the step as unwritten so it stays
      // in the draft and Save retries it. The create is idempotent (the id rides
      // the INSERT), so the retry finds the row and applies the day to it.
      if (o.day && !(await gated.updateTask(id, { scheduledFor: o.day, isAllDay: true }))) return undefined
      return id
    },
    contextOf: (id: string) => tasks.find((t) => t.id === id)?.context ?? null,
    complete: (id: string) => completeTask(id),
    someday: (id: string) => gated.updateTask(id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined }),
    drop: (id: string, prev: Date) => dropCommitment(id, 'week', prev),
    // The SESSION's week, never "the week containing today".
    takeInto: (id: string, periodStart: Date) => gated.updateTask(id, { bucket: 'week', weekStart: periodStart }),
  }), [keepForward, addTask, tasks, completeTask, gated, dropCommitment])

  const isCompleted = useCallback((id: string) => !!tasks.find((t) => t.id === id)?.completed, [tasks])

  const host = usePlanSessionHost({
    enabled: true, level: 'week', horizon: 'weekly', token,
    periodStart: weekStart, prevStart,
    listsLoading: loading || seasonsLoading,
    back, current, above,
    writers,
    isCompleted,
  })
  const { saved: savedSession, loading: sessionLoading, error: sessionReadError, reload: reloadSession } = host.session
  const { sessionReady, draft, shownDraft, sessionOpen, savingSession, justSaved, saveError,
    startSession, changeDraft, closeSession, saveDraft } = host

  return (
    <>
      {!isPast && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <p className="text-[13px] text-neutral-500">
            {sessionReadError
              ? <>Couldn&rsquo;t check whether {periodLabel} is planned. <button type="button" onClick={reloadSession} className="font-semibold text-primary-700 hover:underline">Try again</button></>
              : savedSession
                ? <span className="font-semibold text-sage-600">Planned {savedSession.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                : 'Not planned yet'}
          </p>
          <span className="flex-1" />
          {!sessionOpen && (
            <button type="button" onClick={startSession} disabled={!sessionReady} aria-busy={sessionLoading || undefined}
              className={`${savedSession
                ? 'rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700'
                : 'rounded-md bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white'} disabled:opacity-50`}>
              {savedSession ? 'Review the plan' : draft && !isEmptyDraft(draft) ? `Continue planning ${periodLabel}` : `Plan ${periodLabel}`}
            </button>
          )}
        </div>
      )}
      {justSaved && !sessionOpen && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-sage-50 px-3 py-2 text-sm text-neutral-700">
          <span className="min-w-0 flex-1"><Check className="mb-0.5 mr-1 inline h-4 w-4 text-sage-600" />The week is planned. Each day, pick from this list.</span>
          <button type="button" onClick={() => navigate('/today')} className="rounded-md bg-primary-600 px-3 py-1 text-[13px] font-semibold text-white">Go to Today →</button>
        </div>
      )}

      {sessionOpen && shownDraft
        ? (
          <PlanSession level="week" aboveLabel={aboveLabel} dayOptions={dayOptions}
            periodLabel={periodLabel} prevLabel={prevLabel}
            finished={back.finished} open={back.open} current={current}
            above={above} aboveGoals={aboveGoals} hiddenStepGoals={undefined} domainInView={soleDomain ?? null}
            draft={shownDraft} onChange={changeDraft} onClose={closeSession} onSave={saveDraft} saving={savingSession} saveError={saveError} />
        )
        : children({ openSession: startSession })}
    </>
  )
}
