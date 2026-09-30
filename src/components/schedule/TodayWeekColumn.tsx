// src/components/schedule/TodayWeekColumn.tsx
//
// Today's reference column: the week beside the day, drawn the way every
// horizon draws the level above (Week's months, Month's season) — flat rows,
// one quiet action each (Scott, 2026-09-30: "above all else, it has to be
// consistent"). It replaces the Shelves drawer's tabs, search and boxed
// buttons. Choosing puts a row on today; it stays on the week's list.
import { useNavigate } from 'react-router-dom'
import type { DayPlan, DayPlanEntry } from '@/lib/today/dayPlan'
import { alreadyPlaced } from '@/lib/today/dayPlan'
import type { DayPlanPanelActions } from '@/components/reference/DayPlanPanel'
import { localYmd } from '@/lib/cadence/config'

export function TodayWeekColumn({ plan, day, weekNo, weekStart, actions }: {
  plan: DayPlan
  day: Date
  weekNo: number
  weekStart: Date
  actions: DayPlanPanelActions
}) {
  const navigate = useNavigate()
  const tasks = plan.chooserTasks.filter((e) => !e.completed && !alreadyPlaced(e, day))
  const placed = plan.chooserTasks.filter((e) => alreadyPlaced(e, day)).length
  const routines = plan.chooserRoutines.filter((e) => !e.completed && !e.planned && !e.onToday)
  const toToday = (e: DayPlanEntry) => {
    if (e.kind === 'routine' && e.routine && actions.placeRoutine) actions.placeRoutine(e, day)
    else actions.choose(e)
  }
  const row = (e: DayPlanEntry) => (
    <li key={e.key} className="pv2-rrow pv2-rrow-sans">
      <span className="pv2-dash" style={{ marginTop: 10 }} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <button type="button" className="text-left" onClick={() => actions.open?.(e)}>{e.title}</button>
        {e.context && <span className="block text-[12px] text-neutral-500">{e.context}</span>}
      </span>
      <span className="pv2-refacts">
        <button type="button" className="pv2-addbtn" onClick={() => toToday(e)} aria-label={`Add ${e.title} to today`}>+ Today</button>
      </span>
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
      {placed > 0 && <p className="pv2-hint">{placed} more {placed === 1 ? 'is' : 'are'} already on a day this week.</p>}
      <button type="button" className="pv2-link" style={{ marginTop: 8 }} onClick={() => navigate(`/week?start=${localYmd(weekStart)}`)}>Open week {weekNo} →</button>
    </section>
  )
}
