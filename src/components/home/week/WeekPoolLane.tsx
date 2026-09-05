//
// /week's list — THIS WEEK'S LIST, not a pool to drain. It stands in a column
// to the LEFT of the grid (between the side nav and the days), the month list
// folded beneath it for reference. One list, no view tabs: the backlog is Inbox, and
// unhomed routines ride here (poolViews decides; this only renders). A ticked pill
// lingers struck-through so the week reads as a list with things done on it;
// "Last week" swaps in the previous week's rows for the weekly look-back
// (Scott, 2026-09-05: "we're not trying to make the weekly list disappear"). Pills speak the week grid's chip
// protocol ({kind:'chip', taskId}), so useWeekDragDrop's existing branches
// place them with undo attached — the lane adds no drop logic of its own.
//
// Each pill also carries the overlay drawer's basic triage: complete (the
// leading circle), "not this week" (→ next week's plan), and the defer
// dropdown. The column caps at STRIP_CAP loose pills with a "+N more"
// expander so a deep backlog never runs off the bottom of the grid.
import { useMemo, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Check, ChevronDown, ChevronRight, ChevronsRight, CookingPot, GripVertical, Trash2, Archive, ArrowRight } from 'lucide-react'
import type { Task } from '@/types/task'
import type { Routine } from '@/types/actionable'
import { routineTemporalLabel } from '@/lib/planning/routineTemporal'
import { unscheduledPool, weekList, orderPool, groupPool } from '@/lib/planning/poolViews'
import { PushDropdown } from '@/components/triage'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { readCadenceConfig } from '@/lib/cadence/config'
import { isPlacedOnWeek } from '@/lib/today/weekPlacement'

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
}

function PoolPill({ task, onSelect, onCompleteTask, onNotThisWeek, onPushTask, struck, lookback }: PillProps) {
  // The hook is unconditional (rules of hooks); whether the pill is a drag
  // handle is decided by what gets spread.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool:${task.id}`,
    data: { kind: 'chip', taskId: task.id },
  })
  const draggable = !struck && !lookback
  const dragProps = draggable ? { ...attributes, ...listeners } : {}
  return (
    <div
      ref={setNodeRef}
      {...dragProps}
      // Prefixed, like every other selectable id on this grid: the host parses
      // "<kind>-<id>" and drops anything it can't classify, so a bare uuid
      // opened no panel at all.
      onClick={() => onSelect(`task-${task.id}`)}
      title={task.title}
      className={`group flex w-full items-center gap-1.5 rounded-lg border border-neutral-200 bg-white pl-2 pr-1.5 py-1.5 text-[13px] text-neutral-700 touch-none hover:border-neutral-300 hover:shadow-sm transition-all ${
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      {struck ? (
        <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-primary-500 text-white grid place-items-center">
          <Check className="w-2.5 h-2.5" strokeWidth={3} />
        </span>
      ) : onCompleteTask && !lookback ? (
        <button
          type="button"
          aria-label={`Complete ${task.title}`}
          title="Mark complete"
          {...stopDrag}
          onClick={(e) => { e.stopPropagation(); onCompleteTask(task.id) }}
          className="shrink-0 w-3.5 h-3.5 rounded-full border-[1.5px] border-primary-400/60 text-transparent grid place-items-center cursor-pointer transition-colors hover:border-primary-500 hover:bg-primary-500 hover:text-white"
        >
          <Check className="w-2.5 h-2.5" strokeWidth={3} />
        </button>
      ) : (
        <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary-400/70" />
      )}
      <span className={`min-w-0 flex-1 truncate ${struck ? 'line-through text-neutral-400' : ''}`}>{task.title}</span>
      {lookback && !struck && (
        <span className="shrink-0 inline-flex items-center gap-0.5 ml-1" {...stopDrag}>
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
        </span>
      )}
      {onNotThisWeek && !struck && !lookback && (
        <button
          type="button"
          aria-label={`Not this week — move ${task.title} to next week`}
          title="Not this week — move to next week"
          {...stopDrag}
          onClick={(e) => { e.stopPropagation(); onNotThisWeek(task.id) }}
          className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      )}
      {onPushTask && !struck && !lookback && (
        <div
          className="shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
          {...stopDrag}
        >
          <PushDropdown size="sm" onPush={(target) => onPushTask(task.id, target)} />
        </div>
      )}
    </div>
  )
}

// A routine that needs a home — cream so it reads as routine material, with
// its temporal gap spelled out. Drags with its own protocol; drops open the
// place-scope popover instead of writing directly.
function RoutinePill({ routine, onSelect }: { routine: Routine; onSelect: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `poolroutine:${routine.id}`,
    data: { kind: 'routineChip', routineId: routine.id },
  })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(`routine-${routine.id}`)}
      title={routine.name}
      className={`flex w-full items-center gap-1.5 rounded-lg border border-[hsl(42_50%_80%)] bg-[hsl(45_75%_90%)] pl-1.5 pr-2.5 py-1.5 touch-none cursor-grab active:cursor-grabbing hover:shadow-sm transition-all ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <GripVertical className="w-3.5 h-3.5 shrink-0 text-[hsl(40_30%_60%)]" />
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[hsl(40_60%_30%)]">{routine.name}</span>
      <span className="shrink-0 text-[11px] text-[hsl(38_25%_45%)]">{routineTemporalLabel(routine)}</span>
    </div>
  )
}

export function WeekPoolLane({
  tasks, routines = [], weekStart, dayCount, onSelectItem, onCompleteTask, onNotThisWeek, onPushTask,
  onUpdateTask, onDeleteTask,
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
}) {
  const [open, setOpen] = useState(true)
  const [mealsOpen, setMealsOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [lastWeek, setLastWeek] = useState(false)
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
    return groupPool(orderPool(weekList(unscheduledPool(tasks, ctx), ctx), ctx))
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
  const pillProps = { onSelect: onSelectItem, onCompleteTask: tick, onNotThisWeek, onPushTask }
  // Lingering pills are the ones the pool no longer holds (the host completed them).
  const struckPills = lingering.filter((t) => !pool.loose.some((p) => p.id === t.id) && !pool.meals.some((p) => p.id === t.id))

  // Last week's list: rows explicitly placed on the previous week, ticked AND
  // unticked. Strict membership on purpose — a legacy NULL row was always
  // "the current week", so it has no business appearing as last week's.
  const prevWeekStart = new Date(weekStart)
  prevWeekStart.setDate(prevWeekStart.getDate() - 7)
  const lastWeekRows = lastWeek
    ? tasks.filter((t) => t.bucket === 'week' && isPlacedOnWeek(t, prevWeekStart))
    : []
  const lookbackFor = (t: Task) => ({
    onCarryForward: () => { void onUpdateTask?.(t.id, { bucket: 'week', scheduledFor: undefined, weekStart }) },
    onDrop: () => { onDeleteTask?.(t.id) },
    onSomeday: () => { void onUpdateTask?.(t.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined }) },
  })
  const headerLabel = lastWeek ? 'Last week' : 'This week'
  const headerCount = lastWeek ? lastWeekRows.length : total

  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { setOpen((v) => !v); setLingering([]) }}
          className="inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase text-neutral-500 hover:text-neutral-700 transition-colors"
        >
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          {headerLabel} · {headerCount}
        </button>
        {(
          <button
            type="button"
            aria-pressed={lastWeek}
            onClick={() => setLastWeek((v) => !v)}
            className={`ml-3 rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
              lastWeek ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            Last week
          </button>
        )}
      </div>
      {open && lastWeek && (
        <div className="mt-2 flex flex-col items-stretch gap-1">
          {lastWeekRows.map((t) => (
            <PoolPill key={t.id} task={t} onSelect={onSelectItem} struck={t.completed} lookback={t.completed ? undefined : lookbackFor(t)} />
          ))}
          {lastWeekRows.length === 0 && <span className="text-sm text-neutral-400">Nothing was on last week's list.</span>}
        </div>
      )}
      {open && !lastWeek && (
        <div className="mt-2 flex flex-col items-stretch gap-1">
          {pool.meals.length > 0 && (
            <button
              type="button"
              onClick={() => setMealsOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[13px] text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              <CookingPot className="w-3.5 h-3.5" /> Meals · {pool.meals.length}
            </button>
          )}
          {mealsOpen && pool.meals.map((t) => <PoolPill key={t.id} task={t} {...pillProps} />)}
          {visibleLoose.map((t) => <PoolPill key={t.id} task={t} {...pillProps} />)}
          {struckPills.map((t) => <PoolPill key={`struck-${t.id}`} task={{ ...t, completed: true }} onSelect={onSelectItem} struck />)}
          {visibleRoutines.map((r) => <RoutinePill key={r.id} routine={r} onSelect={onSelectItem} />)}
          {overflow > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="flex w-full items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-1.5 text-[13px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
            >
              +{overflow} more
            </button>
          )}
          {showAll && pool.loose.length > STRIP_CAP && (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="flex w-full items-center justify-center rounded-lg px-2 py-1.5 text-[13px] text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              Show less
            </button>
          )}
          {total === 0 && struckPills.length === 0 && <span className="text-sm text-neutral-400">Nothing on the list yet.</span>}
        </div>
      )}
    </div>
  )
}
