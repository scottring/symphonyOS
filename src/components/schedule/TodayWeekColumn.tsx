// src/components/schedule/TodayWeekColumn.tsx
//
// Today's reference column: the week beside the day, drawn the way every
// horizon draws the level above (Week's months, Month's season) — flat rows,
// one quiet action each (Scott, 2026-09-30: "above all else, it has to be
// consistent"). It replaces the Shelves drawer's tabs, search and boxed
// buttons. Choosing puts a row on today; it stays on the week's list.
//
// On the week's last day the week still ahead is here too (walkthrough
// 2026-10-02, #24/#18: a plan made for next week was nowhere on Today). Its
// rows are for reading — a details click, never "+ Today".
import { useNavigate } from 'react-router-dom'
import { Check, PanelRightClose } from 'lucide-react'
import type { DayPlan, DayPlanEntry } from '@/lib/today/dayPlan'
import { alreadyPlaced } from '@/lib/today/dayPlan'
import type { DayPlanPanelActions } from '@/components/reference/DayPlanPanel'
import { localYmd } from '@/lib/cadence/config'
import { writePlanDrag } from '@/lib/planning/planDrag'

export interface TodayNextWeek { weekNo: number; weekStart: Date; entries: DayPlanEntry[] }

export function TodayWeekColumn({ plan, day, weekNo, weekStart, actions, nextWeek, onHide }: {
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
}) {
  const navigate = useNavigate()
  const tasks = plan.chooserTasks.filter((e) => !e.completed && !alreadyPlaced(e, day))
  const placed = plan.chooserTasks.some((e) => alreadyPlaced(e, day))
  const routines = plan.chooserRoutines.filter((e) => !e.completed && !e.planned && !e.onToday)
  const toToday = (e: DayPlanEntry) => {
    if (e.kind === 'routine' && e.routine && actions.placeRoutine) actions.placeRoutine(e, day)
    else actions.choose(e)
  }
  const title = (e: DayPlanEntry) => (
    <span className="min-w-0 flex-1">
      <button type="button" className="text-left" onClick={() => actions.open?.(e)}>{e.title}</button>
      {e.context && <span className="block text-[12px] text-neutral-500">{e.context}</span>}
    </span>
  )
  // A row drags onto the day (Scott, 2026-10-07): dropped on the day column
  // it gets the time it lands at; dropped on For today it is chosen, no time.
  const row = (e: DayPlanEntry) => (
    <li key={e.key} className="pv2-rrow pv2-rrow-sans today-ref-row" draggable
      onDragStart={(ev) => writePlanDrag(ev.dataTransfer, { kind: e.kind, id: e.id, date: localYmd(day), title: e.title })}>
      {/* Done from here too (Scott, 2026-10-07): a week task finished without
          first choosing it for today. Same check, and the same writer (with
          Undo), as the Shelves chooser's. */}
      {/* Two different verbs, drawn differently (review, 2026-10-07: the
          circle and "+ Today" read as two ways to select): the circle is a
          check that shows its tick on hover and says "Mark done"; "+ Today"
          is a button. */}
      <button type="button" aria-label={`Complete ${e.title}`} title="Mark done" onClick={() => actions.complete(e)}
        className="today-ref-check mt-[3px] flex h-6 w-6 shrink-0 items-center justify-center">
        <span className="today-ref-check-ring" aria-hidden="true"><Check size={11} strokeWidth={3} /></span>
      </button>
      {title(e)}
      <span className="pv2-refacts">
        <button type="button" className="pv2-addbtn today-ref-add" data-guide-target={e.kind === 'task' ? 'today-choose' : undefined} data-guide-id={e.id} onClick={() => toToday(e)} aria-label={`Add ${e.title} to today`}><span>+ Today</span></button>
      </span>
    </li>
  )
  const readRow = (e: DayPlanEntry) => (
    <li key={e.key} className="pv2-rrow pv2-rrow-sans">
      <span className="pv2-dash" style={{ marginTop: 10 }} aria-hidden="true" />
      {title(e)}
    </li>
  )
  return (
    <section className="pv2-ref today-ref" aria-label={`Week ${weekNo}, for reference`}>
      <div className="pv2-colh">
        Week {weekNo} <small>(for reference)</small>
        {onHide && (
          <button type="button" className="today-ref-hide" onClick={onHide} aria-label={`Hide week ${weekNo}`} title={`Hide week ${weekNo}`}>
            <PanelRightClose size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      {tasks.length ? <ul className="pv2-list">{tasks.map(row)}</ul> : <p className="pv2-hint">Nothing still to place this week.</p>}
      {routines.length > 0 && (
        <>
          <div className="pv2-colh today-ref-sub">Routines <small>today</small></div>
          <ul className="pv2-list">{routines.map(row)}</ul>
        </>
      )}
      {/* Words, not a tally (walkthrough 2026-10-02: no counts in app copy). */}
      {placed && <p className="pv2-hint">Some of this week’s work is already on a day.</p>}
      <button type="button" className="pv2-link" style={{ marginTop: 8 }} onClick={() => navigate(`/week?start=${localYmd(weekStart)}`)}>Open week {weekNo} →</button>
      {nextWeek && (
        <section aria-label={`Week ${nextWeek.weekNo}, starts tomorrow`}>
          <div className="pv2-colh today-ref-sub">Week {nextWeek.weekNo} <small>· starts tomorrow</small></div>
          {nextWeek.entries.length
            ? <ul className="pv2-list">{nextWeek.entries.map(readRow)}</ul>
            : <p className="pv2-hint">Nothing on next week’s list yet.</p>}
          <button type="button" className="pv2-link" style={{ marginTop: 8 }} onClick={() => navigate(`/week?start=${localYmd(nextWeek.weekStart)}`)}>Open week {nextWeek.weekNo} →</button>
        </section>
      )}
    </section>
  )
}
