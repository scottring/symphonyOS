// The Today pin's contents: what the day holds that Today's main list does
// not draw — until you choose it.
//
//   Scheduled today   untimed tasks DATED today: commitments, not options
//   Available today   untimed routine occurrences for today: a choice
//   This week         the week's list (folded)
//   This month        the month's list (folded)
//
// A chosen row stays in its group, marked "Planned today", so nothing reads as
// unfinished twice. Every drag has a button: Today, Set time…, This week /
// This month live on the row, so a keyboard or a touchscreen can do all of it.
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
        {entry.planned && !entry.completed && (
          <span className="block text-[11.5px] text-primary-700">Planned today</span>
        )}
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

function Group({ title, entries, day, actions, draggable, defaultOpen, empty, cap = PLAN_GROUP_CAP }: {
  title: string
  entries: DayPlanEntry[]
  day: Date
  actions: DayPlanPanelActions
  draggable: boolean
  defaultOpen: boolean
  empty?: ReactNode
  /** Rows shown before "+N more". null = show them all: on a week page this
   *  list IS the work, and a cap there is a list pretending to be a summary. */
  cap?: number | null
}) {
  const [open, setOpen] = useState(defaultOpen)
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
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-500 hover:text-neutral-800"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {title}{outstanding > 0 ? ` · ${outstanding}` : ''}
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

export function DayPlanPanel({ plan, day, actions, draggable = true, weekPage = null }: {
  plan: DayPlan
  day: Date
  actions: DayPlanPanelActions
  /** Rows can be dragged out (desktop). Off on touch layouts. */
  draggable?: boolean
  /** The week the page beside this panel is showing. Set = the week list is
   *  the reason the panel is open: it leads, opens, and shows every row. Null
   *  = the panel is beside some other page and the week stays a closed
   *  reference under the day. */
  weekPage?: Date | null
}) {
  const nothing = plan.scheduled.length + plan.available.length + plan.week.length + plan.month.length === 0
  // Don't call another week "this week". The pin sits beside a page that can
  // page backwards, and a list labelled for the wrong week is how you end up
  // planning into a week that has already gone.
  const weekTitle = weekPage && localYmd(weekPage) !== localYmd(weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn))
    ? `Week of ${weekPage.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : 'This week'
  const weekGroup = (
    <Group
      title={weekTitle}
      entries={plan.week}
      day={day}
      actions={actions}
      draggable={draggable}
      defaultOpen={weekPage !== null}
      cap={weekPage !== null ? null : PLAN_GROUP_CAP}
      empty={weekPage !== null ? 'Nothing on this week’s list.' : undefined}
    />
  )
  return (
    <div data-testid="day-plan-panel">
      {nothing && !weekPage && <p className="py-4 text-[14px] text-neutral-500">Nothing waiting — the day is what's on it.</p>}
      {weekPage && weekGroup}
      <Group title="Scheduled today" entries={plan.scheduled} day={day} actions={actions} draggable={draggable} defaultOpen={!weekPage} />
      <Group title="Available today" entries={plan.available} day={day} actions={actions} draggable={draggable} defaultOpen={!weekPage} />
      {!weekPage && weekGroup}
      <Group title="This month" entries={plan.month} day={day} actions={actions} draggable={draggable} defaultOpen={false} />
    </div>
  )
}

/** The one line Today spends on the pin: "3 scheduled for today · 8 available". */
export function planSummary(plan: DayPlan): string | null {
  const parts: string[] = []
  if (plan.counts.scheduled > 0) parts.push(`${plan.counts.scheduled} scheduled for today`)
  if (plan.counts.available > 0) parts.push(`${plan.counts.available} available`)
  if (parts.length > 0) return parts.join(' · ')
  const lists = [...plan.week, ...plan.month].filter((e) => !e.completed && !e.planned).length
  return lists > 0 ? 'Choose from this week’s list' : null
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
