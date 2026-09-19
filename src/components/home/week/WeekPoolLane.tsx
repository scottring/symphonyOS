//
// /week's list — THIS WEEK'S LIST, not a pool to drain. It stands in a column
// to the LEFT of the grid (between the side nav and the days), the month list
// folded beneath it for reference. One list, no view tabs: the backlog is Inbox, and
// unhomed routines ride here (poolViews decides; this only renders). A ticked pill
// lingers struck-through so the week reads as a list with things done on it;
// what last week left unfinished waits, collapsed, at the foot — carrying it
// forward is a deliberate act, row by row, never an automatic roll-over
// (Scott, 2026-09-05: "we're not trying to make the weekly list disappear";
// 2026-09-19: deliberate carryover, collapsed). Pills speak the week grid's chip
// protocol ({kind:'chip', taskId}), so useWeekDragDrop's existing branches
// place them with undo attached — the lane adds no drop logic of its own.
//
// Each pill also carries the overlay drawer's basic triage: complete (the
// leading circle), "not this week" (→ next week's plan), and the defer
// dropdown. The column caps at STRIP_CAP loose pills with a "+N more"
// expander so a deep backlog never runs off the bottom of the grid.
import { useMemo, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Check, ChevronDown, ChevronRight, ChevronsRight, CookingPot, GripVertical, Repeat, Trash2, Archive, ArrowRight } from 'lucide-react'
import type { Task } from '@/types/task'
import type { Routine } from '@/types/actionable'
import { routineTemporalLabel } from '@/lib/planning/routineTemporal'
import { unscheduledPool, weekList, orderPool, groupPool } from '@/lib/planning/poolViews'
import { PushDropdown } from '@/components/triage'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { isPlacedOnWeek, isStaleWeekPlacement } from '@/lib/today/weekPlacement'
import { isMissedPlacement, missedLabel } from '@/lib/week/missedPlacement'
import { planDropHandlers, type PlanDragPayload } from '@/lib/planning/planDrag'

// Loose pills visible before the "+N more" expander.
const STRIP_CAP = 8
// Routines get their OWN allowance rather than sharing the tasks' budget. With
// 34 loose tasks a shared cap spent every slot on tasks and showed no routine
// at all — which is the segregation this change exists to end (Scott,
// 2026-09-05). Costs at most a few rows; nothing is taken from the tasks.
const ROUTINE_STRIP_CAP = 4

// A pill is a dnd-kit drag handle end-to-end, so inline buttons must stop the
// pointer BEFORE the sensor arms a drag (same guard as the overlay cards).
const stopDrag = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
}

interface PillProps {
  task: Task
  onSelect: (id: string) => void
  onCompleteTask?: (id: string) => void
  onNotThisWeek?: (id: string) => void
  onPushTask?: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  /** Done: rendered struck-through, no actions, not draggable. */
  struck?: boolean
  /** Last-week look-back verbs on an unticked row. Not draggable while shown. */
  lookback?: { onCarryForward: () => void; onDrop: () => void; onSomeday: () => void }
  /** Off on touch-width layouts, where a drag handle would swallow the scroll. */
  dragEnabled?: boolean
}

function PoolPill({ task, onSelect, onCompleteTask, onNotThisWeek, onPushTask, struck, lookback, dragEnabled = true }: PillProps) {
  // The hook is unconditional (rules of hooks); whether the pill is a drag
  // handle is decided by what gets spread.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool:${task.id}`,
    data: { kind: 'chip', taskId: task.id },
  })
  const draggable = dragEnabled && !struck && !lookback
  const dragProps = draggable ? { ...attributes, ...listeners } : {}
  // One ruled line per row, the way a paper list reads (Scott, 2026-09-19:
  // "not a wall of tall cards"). The title wraps to two lines, never
  // truncated to one; the whole thing is a click away in the detail panel,
  // notes included. The verbs stay in plain view at the row's end — they
  // are read, not hovered (2026-09-06).
  const showLookback = !!lookback && !struck
  const showTriage = !struck && !lookback && (!!onNotThisWeek || !!onPushTask)
  // A card whose day passed without a tick is back on the list, and says so.
  // The day it was given is the whole message — no count, no scoreboard.
  const missed = isMissedPlacement(task.scheduledFor, task.completed, new Date())
  return (
    <div
      ref={setNodeRef}
      {...dragProps}
      // Prefixed, like every other selectable id on this grid: the host parses
      // "<kind>-<id>" and drops anything it can't classify, so a bare uuid
      // opened no panel at all.
      onClick={() => onSelect(`task-${task.id}`)}
      title={task.title}
      className={`group flex w-full items-start gap-2 border-b border-neutral-200/80 py-1.5 text-[14px] text-neutral-700 transition-colors hover:bg-neutral-50 ${
        draggable ? 'touch-none cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      {struck ? (
        <span className="mt-[4px] shrink-0 w-3 h-3 rounded-full bg-neutral-400 text-white grid place-items-center">
          <Check className="w-2 h-2" strokeWidth={3} />
        </span>
      ) : onCompleteTask && !lookback ? (
        <button
          type="button"
          aria-label={`Complete ${task.title}`}
          title="Mark complete"
          {...stopDrag}
          onClick={(e) => { e.stopPropagation(); onCompleteTask(task.id) }}
          className="mt-[4px] shrink-0 w-3 h-3 rounded-full border border-neutral-400 text-transparent grid place-items-center cursor-pointer transition-colors hover:border-primary-500 hover:bg-primary-500 hover:text-white"
        >
          <Check className="w-2 h-2" strokeWidth={3} />
        </button>
      ) : (
        <span className="mt-[8px] shrink-0 w-1 h-1 rounded-full bg-neutral-400" />
      )}
      <div className="min-w-0 flex-1">
        <span className={`leading-snug break-words line-clamp-2 ${struck ? 'line-through text-neutral-400' : ''}`}>{task.title}</span>
        {missed && !struck && (
          <span className="block text-[11px] text-neutral-400">{missedLabel(task.scheduledFor!, new Date())}</span>
        )}
        {showLookback && (
          <div className="mt-0.5 flex items-center gap-0.5 -ml-0.5" {...stopDrag}>
            <button type="button" aria-label={`Carry forward ${task.title}`} title="Carry forward to this week"
              onClick={(e) => { e.stopPropagation(); lookback.onCarryForward() }}
              className="p-0.5 rounded text-primary-600 hover:bg-primary-50">
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button type="button" aria-label={`Someday ${task.title}`} title="Someday"
              onClick={(e) => { e.stopPropagation(); lookback.onSomeday() }}
              className="p-0.5 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100">
              <Archive className="w-3.5 h-3.5" />
            </button>
            <button type="button" aria-label={`Drop ${task.title}`} title="Drop"
              onClick={(e) => { e.stopPropagation(); lookback.onDrop() }}
              className="p-0.5 rounded text-neutral-300 hover:text-red-600 hover:bg-red-50">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      {showTriage && (
        <div className="flex shrink-0 items-center text-neutral-400" {...stopDrag}>
          {onNotThisWeek && (
            <button
              type="button"
              aria-label={`Not this week — move ${task.title} to next week`}
              title="Not this week — move to next week"
              onClick={(e) => { e.stopPropagation(); onNotThisWeek(task.id) }}
              className="shrink-0 p-0.5 rounded cursor-pointer hover:text-neutral-700 hover:bg-neutral-100"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          )}
          {onPushTask && (
            <div className="shrink-0">
              <PushDropdown size="sm" onPush={(target) => onPushTask(task.id, target)} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// A routine that needs a home — quiet, with its temporal gap spelled out.
// Drags with its own protocol where there are slots to land on; drops open
// the place-scope popover instead of writing directly.
function RoutinePill({ routine, onSelect, draggable }: { routine: Routine; onSelect: (id: string) => void; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `poolroutine:${routine.id}`,
    data: { kind: 'routineChip', routineId: routine.id },
    disabled: !draggable,
  })
  return (
    <div
      ref={setNodeRef}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      onClick={() => onSelect(`routine-${routine.id}`)}
      title={routine.name}
      className={`flex w-full items-start gap-1.5 border-b border-neutral-200/80 py-1.5 transition-colors hover:bg-neutral-50 ${
        draggable ? 'touch-none cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      {draggable
        ? <GripVertical className="mt-[3px] w-3 h-3 shrink-0 text-neutral-300" />
        : <Repeat className="mt-[3px] w-3 h-3 shrink-0 text-neutral-300" />}
      <span className="min-w-0 flex-1 flex flex-col">
        <span className="leading-snug break-words text-[13.5px] text-neutral-600">{routine.name}</span>
        <span className="text-[11px] text-neutral-400">{routineTemporalLabel(routine)}</span>
      </span>
    </div>
  )
}

export function WeekPoolLane({
  tasks, routines = [], weekStart, dayCount, onSelectItem, onCompleteTask, onNotThisWeek, onPushTask,
  onUpdateTask, onDeleteTask, foldWeeks = [], dragEnabled = true, routinesDraggable = true, onPlanDrop,
}: {
  tasks: Task[]
  /** Routines that need a home — ALREADY filtered by the host through
   *  unhomedRoutines() (eligibility runs the one resolver ladder there). */
  routines?: Routine[]
  weekStart: Date
  dayCount: number
  onSelectItem: (id: string) => void
  onCompleteTask?: (id: string) => void
  onNotThisWeek?: (id: string) => void
  onPushTask?: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  /** Last-week look-back writes: carry forward (a week→week MOVE) and Someday. */
  onUpdateTask?: (id: string, updates: Partial<Task>) => void | Promise<unknown>
  /** Last-week look-back: Drop. */
  onDeleteTask?: (id: string) => void
  /** Weeks the grid's range reaches into besides the current one (week-start
   *  dates, from foldWeeksFor). Each folds its PLACED rows beneath the list —
   *  this week's plan stays on top, the touched week is a fold like the month. */
  foldWeeks?: Date[]
  /** Rows can be picked up. Off on touch-width layouts. */
  dragEnabled?: boolean
  /** Routine rows can be picked up — only where there are time slots to
   *  drop them on (a routine needs a time; a journal day has none). */
  routinesDraggable?: boolean
  /** A row dragged out of the Today pin, dropped on the list: commit it to
   *  the week (no day invented). */
  onPlanDrop?: (payload: PlanDragPayload) => void
}) {
  const [planOver, setPlanOver] = useState(false)
  const planProps = onPlanDrop ? planDropHandlers(onPlanDrop, setPlanOver) : {}
  const [open, setOpen] = useState(true)
  const [mealsOpen, setMealsOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [carryOpen, setCarryOpen] = useState(false)
  // Ticked pills stay, struck, until the strip is collapsed or the view changes
  // — the list reads as a list with things done on it, not one that shrinks.
  const [lingering, setLingering] = useState<Task[]>([])

  // The pool plans MY time — scope candidates to the current member.
  const { getCurrentUserMember } = useFamilyMembers()
  const meId = getCurrentUserMember()?.id ?? null

  const pool = useMemo(() => {
    const rangeEnd = new Date(weekStart)
    rangeEnd.setDate(rangeEnd.getDate() + dayCount - 1)
    const ctx = {
      today: new Date(),
      rangeStart: weekStart,
      rangeEnd,
      weekStartsOn: readCadenceConfig().weekStartsOn,
      meId,
    }
    const grouped = groupPool(orderPool(weekList(unscheduledPool(tasks, ctx), ctx), ctx))
    // A move left behind by a week that has passed is not silently this
    // week's: it waits in the collapsed carryover below until someone carries
    // it forward, parks it or drops it (Scott, 2026-09-19).
    const currentWeek = weekStartAnchor(ctx.today, ctx.weekStartsOn)
    const leftBehind = (t: Task) => t.bucket === 'week' && isStaleWeekPlacement(t, currentWeek)
    return {
      meals: grouped.meals.filter((t) => !leftBehind(t)),
      loose: grouped.loose.filter((t) => !leftBehind(t)),
      currentWeek,
    }
  }, [tasks, weekStart, dayCount, meId])

  // A routine with no time needs a slot the way an unscheduled task does, so
  // it rides in the same strip. The host hands over only unhomed ones.
  const needsHome = routines
  const total = pool.meals.length + pool.loose.length + needsHome.length
  const visibleLoose = showAll ? pool.loose : pool.loose.slice(0, STRIP_CAP)
  const visibleRoutines = showAll ? needsHome : needsHome.slice(0, ROUTINE_STRIP_CAP)
  const overflow = (pool.loose.length - visibleLoose.length) + (needsHome.length - visibleRoutines.length)

  const tick = onCompleteTask
    ? (id: string) => {
        const t = tasks.find((x) => x.id === id)
        if (t) setLingering((l) => (l.some((x) => x.id === id) ? l : [...l, t]))
        onCompleteTask(id)
      }
    : undefined
  const pillProps = { onSelect: onSelectItem, onCompleteTask: tick, onNotThisWeek, onPushTask, dragEnabled }
  // Lingering pills are the ones the pool no longer holds (the host completed them).
  const struckPills = lingering.filter((t) => !pool.loose.some((p) => p.id === t.id) && !pool.meals.some((p) => p.id === t.id))

  // What past weeks left unfinished: moves placed on a week that has gone by
  // and never ticked (weekPlacement's "left-behind"). Strict placement on
  // purpose — a legacy row with no week of its own is still this week's.
  const unfinished = tasks.filter((t) => !t.completed && t.bucket === 'week' && isStaleWeekPlacement(t, pool.currentWeek))
  const prevWeek = new Date(pool.currentWeek)
  prevWeek.setDate(prevWeek.getDate() - 7)
  const carryLabel = unfinished.every((t) => isPlacedOnWeek(t, prevWeek)) ? 'Unfinished last week' : 'Unfinished from past weeks'
  const lookbackFor = (t: Task) => ({
    // Onto the CURRENT week — the list's week — not the first day on screen,
    // which may be a weekend's Saturday.
    onCarryForward: () => { void onUpdateTask?.(t.id, { bucket: 'week', scheduledFor: undefined, weekStart: pool.currentWeek }) },
    onDrop: () => { onDeleteTask?.(t.id) },
    onSomeday: () => { void onUpdateTask?.(t.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined }) },
  })

  return (
    <>
    <div {...planProps} className={`border-t border-neutral-300 pt-2.5${planOver ? ' reference-list-drop' : ''}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => { setOpen((v) => !v); setLingering([]) }}
        className="inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase text-neutral-500 hover:text-neutral-700 transition-colors"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        This week · {total}
      </button>
      {open && (
        <div className="mt-1.5 flex flex-col items-stretch border-t border-neutral-200/80">
          {pool.meals.length > 0 && (
            <button
              type="button"
              aria-expanded={mealsOpen}
              onClick={() => setMealsOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 border-b border-neutral-200/80 py-1.5 text-[13px] text-neutral-500 hover:text-neutral-800 transition-colors"
            >
              <CookingPot className="w-3.5 h-3.5" /> Meals · {pool.meals.length}
            </button>
          )}
          {mealsOpen && pool.meals.map((t) => <PoolPill key={t.id} task={t} {...pillProps} />)}
          {visibleLoose.map((t) => <PoolPill key={t.id} task={t} {...pillProps} />)}
          {struckPills.map((t) => <PoolPill key={`struck-${t.id}`} task={{ ...t, completed: true }} onSelect={onSelectItem} struck />)}
          {visibleRoutines.map((r) => <RoutinePill key={r.id} routine={r} onSelect={onSelectItem} draggable={dragEnabled && routinesDraggable} />)}
          {overflow > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="py-1.5 text-left text-[13px] text-neutral-500 hover:text-neutral-800 transition-colors"
            >
              +{overflow} more
            </button>
          )}
          {showAll && pool.loose.length > STRIP_CAP && (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="py-1.5 text-left text-[13px] text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              Show less
            </button>
          )}
          {total === 0 && struckPills.length === 0 && <span className="py-1.5 text-sm text-neutral-400">Nothing on the list yet.</span>}
        </div>
      )}
      {unfinished.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            aria-expanded={carryOpen}
            onClick={() => setCarryOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-[12px] text-neutral-500 hover:text-neutral-800 transition-colors"
          >
            {carryOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {carryLabel} · {unfinished.length}
          </button>
          {carryOpen && (
            <div className="mt-1 flex flex-col items-stretch border-t border-neutral-200/80">
              {unfinished.map((t) => (
                <PoolPill key={t.id} task={t} onSelect={onSelectItem} lookback={lookbackFor(t)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
    {foldWeeks.map((w) => (
      <WeekFold key={w.getTime()} weekStart={w} tasks={tasks} onSelectItem={onSelectItem} pillProps={pillProps} />
    ))}
    </>
  )
}

// A touched week's placed rows, folded beneath the list. Strict membership on
// purpose (a legacy NULL row is the current week's). Pills keep the chip drag
// protocol, so a row drags onto its own days on the grid.
function WeekFold({ weekStart, tasks, onSelectItem, pillProps }: {
  weekStart: Date
  tasks: Task[]
  onSelectItem: (id: string) => void
  pillProps: Pick<PillProps, 'onSelect' | 'onCompleteTask' | 'onNotThisWeek' | 'onPushTask' | 'dragEnabled'>
}) {
  const [open, setOpen] = useState(true)
  const rows = tasks.filter((t) => t.bucket === 'week' && !t.completed && isPlacedOnWeek(t, weekStart))
  const label = `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  return (
    <div className="border-t border-neutral-200 pt-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase text-neutral-500 hover:text-neutral-700 transition-colors"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {label}
      </button>
      {open && (
        <div className="mt-1.5 flex flex-col items-stretch border-t border-neutral-200/80">
          {rows.map((t) => <PoolPill key={t.id} task={t} {...pillProps} onSelect={onSelectItem} />)}
          {rows.length === 0 && <span className="py-1.5 text-sm text-neutral-400">Nothing planned for that week yet.</span>}
        </div>
      )}
    </div>
  )
}
