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
import type { DayPlan, DayPlanEntry } from '@/lib/today/dayPlan'
import { alreadyPlaced } from '@/lib/today/dayPlan'
import type { DayPlanPanelActions } from '@/components/reference/DayPlanPanel'
import { localYmd } from '@/lib/cadence/config'

export interface TodayNextWeek { weekNo: number; weekStart: Date; entries: DayPlanEntry[] }

export function TodayWeekColumn({ plan, day, weekNo, weekStart, actions, nextWeek }: {
  plan: DayPlan
  day: Date
  weekNo: number
  weekStart: Date
  actions: DayPlanPanelActions
  /** Next week's open list — passed only on the week's last day. */
  nextWeek?: TodayNextWeek | null
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
  const row = (e: DayPlanEntry) => (
    <li key={e.key} className="pv2-rrow pv2-rrow-sans">
      <span className="pv2-dash" style={{ marginTop: 10 }} aria-hidden="true" />
      {title(e)}
      <span className="pv2-refacts">
        <button type="button" className="pv2-addbtn" onClick={() => toToday(e)} aria-label={`Add ${e.title} to today`}>+ Today</button>
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
      <div className="pv2-colh">Week {weekNo} <small>(for reference)</small></div>
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
