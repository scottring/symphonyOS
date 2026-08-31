//
// /week's Unscheduled pool — the same official views as the overlay drawer
// (poolViews decides; this only renders). Pills speak the week grid's chip
// protocol ({kind:'chip', taskId}), so useWeekDragDrop's existing branches
// place them with undo attached — the lane adds no drop logic of its own.
import { useMemo, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { ChevronDown, ChevronRight, CookingPot } from 'lucide-react'
import type { Task } from '@/types/task'
import {
  unscheduledPool, applyPoolView, orderPool, groupPool,
  readPoolView, writePoolView, type PoolView,
} from '@/lib/planning/poolViews'
import { PoolViewSwitcher } from '@/components/planning/PoolViewSwitcher'
import { readCadenceConfig } from '@/lib/cadence/config'

const SURFACE = 'weekbench'

function PoolPill({ task, onSelect }: { task: Task; onSelect: (id: string) => void }) {
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
      className={`inline-flex max-w-full items-center rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 touch-none cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <span className="min-w-0 break-words">{task.title}</span>
    </div>
  )
}

export function WeekPoolLane({ tasks, weekStart, dayCount, onSelectItem }: {
  tasks: Task[]
  weekStart: Date
  dayCount: number
  onSelectItem: (id: string) => void
}) {
  const [view, setView] = useState<PoolView>(() => readPoolView(SURFACE))
  const [open, setOpen] = useState(true)
  const [mealsOpen, setMealsOpen] = useState(false)

  const pool = useMemo(() => {
    const rangeEnd = new Date(weekStart)
    rangeEnd.setDate(rangeEnd.getDate() + dayCount - 1)
    const ctx = {
      today: new Date(),
      rangeStart: weekStart,
      rangeEnd,
      weekStartsOn: readCadenceConfig().weekStartsOn,
    }
    return groupPool(orderPool(applyPoolView(unscheduledPool(tasks, ctx), view, ctx), ctx))
  }, [tasks, weekStart, dayCount, view])

  const total = pool.meals.length + pool.loose.length

  return (
    <div className="mb-2 rounded-xl border border-neutral-200 bg-neutral-50/70 px-3 py-2">
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
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-200 transition-colors"
            >
              <CookingPot className="w-3.5 h-3.5" /> Meals · {pool.meals.length}
            </button>
          )}
          {mealsOpen && pool.meals.map((t) => <PoolPill key={t.id} task={t} onSelect={onSelectItem} />)}
          {pool.loose.map((t) => <PoolPill key={t.id} task={t} onSelect={onSelectItem} />)}
          {total === 0 && <span className="text-sm text-neutral-400">Everything is placed.</span>}
        </div>
      )}
    </div>
  )
}
