// Period-specific planning references: Today chooses from the week's tasks
// and relevant routine occurrences. Week consults month goals and tasks,
// with unfinished work available on request. Secondary moves stay in menus.
import { createPortal } from 'react-dom'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, GripVertical, MoreHorizontal, Repeat } from 'lucide-react'
import { WeekRoutineChoices } from './WeekRoutineChoices'
import { SchedulePopover } from '@/components/triage'
import type { DayPlan, DayPlanEntry } from '@/lib/today/dayPlan'
import { writePlanDrag } from '@/lib/planning/planDrag'
import { localYmd, weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'
import { formatWeekRangeShort } from '@/lib/dateHelpers'
import { weekendStartFor, weekendLabel } from '@/lib/planning/weekend'
import { committedTo } from '@/lib/placement/model'
import { requestQuickAdd } from '@/lib/quickAddSignal'

/** Rows a group shows before "+N more" — the pin is a fixed-space surface. */
export const PLAN_GROUP_CAP = 6

export interface DayPlanPanelActions {
  chooseOccurrence?: (entry: DayPlanEntry, date: Date) => Promise<boolean>
  choose: (entry: DayPlanEntry) => void
  unchoose: (entry: DayPlanEntry) => void
  complete: (entry: DayPlanEntry) => void
  /** A date (all-day) or a time; routines: time only. */
  schedule: (entry: DayPlanEntry, when: Date, isAllDay: boolean) => void
  weekend?: (entry: DayPlanEntry, saturday: Date) => Promise<boolean>
  commit: (entry: DayPlanEntry, period: 'week' | 'month') => void
  /** Someday: off its day and its lists, kept. A deferral with a name. */
  someday?: (entry: DayPlanEntry) => void
  /** Opens the add box — the empty week's list offers it. */
  addTask?: () => void
  /** A routine with no day of its own is placed on ONE day of the week being
   *  planned — an occurrence, never the rule. */
  placeRoutine?: (entry: DayPlanEntry, when: Date) => void
  /** The separate, explicit action: change the routine's repeating schedule. */
  changeRoutineRule?: (entry: DayPlanEntry) => void
  /** Opens the row's detail pane (Scott, 2026-09-22: "clicking on the task
   *  should open its detail pane"). The title is the door. */
  open?: (entry: DayPlanEntry) => void
  /** Deletes the row's task or routine, behind ⋯ — the host holds it for an
   *  Undo window. */
  remove?: (entry: DayPlanEntry) => void
}

/** The day a routine's "Plan for today…" picker opens on: today when today is
 *  in the week being planned, else that week's first day — the occurrence
 *  lands in the week on screen, never quietly in the current one. */
export function routinePlaceDay(day: Date, weekPage: Date | null): Date {
  if (!weekPage) return day
  const thisWeek = weekStartAnchor(day, readCadenceConfig().weekStartsOn)
  return thisWeek.getTime() === weekPage.getTime() ? day : weekPage
}

/** Planning destinations live under Plan; maintenance stays under ⋯. */
function RowMenu({ entry, day, actions, inline = false, weekPage, planning = false }: { entry: DayPlanEntry; day: Date; actions: DayPlanPanelActions; inline?: boolean; weekPage?: Date | null; planning?: boolean }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!open || !panelRef.current || !triggerRef.current) return
    const panel = panelRef.current
    const rect = triggerRef.current.getBoundingClientRect()
    const margin = 8
    panel.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - panel.offsetWidth - margin))}px`
    panel.style.top = `${Math.max(margin, Math.min(rect.bottom + 4, window.innerHeight - panel.offsetHeight - margin))}px`
    panel.style.visibility = 'visible'
  })
  const [savingWeekend, setSavingWeekend] = useState(false)
  const [weekendError, setWeekendError] = useState(false)
  const saturday = weekendStartFor(day, weekPage)
  const unhomed = !!entry.routine
  const items: ReactNode[] = []
  // In the wide "triage" chooser every move is a visible pill (Scott,
  // 2026-09-22: "full control and visibility"); narrow, they sit behind ⋯.
  const itemClass = inline
    ? 'chooser-inline-action'
    : 'w-full px-3 py-1.5 text-left text-[13px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50'
  const dangerClass = inline
    ? 'chooser-inline-action chooser-inline-action-danger'
    : 'w-full px-3 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50'
  if (entry.completed) {
    // A done row has no moves left but Delete.
  } else if (unhomed) {
    if (actions.changeRoutineRule) {
      items.push(
        <button
          key="rule"
          type="button"
          role={inline ? undefined : 'menuitem'}
          aria-label={`Change repeating schedule for ${entry.title}`}
          onClick={() => { setOpen(false); actions.changeRoutineRule?.(entry) }}
          className={itemClass}
        >
          {inline ? 'Repeat…' : 'Change repeating schedule'}
        </button>,
      )
    }
  } else {
    if (planning) {
      if (!inline || !weekPage) items.push(<button key="today" type="button" role={inline ? undefined : "menuitem"} aria-label={`Plan ${entry.title} for today`} className={itemClass} disabled={entry.planned || entry.onToday || (!!entry.task?.scheduledFor && localYmd(entry.task.scheduledFor) === localYmd(day))}
        onClick={() => { setOpen(false); actions.choose(entry) }}>Today</button>)
      if (!inline || weekPage) items.push(<button key="week" type="button" role={inline ? undefined : "menuitem"} aria-label={`Plan ${entry.title} for this week`} className={itemClass} disabled={!!(entry.task && !entry.task.weekendStart && !entry.task.scheduledFor && committedTo(entry.task, 'week', weekPage ?? weekStartAnchor(day, readCadenceConfig().weekStartsOn)))}
        onClick={() => { setOpen(false); actions.commit(entry, 'week') }}>
        This week{!inline && weekPage && <span className="block text-[11px] text-neutral-500">{formatWeekRangeShort(weekPage)}</span>}
      </button>)
      if (entry.planned || (entry.task?.scheduledFor && localYmd(entry.task.scheduledFor) === localYmd(day))) items.push(<button key="unchoose" type="button" role={inline ? undefined : "menuitem"} className={itemClass}
        onClick={() => { setOpen(false); actions.unchoose(entry) }}>{localYmd(day) === localYmd(new Date()) ? 'Remove from today' : 'Remove from this day'}</button>)
    }
    if (planning || entry.kind === 'routine') items.push(
      <SchedulePopover
        key="schedule"
        itemTitle={entry.title}
        // A routine occurrence moves to another day only with a time (the
        // one-day override); a task may take a day or a time.
        skipToTime={entry.kind === 'routine'}
        value={entry.kind === 'routine' ? day : undefined}
        onSchedule={(when, isAllDay) => { setOpen(false); actions.schedule(entry, when, isAllDay) }}
        trigger={
          <button
            type="button"
            role={inline ? undefined : 'menuitem'}
            aria-label={planning ? `Choose date for ${entry.title}` : `Schedule ${entry.title}`}
            className={itemClass}
          >
            {planning ? 'Choose date…' : 'Schedule…'}
          </button>
        }
      />,
    )
    if (planning && (!inline || weekPage) && entry.kind === 'task' && !entry.task?.isGoal && actions.weekend) {
      items.push(<button key="weekend" type="button" role={inline ? undefined : 'menuitem'}
        aria-label={`Plan ${entry.title} for this weekend`} disabled={savingWeekend}
        className={itemClass}
        onClick={async () => {
          if (savingWeekend) return
          setSavingWeekend(true); setWeekendError(false)
          try {
            const saved = await actions.weekend!(entry, saturday)
            if (saved) setOpen(false)
            else setWeekendError(true)
          } catch { setWeekendError(true) }
          finally { setSavingWeekend(false) }
        }}>
        {savingWeekend ? 'Planning…' : inline ? 'Weekend' : 'This weekend'}
        {!inline && <span className="block text-[11px] text-neutral-500">{weekendLabel(saturday).replace('Weekend · ', '')} · either day</span>}
      </button>)
      if (weekendError) items.push(<p key="weekend-error" role="alert" className="px-3 py-2 text-xs text-red-600">Could not save the weekend plan. Try again.</p>)
    }
    if (!planning && entry.kind === 'task' && actions.someday) {
      items.push(
        <button
          key="someday"
          type="button"
          role={inline ? undefined : 'menuitem'}
          aria-label={`Move ${entry.title} to Someday`}
          onClick={() => { setOpen(false); actions.someday?.(entry) }}
          className={itemClass}
        >
          Someday
        </button>,
      )
    }
  }
  // Delete, on every row (Scott, 2026-09-22: "need to be able to delete
  // items from the chooser"). A task row deletes the task; a routine row
  // deletes the routine — its rule, not just today's occurrence — and says so.
  if (!planning && actions.remove) {
    const label = entry.kind === 'routine' ? 'Delete routine' : 'Delete'
    items.push(
      <button
        key="delete"
        type="button"
        role={inline ? undefined : 'menuitem'}
        aria-label={`${label}: ${entry.title}`}
        onClick={() => { setOpen(false); actions.remove?.(entry) }}
        className={dangerClass}
      >
        {label}
      </button>,
    )
  }
  if (planning) {
    // Destinations in a predictable order, followed by the optional undo.
    const order = ['today', 'week', 'weekend', 'schedule', 'unchoose', 'weekend-error']
    items.sort((a, b) => order.indexOf(String((a as { key?: string }).key)) - order.indexOf(String((b as { key?: string }).key)))
  }
  if (items.length === 0) return null
  if (inline) return <div className="chooser-inline-actions" aria-label={`Moves for ${entry.title}`}>{items}</div>
  return (
    <div className="relative shrink-0" onKeyDown={(event) => {
      if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); event.stopPropagation() }
      if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        const buttons = Array.from((panelRef.current ?? event.currentTarget).querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'))
        if (!buttons.length) return
        event.preventDefault()
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        buttons[next].focus()
      }
    }}>
      <button
        type="button"
        ref={triggerRef}
        aria-label={planning ? `Plan ${entry.title}` : `More for ${entry.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={planning ? "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-medium text-primary-700 hover:bg-neutral-50" : "rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800"}
      >
        {planning ? <>Plan <ChevronDown aria-hidden className="h-3 w-3" /></> : <MoreHorizontal className="h-3.5 w-3.5" />}
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[99]" aria-hidden onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            style={{ visibility: 'hidden', maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100dvh - 16px)', overflowY: 'auto' }}
            role="menu"
            aria-label={planning ? `Plan ${entry.title}` : `Moves for ${entry.title}`}
            className="fixed z-[100] w-52 rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
          >
            {items}
          </div>
        </>, document.body
      )}
    </div>
  )
}

/** The row's title wraps in full — a chooser is not a place for "…" (Scott,
 *  2026-09-22: "titles are truncated because of the space squeeze") — and,
 *  when the host can open a detail pane, it is the door to it. */
function RowTitle({ entry, open }: { entry: DayPlanEntry; open?: (entry: DayPlanEntry) => void }) {
  const cls = `block break-words text-left leading-snug ${entry.completed ? 'text-neutral-400 line-through' : 'text-neutral-800'}`
  if (!open) return <span className={cls}>{entry.title}</span>
  return (
    <button type="button" onClick={() => open(entry)} aria-label={`Open ${entry.title}`} className={`${cls} hover:text-primary-800 hover:underline`}>
      {entry.title}
    </button>
  )
}

function PlanRow({ entry, day, actions, draggable, weekPage = null, wide = false }: {
  entry: DayPlanEntry
  day: Date
  actions: DayPlanPanelActions
  draggable: boolean
  weekPage?: Date | null
  wide?: boolean
}) {
  const canDrag = draggable && !entry.completed && !entry.planned
  // A collection is done when its steps are — its steps are ticked where it
  // is worked (the main list), so the pin shows its progress, not a tick.
  const progress = entry.item?.type === 'routine-collection' ? entry.item.collectionProgress : undefined
  const unfinished = entry.group === 'unfinished' && entry.kind === 'task'
  const unhomed = !!entry.routine
  // ONE verb per row, with ONE meaning: "Plan for today" puts the row on
  // today's page. A task on the week list is chosen (into Tasks) and keeps
  // its list; any other task (an unfinished one included) is dated to today
  // and chosen; a routine's occurrence is chosen. The one row that cannot go
  // straight there is a routine with no day of its own — it has no
  // occurrence until it has a time — so its verb ends in an ellipsis, like
  // "Schedule…", asks for the time first, and lands in Schedule at that
  // time. On a week page an unfinished row is re-committed to the week
  // (undated) instead: "Plan for this week".
  const onWeek = !!(weekPage && entry.task && committedTo(entry.task, 'week', weekPage, { isCurrent: localYmd(weekPage) === localYmd(weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn)) }))
  const verbForWeek = entry.kind === 'task' && weekPage !== null
  const verbLabel = verbForWeek ? 'Plan for this week' : unhomed ? 'Plan for today…' : 'Plan for today'
  const verbAria = verbForWeek ? `Plan ${entry.title} for this week` : `Plan ${entry.title} for today`
  const verbClass = 'shrink-0 rounded-md border border-neutral-200 px-2 py-0.5 text-[12px] font-medium text-neutral-800 hover:bg-neutral-50'
  const onVerb = () => {
    if (verbForWeek) actions.commit(entry, 'week')
    else if (unfinished) actions.schedule(entry, day, true)
    else actions.choose(entry)
  }
  return (
    <li
      className={`plan-reference-row ${canDrag ? "" : "plan-reference-static"} group flex items-start gap-2 border-b border-neutral-200/80 py-2 text-[14px]${entry.kind === 'routine' ? ' chooser-row-routine' : ''}`}
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
      ) : unhomed ? (
        // A routine with no day yet has no occurrence to tick.
        <span aria-hidden="true" className="mt-[3px] h-3.5 w-3.5 shrink-0" />
      ) : (
      // The circle is a 14px glyph inside a larger target. On a phone the
      // global rule grows every labelled button to 48px, and a button that
      // IS the circle became a 48px ring (2026-09-21); with the ring on an
      // inner span the target can grow and the circle stays a circle.
      <button
        type="button"
        aria-label={entry.completed ? `Mark ${entry.title} not done` : `Complete ${entry.title}`}
        onClick={() => actions.complete(entry)}
        className="group/tick -m-1 -mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center"
      >
        <span
          aria-hidden="true"
          className={`grid h-3.5 w-3.5 place-items-center rounded-full border transition-colors ${
            entry.completed
              ? 'border-neutral-400 bg-neutral-400 text-white'
              : 'border-neutral-400 text-transparent group-hover/tick:border-primary-500 group-hover/tick:bg-primary-500 group-hover/tick:text-white'
          }`}
        >
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      </button>
      )}
      <div className="min-w-0 flex-1">
        <span className="flex items-start gap-1.5">
          {/* A routine is told apart from a task by its repeat mark and a
              sage tint (Scott, 2026-09-22), never by a separate list. */}
          {entry.kind === 'routine' && <Repeat aria-hidden="true" className="mt-[4px] h-3.5 w-3.5 shrink-0 text-sage-600" />}
          <RowTitle entry={entry} open={actions.open} />
        </span>
        {onWeek && <span className="block text-[11.5px] text-primary-700">On this week's list</span>}
        {!weekPage && entry.planned && !entry.completed && <span className="block text-[11.5px] text-primary-700">Planned today</span>}
        {entry.task?.weekendStart && <span className="block text-[11.5px] text-neutral-500">{weekendLabel(entry.task.weekendStart)}</span>}
        {entry.context && <span className={`block text-[11.5px] ${entry.kind === 'routine' ? 'text-sage-600' : 'text-neutral-500'}`}>{entry.context}</span>}
      </div>
      {entry.completed ? (
        <RowMenu weekPage={weekPage} entry={entry} day={day} actions={actions} inline={false} />
      ) : entry.kind === 'task' ? (
        <div className="chooser-action-group flex shrink-0 items-center gap-1">
          <RowMenu planning inline weekPage={weekPage} entry={entry} day={day} actions={actions} />
          <RowMenu weekPage={weekPage} entry={entry} day={day} actions={actions} />
        </div>
      ) : onWeek ? (
        <RowMenu weekPage={weekPage} entry={entry} day={day} actions={actions} />
      ) : entry.planned && !weekPage ? (
        <div className={wide ? 'chooser-action-group chooser-row-actions' : 'chooser-action-group flex shrink-0 items-center gap-0.5'}>
          <button
            type="button"
            aria-label={`Move ${entry.title} back off today`}
            title="Move back — it stays here, unplanned"
            onClick={() => actions.unchoose(entry)}
            className="shrink-0 rounded px-1.5 py-0.5 text-[12px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
          >
            Undo
          </button>
          <RowMenu weekPage={weekPage} entry={entry} day={day} actions={actions} inline={false} />
        </div>
      ) : (
        <div className={wide ? 'chooser-action-group chooser-row-actions' : 'chooser-action-group flex shrink-0 items-center gap-0.5'}>
          {unhomed ? (
            // No day of its own yet: the verb reads the same, and the click
            // asks for a time — this week's occurrence lands on the day being
            // planned (a same-day override), never the repeating rule, which
            // is the menu's separate, explicit move (Scott, 2026-09-21).
            <SchedulePopover
              itemTitle={entry.title}
              skipToTime
              value={routinePlaceDay(day, weekPage)}
              onSchedule={(when) => actions.placeRoutine?.(entry, when)}
              trigger={<button type="button" aria-label={verbAria} className={verbClass}>{verbLabel}</button>}
            />
          ) : (
            <button type="button" aria-label={verbAria} onClick={onVerb} className={verbClass}>{verbLabel}</button>
          )}
          <RowMenu weekPage={weekPage} entry={entry} day={day} actions={actions} inline={false} />
        </div>
      )}
    </li>
  )
}

/**
 * One row of Today's chooser (approved white journal, 2026-09-22): the
 * title, a routine's cadence and time beneath it, and one pill — "Choose",
 * or "Today ✓" pressed, which pressed again removes only today's choice.
 * A routine occurrence already on the day by its own time says "On today's
 * schedule" instead of a pill; a done row says "Completed". Choosing a
 * routine selects this occurrence, never the repeating rule, and completion
 * is the Today list's checkbox, not a control here. The ⋯ menu keeps the
 * row's other moves (a day or time, Someday).
 */
function OccurrenceTimeAction({ entry, day, actions }: { entry: DayPlanEntry; day: Date; actions: DayPlanPanelActions }) {
  return <SchedulePopover
    itemTitle={`${entry.title} · this occurrence`}
    skipToTime
    allowAllDay={false}
    value={day}
    onSchedule={(when) => actions.schedule(entry, when, false)}
    trigger={<button type="button" aria-label={`Set time for ${entry.title} occurrence`} className="chooser-pill">Set time</button>}
  />
}

function ChooserRow({ entry, day, actions, draggable, wide = false }: {
  entry: DayPlanEntry
  day: Date
  actions: DayPlanPanelActions
  draggable: boolean
  wide?: boolean
}) {
  const canDrag = draggable && !entry.completed && !entry.planned && !entry.onToday
  const unhomed = !!entry.routine
  const picked = entry.planned && !entry.onToday
  const pillAria = `${picked ? 'Unchoose' : 'Choose'} ${entry.title} for today`
  return (
    <li
      className={`group flex items-start gap-2.5 text-[14px]${entry.kind === 'routine' ? ' chooser-row-routine' : ''}`}
      draggable={canDrag}
      onDragStart={canDrag ? (e) => writePlanDrag(e.dataTransfer, {
        kind: entry.kind, id: entry.id, date: localYmd(day), title: entry.title,
      }) : undefined}
      data-plan-key={entry.key}
    >
      {canDrag
        ? <GripVertical aria-hidden="true" className="mt-[3px] h-3.5 w-3.5 shrink-0 cursor-grab text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100" />
        : <span aria-hidden="true" className="w-3.5 shrink-0" />}
      {entry.kind === 'task' && <button type="button" aria-label={`${entry.completed ? 'Mark not done' : 'Complete'} ${entry.title}`} onClick={() => actions.complete(entry)} className="chooser-task-check mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-primary-700"><span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border border-neutral-400">{entry.completed && <Check className="h-3 w-3" />}</span></button>}
      {entry.kind === 'routine' && (
        <Repeat aria-hidden="true" className="mt-[4px] h-3.5 w-3.5 shrink-0 text-sage-600" />
      )}
      <div className="min-w-0 flex-1">
        <RowTitle entry={entry} open={actions.open} />
        {entry.context && <span className={`chooser-cadence${entry.kind === 'routine' ? ' chooser-cadence-routine' : ''}`}>{entry.context}</span>}
        {entry.onToday && !entry.completed && <span className="chooser-status">On today's schedule</span>}
        {entry.completed && <span className="chooser-status">Completed</span>}
      </div>
      {entry.kind === 'task' && !entry.completed ? (
        <div className="chooser-action-group flex shrink-0 items-center gap-1">
          <RowMenu planning inline entry={entry} day={day} actions={actions} />
          <RowMenu entry={entry} day={day} actions={actions} />
        </div>
      ) : entry.completed || entry.onToday ? (
        <div className="chooser-action-group flex shrink-0 items-center gap-0.5">
          {!entry.completed && entry.kind === 'routine' && <OccurrenceTimeAction entry={entry} day={day} actions={actions} />}
          <RowMenu entry={entry} day={day} actions={actions} inline={false} />
        </div>
      ) : (
        <div className={wide ? 'chooser-action-group chooser-row-actions' : 'chooser-action-group flex shrink-0 items-center gap-0.5'}>
          {unhomed ? (
            // No day of its own yet: the pill asks for a time, and this
            // week's occurrence lands on today (a same-day override), never
            // the repeating rule, which is the menu's separate move.
            <SchedulePopover
              itemTitle={entry.title}
              skipToTime
              value={day}
              onSchedule={(when) => actions.placeRoutine?.(entry, when)}
              trigger={<button type="button" aria-label={pillAria} className="chooser-pill">Choose…</button>}
            />
          ) : (
            <button
              type="button"
              aria-label={pillAria}
              aria-pressed={picked}
              onClick={() => (picked ? actions.unchoose(entry) : actions.choose(entry))}
              className="chooser-pill"
            >
              {picked ? 'Today ✓' : 'Choose'}
            </button>
          )}
          {!unhomed && entry.kind === 'routine' && <OccurrenceTimeAction entry={entry} day={day} actions={actions} />}
          <RowMenu entry={entry} day={day} actions={actions} inline={false} />
        </div>
      )}
    </li>
  )
}

/** Remembered per browser: which chooser sections are folded, and whether
 *  completed rows are hidden (Scott, 2026-09-22: fold "This week's tasks"
 *  without closing the chooser; hide what is done). */
const CHOOSER_FOLDS_KEY = 'symphony.chooser.folded'
const CHOOSER_HIDE_DONE_KEY = 'symphony.chooser.hideCompleted'
function readFolded(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(CHOOSER_FOLDS_KEY) ?? '{}') as Record<string, boolean> } catch { return {} }
}
function readHideCompleted(): boolean {
  try { return localStorage.getItem(CHOOSER_HIDE_DONE_KEY) === '1' } catch { return false }
}

/** One section of Today's chooser: a small ruled heading with a note at its
 *  right — the heading folds the section, leaving the chooser open — then the
 *  rows, outstanding first. */
function ChooserSection({ id, title, note, icon, entries, day, actions, draggable, empty, open, onToggle, hideCompleted, allDone, wide = false }: {
  id: string
  /** The wide "triage" chooser: every row, every move visible. */
  wide?: boolean
  title: string
  note?: string
  icon?: ReactNode
  entries: DayPlanEntry[]
  day: Date
  actions: DayPlanPanelActions
  draggable: boolean
  /** Drawn when the section has no rows at all. */
  empty?: ReactNode
  open: boolean
  onToggle: () => void
  hideCompleted: boolean
  /** Drawn when every row is completed and completed rows are hidden. */
  allDone?: ReactNode
}) {
  const [all, setAll] = useState(false)
  const kept = hideCompleted ? entries.filter((e) => !e.completed) : entries
  const ordered = [...kept].sort((a, b) => rank(a) - rank(b))
  const shown = all || wide ? ordered : ordered.slice(0, PLAN_GROUP_CAP)
  const headingId = `chooser-${id}-heading`
  const bodyId = `chooser-${id}`
  return (
    <section aria-labelledby={headingId} className="chooser-section">
      <h3 className="chooser-section-heading">
        <button type="button" id={headingId} aria-expanded={open} aria-controls={bodyId} onClick={onToggle} className="chooser-section-toggle">
          {open ? <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" /> : <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />}
          {icon}
          {title}
        </button>
        {note && <span>{note}</span>}
      </h3>
      {open && (
        <div id={bodyId}>
          {entries.length === 0 ? (
            <div className="chooser-empty">{empty}</div>
          ) : kept.length === 0 ? (
            <div className="chooser-empty">{allDone}</div>
          ) : (
            <>
              <ul className="chooser-rows">
                {shown.map((e) => <ChooserRow key={e.key} entry={e} day={day} actions={actions} draggable={draggable} wide={wide} />)}
              </ul>
              {!all && !wide && ordered.length > PLAN_GROUP_CAP && (
                <button type="button" onClick={() => setAll(true)} className="py-1.5 text-[13px] text-neutral-500 hover:text-neutral-800">
                  Show {ordered.length - PLAN_GROUP_CAP} more
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}

/** The rows of one list, outstanding first, capped with "+N more" unless
 *  `cap` is null (on a week page the list IS the work). */
function Rows({ entries, day, actions, draggable, weekPage, cap, wide = false }: {
  entries: DayPlanEntry[]
  day: Date
  actions: DayPlanPanelActions
  draggable: boolean
  weekPage: Date | null
  cap: number | null
  wide?: boolean
}) {
  const [all, setAll] = useState(false)
  // Outstanding first, then chosen, then done: the ones asking for a decision lead.
  const ordered = [...entries].sort((a, b) => rank(a) - rank(b))
  const shown = all || wide || cap === null ? ordered : ordered.slice(0, cap)
  return (
    <>
      <ul className="day-plan-rows mt-1 border-t border-neutral-200/80">
        {shown.map((e) => <PlanRow key={e.key} entry={e} day={day} actions={actions} draggable={draggable} weekPage={weekPage} wide={wide} />)}
      </ul>
      {!all && !wide && cap !== null && ordered.length > cap && (
        <button type="button" onClick={() => setAll(true)} className="py-1.5 text-[13px] text-neutral-500 hover:text-neutral-800">
          Show {ordered.length - cap} more
        </button>
      )}
    </>
  )
}

function Group({ title, entries, day, actions, draggable, defaultOpen, empty, cap = PLAN_GROUP_CAP, open: openProp, onOpenChange, count = true, weekPage = null, wide = false }: {
  title: string
  wide?: boolean
  weekPage?: Date | null
  /** Show "· N outstanding" after the title. Off for the planning lists:
   *  unfinished work is findable here, never scored (Today keeps no scoreboard). */
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
  const outstanding = entries.filter((e) => !e.completed && !e.planned).length
  if (entries.length === 0 && !empty) return null
  const id = `plan-group-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
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
            <div className="py-2 text-[13px] text-neutral-400">{empty}</div>
          ) : (
            <Rows entries={entries} day={day} actions={actions} draggable={draggable} weekPage={weekPage} cap={cap} wide={wide} />
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
  if (weekPage) return formatWeekRangeShort(weekPage)
  return day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

/**
 * Today's chooser (Scott via Codex, 2026-09-22): two sections, told apart by
 * eye. "This week's tasks" is the week's list, whole; a chosen row stays,
 * marked, and choosing again removes only today's choice. "Routines" is the
 * day's occurrences — choosing one selects an occurrence for today, never a
 * new task and never the repeating rule; one already on the day by its own
 * time says so instead of being offered twice; and the section stays even
 * when the week's list is empty. Month-to-week selection belongs on the
 * Week page, so there is no month browser here. An empty week offers "Plan
 * your week"; urgent work still goes straight to Today through Add task.
 * Each section folds on its heading without closing the chooser, and
 * completed rows can be hidden; both are remembered per browser.
 */
function TodayChooser({ plan, day, actions, draggable, wide }: {
  plan: DayPlan
  day: Date
  actions: DayPlanPanelActions
  draggable: boolean
  cap: number | null
  wide: boolean
}) {
  const [source, setSource] = useState<'week' | 'routines'>('week')
  const [query, setQuery] = useState('')
  const matches = (entry: DayPlanEntry) => entry.title.toLowerCase().includes(query.toLowerCase())
  const tasks = plan.chooserTasks ?? (plan.toPlan ?? []).filter((e) => e.kind === 'task')
  const routines = plan.chooserRoutines ?? []
  const weekStart = weekStartAnchor(day, readCadenceConfig().weekStartsOn)
  const [folded, setFolded] = useState<Record<string, boolean>>(() => readFolded())
  const [hideCompleted, setHideCompleted] = useState<boolean>(() => readHideCompleted())
  const toggle = (id: string) => setFolded((f) => {
    const next = { ...f, [id]: !f[id] }
    try { localStorage.setItem(CHOOSER_FOLDS_KEY, JSON.stringify(next)) } catch { /* remembered only while mounted */ }
    return next
  })
  const toggleHide = () => setHideCompleted((h) => {
    try { localStorage.setItem(CHOOSER_HIDE_DONE_KEY, h ? '0' : '1') } catch { /* remembered only while mounted */ }
    return !h
  })
  const anyDone = tasks.some((e) => e.completed) || routines.some((e) => e.completed)
  return (
    <div data-testid="day-plan-panel" className="today-shelves">
      <nav aria-label="Shelf source" className="shelf-sources">
        <button type="button" aria-pressed={source === 'week'} onClick={() => { setSource('week'); setQuery('') }}>Week tasks</button>
        <button type="button" aria-pressed={source === 'routines'} onClick={() => { setSource('routines'); setQuery('') }}>Routines</button>
      </nav>
      <input type="search" aria-label="Search this shelf" placeholder="Find something…" className="shelf-search" value={query} onChange={event => setQuery(event.target.value)} />

      {(anyDone || hideCompleted) && (
        <div className="chooser-toolbar">
          <button type="button" aria-pressed={hideCompleted} onClick={toggleHide} className="chooser-toggle">
            {hideCompleted ? 'Show completed' : 'Hide completed'}
          </button>
        </div>
      )}
      {source === 'week' && <ChooserSection
        id="week"
        title="This week's tasks"
        note={formatWeekRangeShort(weekStart)}
        entries={tasks.filter(matches)}
        day={day}
        actions={actions}
        draggable={draggable}
        open={!folded.week}
        onToggle={() => toggle('week')}
        hideCompleted={hideCompleted}
        wide={wide}
        empty={
          <>
            <span>{query ? "No matching week tasks." : "No week tasks in this view. Add work on Week, or check your people and domain filters."}</span>
            {/* A plain anchor, like the fold's Inbox link: this panel is
                drawn inside and outside the router. */}
            <a href="/week">Plan your week →</a>
          </>
        }
        allDone={<span>Everything on this week's list is done.</span>}
      />}
      {source === 'routines' && (
        <ChooserSection
          id="routines"
          title="Routines"
          note={day.toDateString() === new Date().toDateString() ? "For today" : "For this day"}
          empty={<><span>{query ? "No matching routines." : "No routine occurrences in this view for this day. Check your filters or add a repeating routine."}</span><a href="/routines">Manage routines →</a></>}
          icon={<Repeat aria-hidden="true" className="h-3.5 w-3.5" />}
          entries={routines.filter(matches)}
          day={day}
          actions={actions}
          draggable={draggable}
          open={!folded.routines}
          onToggle={() => toggle('routines')}
          hideCompleted={hideCompleted}
          wide={wide}
          allDone={<span>Every routine for today is done.</span>}
        />
      )}

      <p className="chooser-foot">Choices stay on your week's list.<br />Routine choices apply to this occurrence only.</p>
    </div>
  )
}

export function DayPlanPanel({ plan, day, actions, draggable = true, weekPage = null, wide = false }: {
  plan: DayPlan
  day: Date
  actions: DayPlanPanelActions
  /** Rows can be dragged out (desktop). Off on touch layouts. */
  draggable?: boolean
  /** The wide "triage" chooser (Scott, 2026-09-22): half the screen, every
   *  row shown, every move a visible pill instead of a ⋯ menu. */
  wide?: boolean
  /** The week the page beside this panel is showing. Set = the list is the
   *  week's work and shows every row; null = the panel is beside a day and
   *  the list is capped like any reference. */
  weekPage?: Date | null
}) {
  if (weekPage === null) {
    return <TodayChooser plan={plan} day={day} actions={actions} draggable={draggable} cap={PLAN_GROUP_CAP} wide={wide} />
  }
  return <WeekShelves key={localYmd(weekPage)} plan={plan} day={day} actions={actions} weekPage={weekPage} />
}

function WeekShelves({ plan, day, actions, weekPage }: { plan: DayPlan; day: Date; actions: DayPlanPanelActions; weekPage: Date }) {
  const [source, setSource] = useState<'month' | 'routines' | 'earlier'>('month')
  const [query, setQuery] = useState('')
  const matches = (entry: DayPlanEntry) => entry.title.toLowerCase().includes(query.toLowerCase())
  const earlier = (plan.unfinished ?? []).filter(entry => !entry.completed && !(entry.task && committedTo(entry.task, 'week', weekPage, { isCurrent: localYmd(weekPage) === localYmd(weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn)) })))
  const monthTasks = plan.month.filter(entry => !entry.task?.isGoal)
  const goals = plan.month.filter(entry => entry.task?.isGoal)
  const onWeek = (entry: DayPlanEntry) => !!(entry.task && committedTo(entry.task, 'week', weekPage, { isCurrent: localYmd(weekPage) === localYmd(weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn)) }))
  const placed = monthTasks.filter(onWeek).filter(matches)
  return <div data-testid="day-plan-panel" className="week-shelves">
    <nav aria-label="Shelf source" className="shelf-sources">
      {([['month', 'Month'], ['routines', 'Routines'], ['earlier', 'Earlier']] as const).map(([key, label]) =>
        <button key={key} type="button" aria-pressed={source === key} onClick={() => { setSource(key); setQuery('') }}>{label}</button>)}
    </nav>
    <input type="search" aria-label="Search this shelf" placeholder="Find something…" value={query} onChange={event => setQuery(event.target.value)} className="shelf-search" />
    {source === 'month' && <>
      <div className="shelf-intro"><p>From your month into this week.</p><a href="/month">View month goals and plan →</a></div>
      {goals.length > 0 && <details className="shelf-goals"><summary>Month goals · {goals.length}</summary><ul>{goals.filter(matches).map(entry => <li key={entry.key}><RowTitle entry={entry} open={actions.open} /></li>)}</ul></details>}
      <Group title="Month tasks" entries={monthTasks.filter(entry => !onWeek(entry)).filter(matches)} day={day} actions={actions} draggable={false} weekPage={weekPage} defaultOpen count={false} cap={PLAN_GROUP_CAP} empty={query ? 'No matching month tasks.' : 'No month tasks waiting to be planned.'} />
      {placed.length > 0 && <details className="shelf-goals"><summary>On this week’s list · {placed.length}</summary><Rows entries={placed} day={day} actions={actions} draggable={false} weekPage={weekPage} cap={PLAN_GROUP_CAP} /></details>}
    </>}
    {source === 'routines'  && <WeekRoutineChoices days={(plan.weekRoutineDays ?? []).map(day => ({ ...day, entries: day.entries.filter(matches) }))} onChoose={actions.chooseOccurrence} onOpen={actions.open} />}
    {source === 'earlier' && <>
      <p className="shelf-intro">Open work you haven’t committed to this week.</p>
      <Group title="Unfinished from earlier" entries={earlier.filter(matches)} day={day} actions={actions} draggable={false} weekPage={weekPage} defaultOpen count={false} cap={PLAN_GROUP_CAP} empty={query ? 'No matching unfinished tasks.' : 'No unfinished tasks waiting for a decision.'} />
      {!!plan.olderUnfinished && <a className="chooser-foot" href="/inbox#expired">Older unfinished work is in Inbox →</a>}
    </>}
  </div>
}

/** Map the panel's row gestures onto plan actions for `day`. */
export function panelActionsFor(
  day: Date,
  a: import('@/lib/planning/planActions').PlanActions & {
    toggleTask: (id: string) => void
    completeRoutine: (routineId: string, day: Date, done: boolean) => Promise<boolean>
  },
  opts: {
    changeRoutineRule?: (routineId: string) => void
    open?: (kind: 'task' | 'routine', id: string) => void
    remove?: (kind: 'task' | 'routine', id: string, title: string) => void
  } = {},
): DayPlanPanelActions {
  const payload = (e: DayPlanEntry) => ({ kind: e.kind, id: e.id, date: localYmd(day), title: e.title })
  return {
    chooseOccurrence: (e, date) => a.chooseRoutine(e.id, date, true, e.title),
    choose: (e) => { void (e.kind === 'task' ? a.chooseTaskDay(e.id, day) : a.chooseRoutine(e.id, day, true, e.title)) },
    unchoose: (e) => { void (e.kind === 'task' ? a.unchooseTask(e.id, day) : a.chooseRoutine(e.id, day, false, e.title)) },
    complete: (e) => { if (e.kind === 'task') a.toggleTask(e.id); else void a.completeRoutine(e.id, day, !e.completed) },
    schedule: (e, when, isAllDay) => {
      void a.drop(payload(e), isAllDay ? { type: 'day', day: when } : { type: 'time', when })
    },
    weekend: (e, saturday) => e.kind === 'task' ? a.planTaskWeekend(e.id, saturday) : Promise.resolve(false),
    commit: (e, period) => { if (e.kind === 'task') void a.commitTask(e.id, period) },
    someday: (e) => { if (e.kind === 'task') void a.somedayTask(e.id) },
    addTask: () => requestQuickAdd(),
    placeRoutine: (e, when) => { void a.placeRoutineOnce(e.id, when, e.title) },
    changeRoutineRule: opts.changeRoutineRule ? (e) => opts.changeRoutineRule?.(e.id) : undefined,
    open: opts.open ? (e) => opts.open?.(e.kind, e.id) : undefined,
    remove: opts.remove ? (e) => opts.remove?.(e.kind, e.id, e.title) : undefined,
  }
}
