//
// /week's Unscheduled pool — the same official views as the overlay drawer
// (poolViews decides; this only renders). Pills speak the week grid's chip
// protocol ({kind:'chip', taskId}), so useWeekDragDrop's existing branches
// place them with undo attached — the lane adds no drop logic of its own.
//
// Each pill also carries the overlay drawer's basic triage: complete (the
// leading circle), "not this week" (→ next week's plan), and the defer
// dropdown. The strip caps at STRIP_CAP loose pills with a "+N more"
// expander so a deep backlog never buries the grid.
import { useMemo, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Check, ChevronDown, ChevronRight, ChevronsRight, CookingPot } from 'lucide-react'
import type { Task } from '@/types/task'
import {
  unscheduledPool, applyPoolView, orderPool, groupPool,
  readPoolView, writePoolView, type PoolView,
} from '@/lib/planning/poolViews'
import { PoolViewSwitcher } from '@/components/planning/PoolViewSwitcher'
import { PushDropdown } from '@/components/triage'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { readCadenceConfig } from '@/lib/cadence/config'

const SURFACE = 'weekbench'

// Loose pills visible before the "+N more" expander — roughly two tidy rows.
const STRIP_CAP = 8

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
}

function PoolPill({ task, onSelect, onCompleteTask, onNotThisWeek, onPushTask }: PillProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool:${task.id}`,
    data: { kind: 'chip', taskId: task.id },
  })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(task.id)}
      title={task.title}
      className={`group inline-flex max-w-[280px] items-center gap-1.5 rounded-lg border border-neutral-200 bg-white pl-2 pr-1.5 py-1.5 text-[13px] text-neutral-700 touch-none cursor-grab active:cursor-grabbing hover:border-neutral-300 hover:shadow-sm transition-all ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      {onCompleteTask ? (
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
      <span className="min-w-0 truncate">{task.title}</span>
      {onNotThisWeek && (
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
      {onPushTask && (
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

export function WeekPoolLane({
  tasks, weekStart, dayCount, onSelectItem, onCompleteTask, onNotThisWeek, onPushTask,
}: {
  tasks: Task[]
  weekStart: Date
  dayCount: number
  onSelectItem: (id: string) => void
  onCompleteTask?: (id: string) => void
  onNotThisWeek?: (id: string) => void
  onPushTask?: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
}) {
  const [view, setView] = useState<PoolView>(() => readPoolView(SURFACE))
  const [open, setOpen] = useState(true)
  const [mealsOpen, setMealsOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)

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
    return groupPool(orderPool(applyPoolView(unscheduledPool(tasks, ctx), view, ctx), ctx))
  }, [tasks, weekStart, dayCount, view, meId])

  const total = pool.meals.length + pool.loose.length
  const visibleLoose = showAll ? pool.loose : pool.loose.slice(0, STRIP_CAP)
  const overflow = pool.loose.length - visibleLoose.length

  const pillProps = { onSelect: onSelectItem, onCompleteTask, onNotThisWeek, onPushTask }

  return (
    <div className="mb-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase text-neutral-500 hover:text-neutral-700 transition-colors"
        >
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          Unscheduled · {total}
        </button>
        <div className="ml-auto w-72">
          <PoolViewSwitcher view={view} onChange={(v) => { setView(v); writePoolView(SURFACE, v) }} />
        </div>
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {pool.meals.length > 0 && (
            <button
              type="button"
              onClick={() => setMealsOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[13px] text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              <CookingPot className="w-3.5 h-3.5" /> Meals · {pool.meals.length}
            </button>
          )}
          {mealsOpen && pool.meals.map((t) => <PoolPill key={t.id} task={t} {...pillProps} />)}
          {visibleLoose.map((t) => <PoolPill key={t.id} task={t} {...pillProps} />)}
          {overflow > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="inline-flex items-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-1.5 text-[13px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
            >
              +{overflow} more
            </button>
          )}
          {showAll && pool.loose.length > STRIP_CAP && (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="inline-flex items-center rounded-lg px-2 py-1.5 text-[13px] text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              Show less
            </button>
          )}
          {total === 0 && <span className="text-sm text-neutral-400">Everything is placed.</span>}
        </div>
      )}
    </div>
  )
}
