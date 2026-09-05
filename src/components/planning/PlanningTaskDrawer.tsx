import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { ChevronDown, ChevronRight, CookingPot, Repeat } from 'lucide-react'
import type { Task } from '@/types/task'
import type { Routine } from '@/types/actionable'
import type { PoolView } from '@/lib/planning/poolViews'
import { routineTemporalLabel } from '@/lib/planning/routineTemporal'
import { routinesForView } from '@/lib/planning/poolViews'
import type { PlacementFate } from '@/lib/planning/lineage'
import { PoolViewSwitcher } from './PoolViewSwitcher'
import { PlanningTaskCard } from './PlanningTaskCard'
import { PlanningRoutineDragCard } from './PlanningRoutineDragCard'

// Loose tasks visible before the "N more" expander — the pool must read as a
// short list of real candidates, never a 65-item wall.
const POOL_CAP = 15

interface PlanningTaskDrawerProps {
  /** Loose (non-meal) pool tasks, already view-filtered and ordered. */
  tasks: Task[]
  /** Weekly-dinner-seeded chores, rolled into one collapsible group. */
  mealTasks?: Task[]
  /** Routines that still need a home — ALREADY filtered by the host, which
   *  runs the eligibility ladder. Which VIEWS show them is routinesForView's
   *  call, so this surface and /week's lane cannot disagree. */
  routines?: Routine[]
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  onComplete?: (id: string) => void
  onNotThisWeek?: (id: string) => void
  view: PoolView
  onViewChange: (v: PoolView) => void
  /** For the This month view: a row copied down shows → placed instead of
   *  looking like a failed drag. */
  placedFor?: (task: Task) => PlacementFate
}

export function PlanningTaskDrawer({
  tasks,
  mealTasks = [],
  routines = [],
  onPushTask,
  onComplete,
  onNotThisWeek,
  view,
  onViewChange,
  placedFor,
}: PlanningTaskDrawerProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: 'unscheduled-drawer',
  })

  const [mealsOpen, setMealsOpen] = useState(false)
  const [showAllLoose, setShowAllLoose] = useState(false)
  const routinesView = view === 'routines'
  const visibleTasks = showAllLoose ? tasks : tasks.slice(0, POOL_CAP)
  const looseOverflow = tasks.length - visibleTasks.length
  // A routine with no time needs a slot the way an unscheduled task does, so
  // it belongs in the same pool. The host hands over only unhomed ones; this
  // decides which views carry them.
  const shownRoutines = routinesForView(routines, view)
  const total = routinesView ? shownRoutines.length : tasks.length + mealTasks.length + shownRoutines.length

  return (
    <div
      ref={setNodeRef}
      className={`w-80 shrink-0 border-r flex flex-col transition-colors ${
        isOver
          ? 'bg-primary-100 border-primary-300'
          : 'bg-neutral-50 border-neutral-200'
      }`}
    >
      {/* Header */}
      <div className="p-4 pb-3 border-b border-neutral-200">
        <h2 className="font-medium text-neutral-700 flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4 text-neutral-500"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z" />
          </svg>
          Unscheduled
          {total > 0 && (
            <span className="ml-auto text-sm text-neutral-500 bg-neutral-200 px-2 py-0.5 rounded-full">
              {total}
            </span>
          )}
        </h2>
        <p className="text-xs text-neutral-500 mt-1 mb-2">
          Drag to schedule
        </p>
        <PoolViewSwitcher view={view} onChange={onViewChange} includeRoutines />
      </div>

      {/* Task list - overflow-x-clip allows dropdown to show while y scrolls */}
      <div className="flex-1 overflow-y-auto overflow-x-clip p-3 space-y-2">
        {routinesView ? (
          shownRoutines.length === 0 ? (
            <p className="text-center text-sm text-neutral-500 py-8">
              No routines waiting for a time — every active routine is placed.
            </p>
          ) : (
            <>
              {shownRoutines.map((routine) => (
                <PlanningRoutineDragCard
                  key={routine.id}
                  routine={routine}
                  temporalLabel={routineTemporalLabel(routine)}
                />
              ))}
            </>
          )
        ) : total === 0 ? (
          <div className={`text-center py-8 ${isOver ? 'opacity-50' : ''}`}>
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-neutral-100 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-6 h-6 text-neutral-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-sm text-neutral-500">
              {isOver ? 'Drop to unschedule' : 'All tasks scheduled'}
            </p>
          </div>
        ) : (
          <>
            {mealTasks.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setMealsOpen((v) => !v)}
                  className="w-full flex items-center gap-1.5 px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-700 transition-colors"
                >
                  {mealsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  <CookingPot className="w-3.5 h-3.5" />
                  Meals · {mealTasks.length}
                </button>
                {mealsOpen && (
                  <div className="space-y-2 mt-1">
                    {mealTasks.map((t) => (
                      <PlanningTaskCard key={t.id} task={t} onPushTask={onPushTask} onComplete={onComplete} onNotThisWeek={onNotThisWeek} />
                    ))}
                  </div>
                )}
              </div>
            )}
            {visibleTasks.map((task) => (
              <PlanningTaskCard
                key={task.id}
                task={task}
                onPushTask={onPushTask}
                onComplete={onComplete}
                onNotThisWeek={onNotThisWeek}
                placed={placedFor?.(task)}
              />
            ))}
            {looseOverflow > 0 && (
              <button
                type="button"
                onClick={() => setShowAllLoose(true)}
                className="w-full text-center text-xs text-neutral-500 hover:text-neutral-700 py-2 transition-colors"
              >
                {looseOverflow} more
              </button>
            )}
            {/* Routines last, and never collapsed. Grouped so ten unhomed
                routines can't bury five tasks; expanded because a routine you
                have to open a disclosure to see is a routine you forget to
                block. */}
            {shownRoutines.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  <Repeat className="w-3.5 h-3.5" />
                  Routines · {shownRoutines.length}
                </div>
                <div className="space-y-2 mt-1">
                  {shownRoutines.map((routine) => (
                    <PlanningRoutineDragCard
                      key={routine.id}
                      routine={routine}
                      temporalLabel={routineTemporalLabel(routine)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer with help text */}
      <div className="p-3 border-t border-neutral-200 bg-neutral-100/50">
        <div className="flex items-start gap-2 text-xs text-neutral-500">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4 shrink-0 mt-0.5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          <span>
            Drag tasks onto the calendar to schedule. Drag back here to unschedule.
          </span>
        </div>
      </div>
    </div>
  )
}
