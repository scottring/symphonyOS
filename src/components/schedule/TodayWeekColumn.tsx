// src/components/schedule/TodayWeekColumn.tsx
//
// Today's reference column: the week beside the day (Scott, 2026-09-30:
// "above all else, it has to be consistent"). It replaces the Shelves
// drawer's tabs, search and boxed buttons. Choosing puts a row on today; it
// stays on the week's list, marked.
//
// The rows are the shared compact week list (canvas/week, 2026-10-10): the
// connected workspace's AlongsideDay draws the same one. This file keeps
// Today's data — DayPlan entries — and Today's writers (DayPlanPanelActions),
// each manual command reporting through the canvas activity strip with an
// Undo where the inverse is real.
//
// On the week's last day the week still ahead is here too (walkthrough
// 2026-10-02, #24/#18: a plan made for next week was nowhere on Today). Its
// rows are for reading — a details click, never "add to today".
import { useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, PanelRightClose } from 'lucide-react'
import type { Task } from '@/types/task'
import type { DayPlan, DayPlanEntry } from '@/lib/today/dayPlan'
import { alreadyPlaced } from '@/lib/today/dayPlan'
import type { DayPlanPanelActions } from '@/components/reference/DayPlanPanel'
import { localYmd } from '@/lib/cadence/config'
import { writePlanDrag } from '@/lib/planning/planDrag'
import { parentLinkOf } from '@/lib/planning/parentLink'
import { focusSnapshot } from '@/lib/placement/model'
import { formatTimeCompact } from '@/lib/dateHelpers'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { CompactWeekList, type CompactRow } from '@/components/canvas/week/CompactWeekList'
import { dayWordFor } from '@/components/canvas/week/compactWeek'

export interface TodayNextWeek { weekNo: number; weekStart: Date; entries: DayPlanEntry[] }

export function TodayWeekColumn({ plan, day, weekNo, weekStart, actions, nextWeek, onHide, findTask, openTask, chooseTask, restoreTask }: {
  plan: DayPlan
  day: Date
  weekNo: number
  weekStart: Date
  actions: DayPlanPanelActions
  /** Next week's open list — passed only on the week's last day. */
  nextWeek?: TodayNextWeek | null
  /** Folds the column away once the day is chosen (the header's view icons
   *  bring it back). */
  onHide?: () => void
  /** The page's own (filtered) task lookup: a row's parent is named only
   *  when the reader can see it. */
  findTask?: (id: string) => Task | undefined
  /** Opens a parent line's details (the group header is its door). */
  openTask?: (id: string) => void
  /** Choose a task for the day and say whether it saved (planActions'
   *  chooseTaskDay). Without it, `actions.choose` is used. */
  chooseTask?: (id: string) => Promise<boolean>
  /** The task writer, for an exact Undo of a choice. */
  restoreTask?: (id: string, prev: Partial<Task>) => Promise<unknown> | unknown
}) {
  const navigate = useNavigate()
  const activity = useCanvasActivity()
  const [routinesOpen, setRoutinesOpen] = useState(false)
  const ymd = localYmd(day)
  const { word: dayWord, tag: dayTag } = dayWordFor(day)

  // On the viewed day already: chosen for it, or dated to it.
  const onDayTag = (e: DayPlanEntry): string | null => {
    if (e.completed) return null
    const t = e.task
    if (t?.scheduledFor && localYmd(t.scheduledFor) === ymd) return t.isAllDay === false ? `${dayTag} ${formatTimeCompact(t.scheduledFor)}` : dayTag
    return e.planned || e.onToday ? dayTag : null
  }
  const parentOf = (e: DayPlanEntry) => {
    if (!e.task || !findTask) return null
    const p = parentLinkOf(e.task, findTask)
    return p ? { id: p.id, title: p.title } : null
  }
  const toRow = (e: DayPlanEntry, readOnly = false): CompactRow<DayPlanEntry> => ({
    key: e.key, id: e.id, title: e.title, item: e, completed: e.completed,
    parent: parentOf(e), context: e.context, onDay: readOnly ? null : onDayTag(e), readOnly,
  })

  // The week's rows: still to place, or already on this day (marked, not
  // hidden), or done (behind "Show done"). A row placed on ANOTHER day of
  // the week is on that day, not here.
  const taskRows = plan.chooserTasks.filter((e) => e.completed || onDayTag(e) || !alreadyPlaced(e, day)).map((e) => toRow(e))
  const placedElsewhere = plan.chooserTasks.some((e) => !onDayTag(e) && alreadyPlaced(e, day))
  const stillToPlace = taskRows.some((r) => !r.completed && !r.onDay)
  const routineRows = plan.chooserRoutines.map((e) => toRow(e))

  const label = (verb: string, e: DayPlanEntry) => `${verb} “${e.title}”`
  const toToday = (e: DayPlanEntry) => {
    const run = (cmd: () => Promise<boolean | void>, undo?: () => Promise<boolean | void>) =>
      void activity.run(label(`Plan for ${dayWord}:`, e), cmd, { ids: [e.id], undo, retry: () => toToday(e) })
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
  const complete = (e: DayPlanEntry) => {
    void activity.run(label(e.completed ? 'Reopen' : 'Done:', e), async () => actions.complete(e), {
      ids: [e.id],
      // The same writer, the other way: a task toggles back; a routine is
      // marked with the state it had.
      undo: async () => actions.complete({ ...e, completed: !e.completed }),
    })
  }
  // A row drags onto the day (Scott, 2026-10-07): dropped on the day column
  // it gets the time it lands at; dropped on For today it is chosen, no time.
  const listProps = {
    addLabel: (title: string) => `Add ${title} to ${dayWord}`,
    onAdd: toToday,
    onComplete: complete,
    onOpen: actions.open,
    onOpenParent: openTask,
    onDragStart: (e: DayPlanEntry, ev: DragEvent<HTMLLIElement>) =>
      writePlanDrag(ev.dataTransfer, { kind: e.kind, id: e.id, date: ymd, title: e.title }),
  }

  return (
    <section className="pv2-ref today-ref cw-column" aria-label={`Week ${weekNo}, for reference`}>
      <div className="pv2-colh">
        Week {weekNo} <small>(for reference)</small>
        {onHide && (
          <button type="button" className="today-ref-hide" onClick={onHide} aria-label={`Hide week ${weekNo}`} title={`Hide week ${weekNo}`}>
            <PanelRightClose size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      {!stillToPlace && <p className="pv2-hint">Nothing still to place this week.</p>}
      <CompactWeekList rows={taskRows} label={`Week ${weekNo}’s list`} {...listProps} />
      {/* Words, not a tally (walkthrough 2026-10-02: no counts in app copy). */}
      {placedElsewhere && <p className="pv2-hint">Some of this week’s work is already on a day.</p>}
      {routineRows.length > 0 && (
        <div className="cw-fold-wrap">
          <button type="button" className="cw-fold" aria-expanded={routinesOpen} onClick={() => setRoutinesOpen((o) => !o)}>
            Routines {dayWord} <ChevronRight size={14} aria-hidden="true" className="cw-fold-icon" />
          </button>
          {routinesOpen && <CompactWeekList rows={routineRows} grouped={false} label={`Routines ${dayWord}`} {...listProps} />}
        </div>
      )}
      <button type="button" className="canvas-link cw-open" onClick={() => navigate(`/week?start=${localYmd(weekStart)}`)}>Open week {weekNo} →</button>
      {nextWeek && (
        <section aria-label={`Week ${nextWeek.weekNo}, starts tomorrow`}>
          <div className="pv2-colh today-ref-sub">Week {nextWeek.weekNo} <small>· starts tomorrow</small></div>
          <CompactWeekList rows={nextWeek.entries.map((e) => toRow(e, true))} label={`Week ${nextWeek.weekNo}’s list`} onOpen={actions.open}
            empty={<p className="pv2-hint">Nothing on next week’s list yet.</p>} />
          <button type="button" className="canvas-link cw-open" onClick={() => navigate(`/week?start=${localYmd(nextWeek.weekStart)}`)}>Open week {nextWeek.weekNo} →</button>
        </section>
      )}
    </section>
  )
}
