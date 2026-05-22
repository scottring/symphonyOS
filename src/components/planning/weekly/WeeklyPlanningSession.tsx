import { useState, useMemo, useCallback } from 'react'
import type { Task } from '@/types/task'
import type { GoalAction } from '@/types/goal'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'
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
}: Props) {
  const [step, setStep] = useState(0)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [concerns, setConcerns] = useState('')
  const [saving, setSaving] = useState(false)
  const [addedGoalActionIds, setAddedGoalActionIds] = useState<string[]>([])

  const weekId = useMemo(() => isoWeekId(initialDate ?? new Date()), [initialDate])
  const priorities = useMemo(
    () => selectedIds.map(id => tasks.find(t => t.id === id)).filter(Boolean) as Task[],
    [selectedIds, tasks],
  )

  const handleToggle = useCallback(
    (task: Task) => {
      const isSelected = selectedIds.includes(task.id)
      if (!isSelected) onUpdateTask(task.id, { bucket: 'week' })
      setSelectedIds(ids => isSelected ? ids.filter(id => id !== task.id) : [...ids, task.id])
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
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-200/70">
        <div>
          <h1 className="font-display text-2xl text-neutral-800">Weekly Planning</h1>
          <p className="text-sm text-neutral-500">{STEPS[step]} — step {step + 1} of {STEPS.length}</p>
        </div>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-sm">Close</button>
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
            routines={routines}
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
          />
        )}
        {step === 2 && (
          <StepSchedule
            weekDate={initialDate ?? new Date()}
            priorities={priorities}
            events={events}
            routines={routines}
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
