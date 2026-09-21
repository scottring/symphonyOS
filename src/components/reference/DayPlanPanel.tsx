// The Planning panel (Scott, 2026-09-21): ONE list, "To plan" — everything
// that answers "what might I put on a day?" (unfinished work, this week's
// undated tasks, routines with no day yet), each once, with a line of context
// instead of another category to learn. Beside Today, "Scheduled today" (dated
// but not chosen) keeps its own small group; the month plan opens on request
// ("Browse month plan") rather than standing beside the list.
//
// The interaction: pick something here → put it on a day → do it. A chosen
// row stays, marked "Planned today", so nothing reads as unfinished twice.
// Every drag has a button: Today and Set a day or time live on the row, so a
// keyboard or a touchscreen can do all of it.
import { useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, Clock, GripVertical, Undo2 } from 'lucide-react'
import { SchedulePopover } from '@/components/triage'
import type { DayPlan, DayPlanEntry } from '@/lib/today/dayPlan'
import { writePlanDrag } from '@/lib/planning/planDrag'
import { localYmd, weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'

/** Rows a group shows before "+N more" — the pin is a fixed-space surface. */
export const PLAN_GROUP_CAP = 6

export interface DayPlanPanelActions {
  choose: (entry: DayPlanEntry) => void
  unchoose: (entry: DayPlanEntry) => void
  complete: (entry: DayPlanEntry) => void
  /** A date (all-day) or a time; routines: time only. */
  schedule: (entry: DayPlanEntry, when: Date, isAllDay: boolean) => void
  commit: (entry: DayPlanEntry, period: 'week' | 'month') => void
}

function PlanRow({ entry, day, actions, draggable }: {
  entry: DayPlanEntry
  day: Date
  actions: DayPlanPanelActions
  draggable: boolean
}) {
  const canDrag = draggable && !entry.completed && !entry.planned
  // A collection is done when its steps are — its steps are ticked where it
  // is worked (the main list), so the pin shows its progress, not a tick.
  const progress = entry.item?.type === 'routine-collection' ? entry.item.collectionProgress : undefined
  return (
    <li
      className="group flex items-start gap-2 border-b border-neutral-200/80 py-2 text-[14px]"
      draggable={canDrag}
      onDragStart={canDrag ? (e) => writePlanDrag(e.dataTransfer, {
        kind: entry.kind, id: entry.id, date: localYmd(day), title: entry.title,
      }) : undefined}
      data-plan-key={entry.key}
    >
      {canDrag
        ? <GripVertical aria-hidden="true" className="mt-[3px] h-3.5 w-3.5 shrink-0 cursor-grab text-neutral-300" />
        : <span aria-hidden="true" className="w-3.5 shrink-0" />}
      {progress ? (
        <span className="mt-[1px] w-7 shrink-0 text-[11px] tabular-nums text-neutral-400">{progress.done}/{progress.total}</span>
      ) : (
      <button
        type="button"
        aria-label={entry.completed ? `Mark ${entry.title} not done` : `Complete ${entry.title}`}
        onClick={() => actions.complete(entry)}
        className={`mt-[3px] grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border transition-colors ${
          entry.completed
            ? 'border-neutral-400 bg-neutral-400 text-white'
            : 'border-neutral-400 text-transparent hover:border-primary-500 hover:bg-primary-500 hover:text-white'
        }`}
      >
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </button>
      )}
      <div className="min-w-0 flex-1">
        <span className={`line-clamp-2 break-words leading-snug ${entry.completed ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}>
          {entry.title}
        </span>
        {entry.planned && !entry.completed ? (
          <span className="block text-[11.5px] text-primary-700">Planned today</span>
        ) : entry.context ? (
          <span className="block text-[11.5px] text-neutral-500">{entry.context}</span>
        ) : null}
      </div>
      {!entry.completed && (
        <div className="flex shrink-0 items-center gap-0.5 text-neutral-500">
          {entry.planned ? (
            <button
              type="button"
              aria-label={`Move ${entry.title} back off today`}
              title="Move back — it stays here, unplanned"
              onClick={() => actions.unchoose(entry)}
              className="rounded p-1 hover:bg-neutral-100 hover:text-neutral-800"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              aria-label={`Plan ${entry.title} for today`}
              onClick={() => actions.choose(entry)}
              className="rounded px-1.5 py-0.5 text-[12px] font-medium text-primary-700 hover:bg-primary-50"
            >
              Today
            </button>
          )}
          <SchedulePopover
            itemTitle={entry.title}
            // A routine occurrence moves to another day only with a time (the
            // one-day override); a task may take a day or a time.
            skipToTime={entry.kind === 'routine'}
            value={entry.kind === 'routine' ? day : undefined}
            onSchedule={(when, isAllDay) => actions.schedule(entry, when, isAllDay)}
            onDefer={entry.kind === 'task'
              ? (target) => { if (target === 'week' || target === 'month') actions.commit(entry, target) }
              : undefined}
            trigger={
              <button
                type="button"
                aria-label={`Set a day or time for ${entry.title}`}
                className="inline-flex rounded p-1 hover:bg-neutral-100 hover:text-neutral-800"
              >
                <Clock className="h-3.5 w-3.5" />
              </button>
            }
          />
        </div>
      )}
    </li>
  )
}

function Group({ title, entries, day, actions, draggable, defaultOpen, empty, cap = PLAN_GROUP_CAP, open: openProp, onOpenChange, count = true }: {
  title: string
  /** Show "· N outstanding" after the title. Off for Carried over: unfinished
   *  work is findable here, never scored (Today keeps no scoreboard). */
  count?: boolean
  entries: DayPlanEntry[]
  day: Date
  actions: DayPlanPanelActions
  draggable: boolean
  defaultOpen: boolean
  empty?: ReactNode
  /** Rows shown before "+N more". null = show them all: on a week page this
   *  list IS the work, and a cap there is a list pretending to be a summary. */
  cap?: number | null
  /** Controlled open state, for a host that remembers the fold across visits. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [openState, setOpenState] = useState(defaultOpen)
  const open = openProp ?? openState
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next)
    else setOpenState(next)
  }
  const [all, setAll] = useState(false)
  const outstanding = entries.filter((e) => !e.completed && !e.planned).length
  if (entries.length === 0 && !empty) return null
  // Outstanding first, then chosen, then done: the ones asking for a decision lead.
  const ordered = [...entries].sort((a, b) => rank(a) - rank(b))
  const shown = all || cap === null ? ordered : ordered.slice(0, cap)
  const id = `plan-group-${title.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div className="mt-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-500 hover:text-neutral-800"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {title}{count && outstanding > 0 ? ` · ${outstanding}` : ''}
      </button>
      {open && (
        <div id={id}>
          {entries.length === 0 ? (
            <p className="py-2 text-[13px] text-neutral-400">{empty}</p>
          ) : (
            <ul className="day-plan-rows mt-1 border-t border-neutral-200/80">
              {shown.map((e) => <PlanRow key={e.key} entry={e} day={day} actions={actions} draggable={draggable} />)}
            </ul>
          )}
          {!all && cap !== null && ordered.length > cap && (
            <button type="button" onClick={() => setAll(true)} className="py-1.5 text-[13px] text-neutral-500 hover:text-neutral-800">
              +{ordered.length - cap} more
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function rank(e: DayPlanEntry): number {
  if (e.completed) return 2
  return e.planned ? 1 : 0
}

/** "This week", or the week's own name when it is not the current one. Don't
 *  call another week "this week": a week page can page backwards, and a list
 *  labelled for the wrong week is how you plan into a week that has gone. */
export function weekListTitle(weekStart: Date | null): string {
  if (!weekStart) return 'This week'
  const current = weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn)
  return localYmd(weekStart) === localYmd(current)
    ? 'This week'
    : `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

/** What the panel is planning: the week on screen, or the day. */
export function planningSubtitle(day: Date, weekPage: Date | null): string {
  if (weekPage) {
    const end = new Date(weekPage)
    end.setDate(end.getDate() + 6)
    const a = weekPage.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const b = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${a} – ${b}`
  }
  return day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export function DayPlanPanel({ plan, day, actions, draggable = true, weekPage = null }: {
  plan: DayPlan
  day: Date
  actions: DayPlanPanelActions
  /** Rows can be dragged out (desktop). Off on touch layouts. */
  draggable?: boolean
  /** The week the page beside this panel is showing. Set = the list is the
   *  week's work and shows every row; null = the panel is beside a day and
   *  the list is capped like any reference. */
  weekPage?: Date | null
}) {
  const [monthOpen, setMonthOpen] = useState(false)
  const beside = weekPage ? 'week' : 'day'
  return (
    <div data-testid="day-plan-panel">
      <Group
        title="To plan"
        entries={plan.toPlan ?? []}
        day={day}
        actions={actions}
        draggable={draggable}
        defaultOpen
        count={false}
        cap={weekPage !== null ? null : PLAN_GROUP_CAP}
        empty={beside === 'week' ? 'Nothing to plan — every task has its day.' : 'Nothing to plan.'}
      />
      {/* A task dated today is on Today's page (scheduling is sufficient,
          focus never gates visibility — Scott, 2026-09-21). Nothing dated
          waits here. */}
      <div className="mt-4">
        <button
          type="button"
          aria-expanded={monthOpen}
          aria-controls="plan-group-this-month"
          onClick={() => setMonthOpen((o) => !o)}
          className="inline-flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-500 hover:text-neutral-800"
        >
          {monthOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Browse month plan
        </button>
        {monthOpen && (
          <Group
            title="This month"
            entries={plan.month}
            day={day}
            actions={actions}
            draggable={draggable}
            defaultOpen
            count={false}
            cap={null}
            empty="Nothing on this month's list."
          />
        )}
      </div>
    </div>
  )
}

/** The one line Today spends on the panel. No counts (Today keeps no
 *  scoreboard): it says only whether there is anything to plan. */
export function planSummary(plan: DayPlan): string | null {
  const waiting = [...plan.toPlan, ...plan.scheduled].some((e) => !e.completed && !e.planned)
  return waiting ? 'Choose something for today' : null
}

/** Map the panel's row gestures onto plan actions for `day`. */
export function panelActionsFor(
  day: Date,
  a: import('@/lib/planning/planActions').PlanActions & {
    toggleTask: (id: string) => void
    completeRoutine: (routineId: string, day: Date, done: boolean) => Promise<boolean>
  },
): DayPlanPanelActions {
  const payload = (e: DayPlanEntry) => ({ kind: e.kind, id: e.id, date: localYmd(day), title: e.title })
  return {
    choose: (e) => { void (e.kind === 'task' ? a.chooseTaskDay(e.id, day) : a.chooseRoutine(e.id, day, true, e.title)) },
    unchoose: (e) => { void (e.kind === 'task' ? a.unchooseTask(e.id) : a.chooseRoutine(e.id, day, false, e.title)) },
    complete: (e) => { if (e.kind === 'task') a.toggleTask(e.id); else void a.completeRoutine(e.id, day, !e.completed) },
    schedule: (e, when, isAllDay) => {
      void a.drop(payload(e), isAllDay ? { type: 'day', day: when } : { type: 'time', when })
    },
    commit: (e, period) => { if (e.kind === 'task') void a.commitTask(e.id, period) },
  }
}
