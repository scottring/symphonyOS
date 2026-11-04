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

/** On the viewed day already: chosen for it, or dated to it. */
function onViewedDay(e: DayPlanEntry, ymd: string): boolean {
  const t = e.task
  if (t?.scheduledFor && localYmd(t.scheduledFor) === ymd) return true
  return !!(e.planned || e.onToday)
}

/** The day's routines with no time of their own (the column's "Routines
 *  today", fix round 1): flexible occurrences, and weekly routines with no
 *  day. The day's list leaves them off (dayPlan's offMainRoutineItemIds), so
 *  the week sheet is where they are picked. Chosen or done ones are on the day. */
function sheetRoutines(plan: DayPlan, day: Date): DayPlanEntry[] {
  const ymd = localYmd(day)
  return plan.chooserRoutines.filter((e) => !e.completed && !onViewedDay(e, ymd))
}

/** Puts a sheet row on the day, as the column's + did, through the canvas
 *  activity strip with an Undo where the inverse is real. */
function useToToday(day: Date, actions: DayPlanPanelActions, chooseTask?: (id: string) => Promise<boolean>,
  restoreTask?: (id: string, prev: Partial<Task>) => Promise<unknown> | unknown) {
  const activity = useCanvasActivity()
  const ymd = localYmd(day)
  const { word: dayWord } = dayWordFor(day)
  const toToday = (e: DayPlanEntry): void => {
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
  return toToday
}

/** A sheet's rows for these entries: + puts one on the day, the title opens
 *  it, and it drags onto the day (Scott, 2026-10-07: dropped on the day's
 *  hours it gets the time it lands at; on For today it is chosen, no time).
 *  Rows are keyed by entry ("task:…", "routine:…"), so a routine and a task
 *  never share a row id. */
function sheetRowProps(entries: DayPlanEntry[], day: Date, actions: DayPlanPanelActions, toToday: (e: DayPlanEntry) => void) {
  const ymd = localYmd(day)
  const { word: dayWord } = dayWordFor(day)
  const byKey = new Map(entries.map((e) => [e.key, e]))
  const with_ = (f: (e: DayPlanEntry) => void) => (key: string) => { const e = byKey.get(key); if (e) f(e) }
  return {
    rows: entries.map((e) => ({ id: e.key, title: e.title })),
    onPick: with_(toToday),
    pickLabel: (title: string) => `Plan ${title} for ${dayWord}`,
    onOpen: actions.open ? with_((e) => actions.open?.(e)) : undefined,
    onDragRow: (key: string, ev: DragEvent<HTMLLIElement>) => {
      const e = byKey.get(key)
      if (e) writePlanDrag(ev.dataTransfer, { kind: e.kind, id: e.id, date: ymd, title: e.title })
    },
  }
}

/** "Routines {day}" on the week sheet: on the plain page under TodayWeekFold,
 *  and in the connected workspace drawn into AlongsideDay's sheet (TodayView
 *  holds the day's plan and its writers). Nothing when there are none. */
export function SheetRoutines({ plan, day, actions }: { plan: DayPlan; day: Date; actions: DayPlanPanelActions }) {
  const toToday = useToToday(day, actions)
  const routines = sheetRoutines(plan, day)
  if (routines.length === 0) return null
  const { word: dayWord } = dayWordFor(day)
  return <>
    <h3 className="above-sheet-sub">Routines {dayWord}</h3>
    <SheetRows label={`Routines ${dayWord}`} {...sheetRowProps(routines, day, actions, toToday)} />
  </>
}

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
  const ymd = localYmd(day)
  const toToday = useToToday(day, actions, chooseTask, restoreTask)
  // The week's open work with no day yet: not done, not on this day, not on
  // another day of the week.
  const open = plan.chooserTasks.filter((e) => e.kind === 'task' && !e.completed && !onViewedDay(e, ymd) && !alreadyPlaced(e, day))
  const doneCount = plan.chooserTasks.filter((e) => e.kind === 'task' && e.completed).length
  const { rows, ...rowProps } = sheetRowProps(open, day, actions, toToday)

  const range = formatWeekRangeShort(weekStart)
  const nextById = new Map((nextWeek?.entries ?? []).map((e) => [e.id, e]))

  return (
    <PaperFold horizon="day" stowed={stowed} className={['today-fold', className].filter(Boolean).join(' ')} edgeLabel={range} edgeCount={open.length}
      frontLabel={`${range}, to pick from`}
      above={<>
        <AboveSheet kicker={`Week · ${range}`} title={`Week ${weekNo}`} rows={rows}
          doneCount={doneCount} foot={TODAY_WEEK_FOOT} empty="Nothing still to place this week." {...rowProps}>
          <SheetRoutines plan={plan} day={day} actions={actions} />
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
