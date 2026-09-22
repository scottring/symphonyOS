// The Planning panel (Scott, 2026-09-21): ONE list, "To plan" — what is
// waiting to be scheduled in the week being planned (its undated tasks and
// routines with no day yet), each once, with a line of context instead of
// another category to learn. A task dated today is on Today's page, not here
// (scheduling is sufficient); the month plan opens on request ("Browse month
// plan") rather than standing beside the list.
//
// Unfinished work from earlier is NOT the default list (Scott, 2026-09-21
// evening). On a real account it was 23 rows above 0 rows of plan, so the
// panel said "triage" where it should say "choose". It opens on request —
// the one fold, "Unfinished from earlier" — newest missed date first, and an empty
// week's list says so and offers Add task rather than filling with backlog.
//
// The interaction: pick something here → put it on a day → do it. The list
// stays WHOLE (guided planning, Phase 2, 2026-09-21): a chosen row stays,
// marked "Planned today", with Undo instead of the verb; a ticked row stays,
// struck, with no verb — nothing reads as unfinished twice, and nothing you
// picked disappears from the list you look at every day.
// Every drag has a button, and every row answers the same question the same
// way (2026-09-21): one verb — "Plan for today" beside a day, "Plan for this
// week" on a week page — and a ⋯ menu holding "Schedule…" and "Someday" (or,
// for a routine with no day, "Change repeating schedule"). No clock glyphs,
// no "Give it a day", nothing called "let go" (deferred? dropped? deleted?).
import { useEffect, useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, GripVertical, MoreHorizontal, Repeat } from 'lucide-react'
import { SchedulePopover } from '@/components/triage'
import type { DayPlan, DayPlanEntry } from '@/lib/today/dayPlan'
import { writePlanDrag } from '@/lib/planning/planDrag'
import { localYmd, weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'
import { formatWeekRangeShort } from '@/lib/dateHelpers'
import { onUnfinishedOpenChange, readUnfinishedOpen, writeUnfinishedOpen } from '@/lib/planningPanelSignal'
import { requestQuickAdd } from '@/lib/quickAddSignal'

/** Rows a group shows before "+N more" — the pin is a fixed-space surface. */
export const PLAN_GROUP_CAP = 6

export interface DayPlanPanelActions {
  choose: (entry: DayPlanEntry) => void
  unchoose: (entry: DayPlanEntry) => void
  complete: (entry: DayPlanEntry) => void
  /** A date (all-day) or a time; routines: time only. */
  schedule: (entry: DayPlanEntry, when: Date, isAllDay: boolean) => void
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
  /** Deletes a task row, behind ⋯ — the host holds it for an Undo window. */
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

/** The row's ⋯ menu: the moves that are not the one verb. "Schedule…" is a
 *  date picker anchored to the menu item; picking a date closes both. */
function RowMenu({ entry, day, actions }: { entry: DayPlanEntry; day: Date; actions: DayPlanPanelActions }) {
  const [open, setOpen] = useState(false)
  const unhomed = !!entry.routine
  const items: ReactNode[] = []
  if (unhomed) {
    if (actions.changeRoutineRule) {
      items.push(
        <button
          key="rule"
          type="button"
          role="menuitem"
          aria-label={`Change repeating schedule for ${entry.title}`}
          onClick={() => { setOpen(false); actions.changeRoutineRule?.(entry) }}
          className="w-full px-3 py-1.5 text-left text-[13px] text-neutral-700 hover:bg-neutral-50"
        >
          Change repeating schedule
        </button>,
      )
    }
  } else {
    items.push(
      <SchedulePopover
        key="schedule"
        itemTitle={entry.title}
        // A routine occurrence moves to another day only with a time (the
        // one-day override); a task may take a day or a time.
        skipToTime={entry.kind === 'routine'}
        value={entry.kind === 'routine' ? day : undefined}
        onSchedule={(when, isAllDay) => { setOpen(false); actions.schedule(entry, when, isAllDay) }}
        onDefer={entry.kind === 'task'
          ? (target) => { setOpen(false); if (target === 'week' || target === 'month') actions.commit(entry, target) }
          : undefined}
        trigger={
          <button
            type="button"
            role="menuitem"
            aria-label={`Schedule ${entry.title}`}
            className="w-full px-3 py-1.5 text-left text-[13px] text-neutral-700 hover:bg-neutral-50"
          >
            Schedule…
          </button>
        }
      />,
    )
    if (entry.kind === 'task' && actions.someday) {
      items.push(
        <button
          key="someday"
          type="button"
          role="menuitem"
          aria-label={`Move ${entry.title} to Someday`}
          onClick={() => { setOpen(false); actions.someday?.(entry) }}
          className="w-full px-3 py-1.5 text-left text-[13px] text-neutral-700 hover:bg-neutral-50"
        >
          Someday
        </button>,
      )
    }
    if (entry.kind === 'task' && actions.remove) {
      items.push(
        <button
          key="delete"
          type="button"
          role="menuitem"
          aria-label={`Delete ${entry.title}`}
          onClick={() => { setOpen(false); actions.remove?.(entry) }}
          className="w-full px-3 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50"
        >
          Delete
        </button>,
      )
    }
  }
  if (items.length === 0) return null
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={`More for ${entry.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" aria-hidden onClick={() => setOpen(false)} />
          <div
            role="menu"
            aria-label={`Moves for ${entry.title}`}
            className="absolute right-0 top-full z-20 mt-1 w-52 rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
          >
            {items}
          </div>
        </>
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

function PlanRow({ entry, day, actions, draggable, weekPage = null }: {
  entry: DayPlanEntry
  day: Date
  actions: DayPlanPanelActions
  draggable: boolean
  weekPage?: Date | null
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
  const verbForWeek = unfinished && weekPage !== null
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
        <RowTitle entry={entry} open={actions.open} />
        {entry.planned && !entry.completed && <span className="block text-[11.5px] text-primary-700">Planned today</span>}
        {entry.context && <span className="block text-[11.5px] text-neutral-500">{entry.context}</span>}
      </div>
      {entry.completed ? null : entry.planned ? (
        <button
          type="button"
          aria-label={`Move ${entry.title} back off today`}
          title="Move back — it stays here, unplanned"
          onClick={() => actions.unchoose(entry)}
          className="shrink-0 rounded px-1.5 py-0.5 text-[12px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
        >
          Undo
        </button>
      ) : (
        <div className="flex shrink-0 items-center gap-0.5">
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
          <RowMenu entry={entry} day={day} actions={actions} />
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
function ChooserRow({ entry, day, actions, draggable }: {
  entry: DayPlanEntry
  day: Date
  actions: DayPlanPanelActions
  draggable: boolean
}) {
  const canDrag = draggable && !entry.completed && !entry.planned && !entry.onToday
  const unhomed = !!entry.routine
  const picked = entry.planned && !entry.onToday
  const pillAria = `${picked ? 'Unchoose' : 'Choose'} ${entry.title} for today`
  return (
    <li
      className="group flex items-start gap-2.5 text-[14px]"
      draggable={canDrag}
      onDragStart={canDrag ? (e) => writePlanDrag(e.dataTransfer, {
        kind: entry.kind, id: entry.id, date: localYmd(day), title: entry.title,
      }) : undefined}
      data-plan-key={entry.key}
    >
      {canDrag
        ? <GripVertical aria-hidden="true" className="mt-[3px] h-3.5 w-3.5 shrink-0 cursor-grab text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100" />
        : <span aria-hidden="true" className="w-3.5 shrink-0" />}
      {entry.kind === 'routine' && (
        <Repeat aria-hidden="true" className="mt-[4px] h-3.5 w-3.5 shrink-0 text-neutral-400" />
      )}
      <div className="min-w-0 flex-1">
        <RowTitle entry={entry} open={actions.open} />
        {entry.context && <span className="chooser-cadence">{entry.context}</span>}
        {entry.onToday && !entry.completed && <span className="chooser-status">On today's schedule</span>}
        {entry.completed && <span className="chooser-status">Completed</span>}
      </div>
      {entry.completed || entry.onToday ? null : (
        <div className="flex shrink-0 items-center gap-0.5">
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
          <RowMenu entry={entry} day={day} actions={actions} />
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
function ChooserSection({ id, title, note, icon, entries, day, actions, draggable, empty, open, onToggle, hideCompleted, allDone }: {
  id: string
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
  const shown = all ? ordered : ordered.slice(0, PLAN_GROUP_CAP)
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
                {shown.map((e) => <ChooserRow key={e.key} entry={e} day={day} actions={actions} draggable={draggable} />)}
              </ul>
              {!all && ordered.length > PLAN_GROUP_CAP && (
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
function Rows({ entries, day, actions, draggable, weekPage, cap }: {
  entries: DayPlanEntry[]
  day: Date
  actions: DayPlanPanelActions
  draggable: boolean
  weekPage: Date | null
  cap: number | null
}) {
  const [all, setAll] = useState(false)
  // Outstanding first, then chosen, then done: the ones asking for a decision lead.
  const ordered = [...entries].sort((a, b) => rank(a) - rank(b))
  const shown = all || cap === null ? ordered : ordered.slice(0, cap)
  return (
    <>
      <ul className="day-plan-rows mt-1 border-t border-neutral-200/80">
        {shown.map((e) => <PlanRow key={e.key} entry={e} day={day} actions={actions} draggable={draggable} weekPage={weekPage} />)}
      </ul>
      {!all && cap !== null && ordered.length > cap && (
        <button type="button" onClick={() => setAll(true)} className="py-1.5 text-[13px] text-neutral-500 hover:text-neutral-800">
          Show {ordered.length - cap} more
        </button>
      )}
    </>
  )
}

function Group({ title, entries, day, actions, draggable, defaultOpen, empty, cap = PLAN_GROUP_CAP, open: openProp, onOpenChange, count = true, weekPage = null }: {
  title: string
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
            <Rows entries={entries} day={day} actions={actions} draggable={draggable} weekPage={weekPage} cap={cap} />
          )}
        </div>
      )}
    </div>
  )
}

/** Unfinished work from earlier, on request — the ONE entrance to it. The
 *  fold's state is shared through planningPanelSignal and session-scoped, so
 *  tomorrow the list is the week's own work again. No count on the toggle —
 *  no scoreboard. Misses older than the window are not listed, but they are
 *  not lost: the fold's last line points at where they live, so there is no
 *  second door beside the first. */
function UnfinishedFold({ entries, older, day, actions, draggable, weekPage, cap }: {
  entries: DayPlanEntry[]
  older: number
  day: Date
  actions: DayPlanPanelActions
  draggable: boolean
  weekPage: Date | null
  cap: number | null
}) {
  const [open, setOpen] = useState(() => readUnfinishedOpen())
  useEffect(() => onUnfinishedOpenChange(setOpen), [])
  if (entries.length === 0 && older === 0) return null
  const id = 'plan-group-unfinished'
  const toggle = () => { setOpen(!open); writeUnfinishedOpen(!open) }
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
        className="inline-flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-500 hover:text-neutral-800"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Unfinished from earlier
      </button>
      {open && (
        <div id={id}>
          {entries.length > 0 && (
            <Rows entries={entries} day={day} actions={actions} draggable={draggable} weekPage={weekPage} cap={cap} />
          )}
          {older > 0 && (
            <a href="/inbox#expired" className="mt-2 block w-fit text-[12.5px] text-neutral-500 hover:text-neutral-800">
              Older unfinished work is in Inbox →
            </a>
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
function TodayChooser({ plan, day, actions, draggable, cap }: {
  plan: DayPlan
  day: Date
  actions: DayPlanPanelActions
  draggable: boolean
  cap: number | null
}) {
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
    <div data-testid="day-plan-panel">
      {(anyDone || hideCompleted) && (
        <div className="chooser-toolbar">
          <button type="button" aria-pressed={hideCompleted} onClick={toggleHide} className="chooser-toggle">
            {hideCompleted ? 'Show completed' : 'Hide completed'}
          </button>
        </div>
      )}
      <ChooserSection
        id="week"
        title="This week's tasks"
        note={formatWeekRangeShort(weekStart)}
        entries={tasks}
        day={day}
        actions={actions}
        draggable={draggable}
        open={!folded.week}
        onToggle={() => toggle('week')}
        hideCompleted={hideCompleted}
        empty={
          <>
            <span>No tasks on this week's list yet.</span>
            {/* A plain anchor, like the fold's Inbox link: this panel is
                drawn inside and outside the router. */}
            <a href="/week">Plan your week →</a>
          </>
        }
        allDone={<span>Everything on this week's list is done.</span>}
      />
      {routines.length > 0 && (
        <ChooserSection
          id="routines"
          title="Routines"
          note="For today"
          icon={<Repeat aria-hidden="true" className="h-3.5 w-3.5" />}
          entries={routines}
          day={day}
          actions={actions}
          draggable={draggable}
          open={!folded.routines}
          onToggle={() => toggle('routines')}
          hideCompleted={hideCompleted}
          allDone={<span>Every routine for today is done.</span>}
        />
      )}
      <UnfinishedFold entries={plan.unfinished ?? []} older={plan.olderUnfinished ?? 0} day={day} actions={actions} draggable={draggable} weekPage={null} cap={cap} />
      <p className="chooser-foot">Choices stay on your week's list.<br />Routine choices apply to this occurrence only.</p>
    </div>
  )
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
  const cap = weekPage !== null ? null : PLAN_GROUP_CAP
  if (weekPage === null) {
    return <TodayChooser plan={plan} day={day} actions={actions} draggable={draggable} cap={cap} />
  }
  return (
    <div data-testid="day-plan-panel">
      <Group
        title="To plan"
        entries={plan.toPlan ?? []}
        day={day}
        actions={actions}
        draggable={draggable}
        weekPage={weekPage}
        defaultOpen
        count={false}
        cap={cap}
        empty={
          // An empty week's list is an empty week's list — it says so and
          // offers the one thing that fills it, never the backlog.
          <>
            <span>Nothing on this week's list yet.</span>
            {actions.addTask && (
              <button type="button" onClick={actions.addTask} className="ml-2 text-primary-700 hover:text-primary-900">
                Add to this week
              </button>
            )}
          </>
        }
      />
      {/* A task dated today is on Today's page (scheduling is sufficient,
          focus never gates visibility — Scott, 2026-09-21). Nothing dated
          waits here. */}
      <UnfinishedFold entries={plan.unfinished ?? []} older={plan.olderUnfinished ?? 0} day={day} actions={actions} draggable={draggable} weekPage={weekPage} cap={cap} />
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
    remove?: (taskId: string, title: string) => void
  } = {},
): DayPlanPanelActions {
  const payload = (e: DayPlanEntry) => ({ kind: e.kind, id: e.id, date: localYmd(day), title: e.title })
  return {
    choose: (e) => { void (e.kind === 'task' ? a.chooseTaskDay(e.id, day) : a.chooseRoutine(e.id, day, true, e.title)) },
    unchoose: (e) => { void (e.kind === 'task' ? a.unchooseTask(e.id, day) : a.chooseRoutine(e.id, day, false, e.title)) },
    complete: (e) => { if (e.kind === 'task') a.toggleTask(e.id); else void a.completeRoutine(e.id, day, !e.completed) },
    schedule: (e, when, isAllDay) => {
      void a.drop(payload(e), isAllDay ? { type: 'day', day: when } : { type: 'time', when })
    },
    commit: (e, period) => { if (e.kind === 'task') void a.commitTask(e.id, period) },
    someday: (e) => { if (e.kind === 'task') void a.somedayTask(e.id) },
    addTask: () => requestQuickAdd(),
    placeRoutine: (e, when) => { void a.placeRoutineOnce(e.id, when, e.title) },
    changeRoutineRule: opts.changeRoutineRule ? (e) => opts.changeRoutineRule?.(e.id) : undefined,
    open: opts.open ? (e) => opts.open?.(e.kind, e.id) : undefined,
    remove: opts.remove ? (e) => { if (e.kind === 'task') opts.remove?.(e.id, e.title) } : undefined,
  }
}
