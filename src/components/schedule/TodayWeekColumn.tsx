// src/components/schedule/TodayWeekColumn.tsx
//
// Today's week, folded beside the day (paper-style horizons, Scott
// 2026-11-04: "add today with the + on the week sheet"). Like every other
// horizon, the level above lies folded behind this period's sheet: the week
// beside the day, in place of the This week column, its hide button and the
// header's view icons. Folding is how it goes away.
//
// The one exception to "no controls on the sheet above": week and day share
// items, so each of the week's rows keeps its + (and its drag onto the day).
// Giving a week task to today is the daily "pick three to five", not a copy.
// A title tap opens the task, as the column's did.
//
// The rows are the week's open work with no day yet — the same week, in the
// same order, as the Week page's "No day yet" (both read weekListTasks). A
// row on this day is on the day beside it; one on another day is on that
// day; done rows are counted, not listed.
//
// On the week's last day the week still ahead is on the sheet too
// (walkthrough 2026-10-02, #24/#18: a plan made for next week was nowhere on
// Today). Its rows are for reading — a title opens the task, nothing more.
import type { DragEvent, ReactNode } from 'react'
import type { Task } from '@/types/task'
import type { DayPlan, DayPlanEntry } from '@/lib/today/dayPlan'
import { alreadyPlaced } from '@/lib/today/dayPlan'
import type { DayPlanPanelActions } from '@/components/reference/DayPlanPanel'
import { localYmd } from '@/lib/cadence/config'
import { writePlanDrag } from '@/lib/planning/planDrag'
import { focusSnapshot } from '@/lib/placement/model'
import { formatWeekRangeShort } from '@/lib/dateHelpers'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { dayWordFor } from '@/components/canvas/week/compactWeek'
import { PaperFold } from '@/components/plan/fold/PaperFold'
import { AboveSheet, SheetRows } from '@/components/plan/fold/AboveSheet'

export interface TodayNextWeek { weekNo: number; weekStart: Date; entries: DayPlanEntry[] }

/** "Pick three to five for today." — the sheet's foot (spec 2026-11-04). */
export const TODAY_WEEK_FOOT = 'Pick three to five for today.'

export function TodayWeekFold({ plan, day, weekNo, weekStart, actions, nextWeek, chooseTask, restoreTask, className, stowed, children }: {
  plan: DayPlan
  day: Date
  weekNo: number
  weekStart: Date
  actions: DayPlanPanelActions
  /** Next week's open list — passed only on the week's last day. */
  nextWeek?: TodayNextWeek | null
  /** Choose a task for the day and say whether it saved (planActions'
   *  chooseTaskDay). Without it, `actions.choose` is used. */
  chooseTask?: (id: string) => Promise<boolean>
  /** The task writer, for an exact Undo of a choice. */
  restoreTask?: (id: string, prev: Partial<Task>) => Promise<unknown> | unknown
  className?: string
  /** A session runs on the page: the fold is put away, the day stays mounted. */
  stowed?: boolean
  /** The day. */
  children: ReactNode
}) {
  const activity = useCanvasActivity()
  const ymd = localYmd(day)
  const { word: dayWord } = dayWordFor(day)

  // On the viewed day already: chosen for it, or dated to it.
  const onDay = (e: DayPlanEntry): boolean => {
    const t = e.task
    if (t?.scheduledFor && localYmd(t.scheduledFor) === ymd) return true
    return !!(e.planned || e.onToday)
  }
  // The week's open work with no day yet: not done, not on this day, not on
  // another day of the week.
  const open = plan.chooserTasks.filter((e) => e.kind === 'task' && !e.completed && !onDay(e) && !alreadyPlaced(e, day))
  const doneCount = plan.chooserTasks.filter((e) => e.kind === 'task' && e.completed).length
  // The day's routines with no time of their own (the column's "Routines
  // today", fix round 1): flexible occurrences, and weekly routines with no
  // day. The day's list leaves them off (dayPlan's offMainRoutineItemIds), so
  // this is their place to be picked. Chosen or done ones are on the day.
  const routines = plan.chooserRoutines.filter((e) => !e.completed && !onDay(e))
  // Rows are keyed by entry ("task:…", "routine:…"): a routine and a task
  // never share a row id.
  const byKey = new Map([...open, ...routines].map((e) => [e.key, e]))

  const toToday = (e: DayPlanEntry) => {
    const run = (cmd: () => Promise<boolean | void>, undo?: () => Promise<boolean | void>) =>
      void activity.run(`Plan for ${dayWord}: “${e.title}”`, cmd, { ids: [e.id], undo, retry: () => toToday(e) })
    if (e.kind === 'routine' && e.routine && actions.placeRoutine) {
      // A routine with no day of its own gets one occurrence; there is no
      // honest inverse here, so no Undo is offered.
      return run(async () => actions.placeRoutine!(e, day))
    }
    if (e.kind === 'task' && chooseTask) {
      const t = e.task
      const focus = ymd === localYmd(new Date())
      const prev: Partial<Task> | null = t ? {
        bucket: t.bucket, scheduledFor: t.scheduledFor, isAllDay: t.isAllDay, weekendStart: t.weekendStart,
        ...(focus ? { focus: focusSnapshot(t) } : {}),
      } : null
      const undo = prev && restoreTask
        ? async () => { await restoreTask(e.id, prev) }
        : !t?.scheduledFor ? async () => actions.unchoose(e) : undefined
      return run(() => chooseTask(e.id), undo)
    }
    // Routine occurrences (and tasks without an async chooser): choose and
    // unchoose are each other's inverse.
    return run(async () => actions.choose(e), async () => actions.unchoose(e))
  }
  // A row drags onto the day (Scott, 2026-10-07): dropped on the day's hours
  // it gets the time it lands at; dropped on For today it is chosen, no time.
  const dragRow = (key: string, ev: DragEvent<HTMLLIElement>) => {
    const e = byKey.get(key)
    if (e) writePlanDrag(ev.dataTransfer, { kind: e.kind, id: e.id, date: ymd, title: e.title })
  }
  const pick = (key: string) => { const e = byKey.get(key); if (e) toToday(e) }
  const openRow = (key: string) => { const e = byKey.get(key); if (e) actions.open?.(e) }
  const rowProps = {
    onPick: pick, pickLabel: (title: string) => `Plan ${title} for ${dayWord}`,
    onOpen: actions.open ? openRow : undefined, onDragRow: dragRow,
  }
  const asRows = (es: DayPlanEntry[]) => es.map((e) => ({ id: e.key, title: e.title }))

  const range = formatWeekRangeShort(weekStart)
  const nextById = new Map((nextWeek?.entries ?? []).map((e) => [e.id, e]))

  return (
    <PaperFold horizon="day" stowed={stowed} className={['today-fold', className].filter(Boolean).join(' ')} edgeLabel={range} edgeCount={open.length}
      frontLabel={`${range}, to pick from`}
      above={<>
        <AboveSheet kicker={`Week · ${range}`} title={`Week ${weekNo}`} rows={asRows(open)}
          doneCount={doneCount} foot={TODAY_WEEK_FOOT} empty="Nothing still to place this week." {...rowProps}>
          {routines.length > 0 && <>
            <h3 className="above-sheet-sub">Routines {dayWord}</h3>
            <SheetRows rows={asRows(routines)} label={`Routines ${dayWord}`} {...rowProps} />
          </>}
        </AboveSheet>
        {nextWeek && (
          <section className="above-sheet today-fold-next" aria-label={`Week ${nextWeek.weekNo}, starts tomorrow`}>
            <p className="above-sheet-kicker">Week {nextWeek.weekNo} · Starts tomorrow</p>
            <h3 className="above-sheet-title today-fold-next-title">{formatWeekRangeShort(nextWeek.weekStart)}</h3>
            {nextWeek.entries.length > 0 ? (
              <ul className="above-sheet-list" aria-label={`Week ${nextWeek.weekNo}`}>
                {nextWeek.entries.map((e) => (
                  <li key={e.key} className="above-sheet-row">
                    {actions.open
                      ? <button type="button" className="above-sheet-row-title" onClick={() => { const n = nextById.get(e.id); if (n) actions.open?.(n) }}>{e.title}</button>
                      : <span className="above-sheet-row-title">{e.title}</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="above-sheet-empty">Nothing on next week’s list yet.</p>}
          </section>
        )}
      </>}>
      {children}
    </PaperFold>
  )
}
