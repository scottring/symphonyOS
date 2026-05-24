import { useState, useMemo, useCallback, useEffect } from 'react'
import { CalendarCheck, CalendarX } from 'lucide-react'
import type { Task } from '@/types/task'
import type { GoalAction } from '@/types/goal'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'
import type { UpdateRoutineInput } from '@/hooks/useRoutines'
import { isEverydayRoutine, scheduleRoutineOnDate, matchesRecurrenceForDate } from '@/lib/routineUtils'
import { readHideRoutines, writeHideRoutines, onHideRoutinesChange } from '@/lib/hideRoutinesSignal'
import { isoWeekId } from './weeklyPlanning'
import { StepWeekAhead } from './StepWeekAhead'
import { StepBuildTodos } from './StepBuildTodos'
import { StepSchedule } from './StepSchedule'
import { StepConcerns } from './StepConcerns'

const STEPS = ['The week ahead', "This week's to-dos", 'Schedule them', 'Concerns & topics'] as const

interface Props {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  onSavePlanToVault: (input: { weekId: string; priorities: Task[]; concerns: string }) => Promise<{ ok: boolean }>
  onClose: () => void
  initialDate?: Date
  goalActions?: GoalAction[]
  onAddGoalAction?: (action: GoalAction) => void
  /** Open a day's full view from the week-ahead overview (typically exits planning). */
  onSelectDay?: (date: Date) => void
  /** Full active+reference routine set, used to list non-daily routines on step 2. */
  allRoutines?: Routine[]
  /** Persist a routine when it's dropped onto the schedule grid (step 3). */
  onUpdateRoutine?: (id: string, input: UpdateRoutineInput) => Promise<boolean>
  /** Mark a candidate task complete from step 2. */
  onCompleteTask?: (taskId: string) => void
  /** Delete a candidate task from step 2. */
  onDeleteTask?: (taskId: string) => void
}

export function WeeklyPlanningSession({
  tasks,
  events,
  routines,
  onUpdateTask,
  onPushTask,
  onSavePlanToVault,
  onClose,
  initialDate,
  goalActions = [],
  onAddGoalAction,
  onSelectDay,
  allRoutines,
  onUpdateRoutine,
  onCompleteTask,
  onDeleteTask,
}: Props) {
  const [step, setStep] = useState(0)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedRoutineIds, setSelectedRoutineIds] = useState<string[]>([])
  const [concerns, setConcerns] = useState('')
  const [saving, setSaving] = useState(false)
  const [addedGoalActionIds, setAddedGoalActionIds] = useState<string[]>([])

  // Share the app-wide "Hide daily" preference (same localStorage signal Today,
  // Week, and Wall use). Toggling here also updates those views, and vice-versa.
  const [hideDaily, setHideDaily] = useState<boolean>(() => readHideRoutines())
  useEffect(() => onHideRoutinesChange(setHideDaily), [])

  // When hiding, drop everyday-ish routines (daily, weekdays, weekly-covering-
  // all-5) so planning focuses on the lower-frequency chores. Filtering here
  // flows into both the week-ahead overview and the schedule grid.
  const visibleRoutines = useMemo(
    () => hideDaily ? routines.filter(r => !isEverydayRoutine(r.recurrence_pattern)) : routines,
    [hideDaily, routines],
  )

  // Active routines that still need a slot: non-daily AND without a set time.
  // Once a routine has a time_of_day it shows on the schedule grid, so it drops
  // off this "needs scheduling" list. Falls back to the date-filtered `routines`
  // when the full set isn't supplied.
  const nonDailyRoutines = useMemo(
    () => (allRoutines ?? routines).filter(
      r => r.visibility === 'active' && !isEverydayRoutine(r.recurrence_pattern) && !r.time_of_day,
    ),
    [allRoutines, routines],
  )

  const handleToggleRoutine = useCallback(
    (routine: Routine) => {
      setSelectedRoutineIds(ids =>
        ids.includes(routine.id) ? ids.filter(id => id !== routine.id) : [...ids, routine.id],
      )
    },
    [],
  )

  // Selected, still-untimed routines — offered as draggable chips on step 3.
  const selectedRoutines = useMemo(
    () => nonDailyRoutines.filter(r => selectedRoutineIds.includes(r.id)),
    [nonDailyRoutines, selectedRoutineIds],
  )

  // A routine dropped on a grid slot becomes weekly on that weekday at that
  // time. The optimistic routine update gives it a time_of_day, which removes
  // it from nonDailyRoutines (and the drawer) and shows it on the grid.
  const handleScheduleRoutineDrop = useCallback(
    (routineId: string, date: Date, time: string) => {
      const routine = (allRoutines ?? routines).find(r => r.id === routineId)
      if (!routine || !onUpdateRoutine) return
      onUpdateRoutine(routineId, scheduleRoutineOnDate(routine, date, time))
    },
    [allRoutines, routines, onUpdateRoutine],
  )

  // Per-day routines for the schedule grid. Resolved per column (by recurrence)
  // rather than from the single-viewedDate `routines` set, so a routine dropped
  // onto a given weekday actually lands on that column. Reactive to the
  // optimistic onUpdateRoutine via `allRoutines`. Respects the Hide-daily toggle.
  const gridRoutinesForDate = useCallback(
    (date: Date): Routine[] => {
      const matching = (allRoutines ?? routines).filter(
        r => r.visibility === 'active' && matchesRecurrenceForDate(r, date),
      )
      return hideDaily ? matching.filter(r => !isEverydayRoutine(r.recurrence_pattern)) : matching
    },
    [allRoutines, routines, hideDaily],
  )

  const weekId = useMemo(() => isoWeekId(initialDate ?? new Date()), [initialDate])
  const priorities = useMemo(
    () => selectedIds.map(id => tasks.find(t => t.id === id)).filter(Boolean) as Task[],
    [selectedIds, tasks],
  )

  // Tasks already scheduled within the planning week — surfaced on the step-3
  // grid as context so prior planning is visible (the wizard otherwise only
  // shows this session's picks). Window is initialDate .. +7d (the grid's max
  // range), keyed off the prop (not "now") so past tasks don't flood the drawer.
  const scheduleStepTasks = useMemo(() => {
    const start = new Date(initialDate ?? new Date())
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    const scheduledInWeek = tasks.filter(t => {
      if (t.completed || t.isAllDay || !t.scheduledFor) return false
      const d = new Date(t.scheduledFor)
      return d >= start && d < end
    })
    // Merge with the session's priorities (to place), de-duped by id.
    const byId = new Map<string, Task>()
    for (const t of [...priorities, ...scheduledInWeek]) byId.set(t.id, t)
    return [...byId.values()]
  }, [tasks, initialDate, priorities])

  const handleToggle = useCallback(
    (task: Task) => {
      const isSelected = selectedIds.includes(task.id)
      if (!isSelected) onUpdateTask(task.id, { bucket: 'week' })
      setSelectedIds(ids => isSelected ? ids.filter(id => id !== task.id) : [...ids, task.id])
    },
    [selectedIds, onUpdateTask],
  )

  // Bulk select/clear a whole candidate section. Mirrors handleToggle's side
  // effect: newly-selected tasks move to the 'week' bucket.
  const handleSelectMany = useCallback(
    (sectionTasks: Task[], selected: boolean) => {
      const ids = sectionTasks.map(t => t.id)
      if (selected) {
        for (const t of sectionTasks) {
          if (!selectedIds.includes(t.id)) onUpdateTask(t.id, { bucket: 'week' })
        }
        setSelectedIds(prev => Array.from(new Set([...prev, ...ids])))
      } else {
        const remove = new Set(ids)
        setSelectedIds(prev => prev.filter(id => !remove.has(id)))
      }
    },
    [selectedIds, onUpdateTask],
  )

  const handleAddGoalAction = useCallback(
    (action: GoalAction) => {
      onAddGoalAction?.(action)
      setAddedGoalActionIds(ids => [...ids, action.id])
    },
    [onAddGoalAction],
  )

  const isLast = step === STEPS.length - 1

  const finish = async () => {
    setSaving(true)
    await onSavePlanToVault({ weekId, priorities, concerns })
    setSaving(false)
    onClose()
  }

  return (
    <div className="h-full flex flex-col bg-bg-base">
      {/* pr-44 on desktop keeps the right-side controls clear of AppShell's
          absolute domain/AI/help cluster (top-4 right-6 z-20), which only
          renders on non-Today desktop views. Mobile hides that cluster, so
          normal padding applies. */}
      <header className="flex items-center justify-between pl-6 pr-6 md:pr-44 py-4 border-b border-neutral-200/70">
        <div>
          <h1 className="font-display text-2xl text-neutral-800">Weekly Planning</h1>
          <p className="text-sm text-neutral-500">{STEPS[step]} — step {step + 1} of {STEPS.length}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => writeHideRoutines(!hideDaily)}
            title={hideDaily ? 'Show daily chores' : 'Hide daily chores'}
            aria-pressed={hideDaily}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            {hideDaily ? <CalendarX className="w-4 h-4" /> : <CalendarCheck className="w-4 h-4" />}
            <span>{hideDaily ? 'Show daily' : 'Hide daily'}</span>
          </button>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-sm">Close</button>
        </div>
      </header>

      <div className="flex items-center gap-2 px-6 py-3">
        {STEPS.map((_, i) => (
          <span key={i} className={`h-2 w-2 rounded-full ${i <= step ? 'bg-primary-500' : 'bg-neutral-300'}`} />
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-6 py-4">
        {step === 0 && (
          <StepWeekAhead
            weekDate={initialDate ?? new Date()}
            tasks={tasks}
            events={events}
            routines={visibleRoutines}
            onSelectDay={onSelectDay}
          />
        )}
        {step === 1 && (
          <StepBuildTodos
            tasks={tasks}
            selectedIds={selectedIds}
            onToggle={handleToggle}
            onReorder={setSelectedIds}
            goalActions={goalActions}
            addedGoalActionIds={addedGoalActionIds}
            onAddGoalAction={handleAddGoalAction}
            routines={nonDailyRoutines}
            selectedRoutineIds={selectedRoutineIds}
            onToggleRoutine={handleToggleRoutine}
            onCompleteTask={onCompleteTask}
            onDeleteTask={onDeleteTask}
            onSelectMany={handleSelectMany}
          />
        )}
        {step === 2 && (
          <StepSchedule
            weekDate={initialDate ?? new Date()}
            priorities={scheduleStepTasks}
            events={events}
            routines={visibleRoutines}
            getRoutinesForDate={gridRoutinesForDate}
            draggableRoutines={selectedRoutines}
            onScheduleRoutine={handleScheduleRoutineDrop}
            onUpdateTask={onUpdateTask}
            onPushTask={onPushTask}
          />
        )}
        {step === 3 && <StepConcerns value={concerns} onChange={setConcerns} />}
      </div>

      <footer className="flex items-center justify-between px-6 py-4 border-t border-neutral-200/70">
        <button
          onClick={() => setStep(s => Math.max(0, s - 1))}
          disabled={step === 0}
          className="px-4 py-2 text-sm text-neutral-600 disabled:opacity-40"
        >
          Back
        </button>
        {isLast ? (
          <button onClick={finish} disabled={saving} className="btn-primary px-5 py-2">
            {saving ? 'Saving…' : 'Finish'}
          </button>
        ) : (
          <button
            onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}
            className="btn-primary px-5 py-2"
          >
            Next
          </button>
        )}
      </footer>
    </div>
  )
}
