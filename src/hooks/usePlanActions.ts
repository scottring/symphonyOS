import { useCallback, useMemo } from 'react'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useGatedTaskActions } from '@/hooks/useGatedTaskActions'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { useRoutines } from '@/hooks/useRoutines'
import { showToast } from '@/hooks/useToast'
import { makePlanActions, type PlanActions } from '@/lib/planning/planActions'

/**
 * Plan actions for a surface with no page-level task state of its own (the
 * Today pin in the shell). Scheduling writes go through the DomainGate like
 * every other placement; choosing a day does not schedule, so it doesn't ask.
 */
export function usePlanActions(pushAction?: (message: string, undo: () => void) => void, viewedWeek?: Date | null): PlanActions & {
  toggleTask: (id: string) => void
  completeRoutine: (routineId: string, day: Date, done: boolean) => Promise<boolean>
  /** Deletes, for the chooser's Delete (held behind an Undo window by the host). */
  deleteTask: (id: string) => Promise<unknown>
  deleteRoutine: (id: string) => Promise<unknown>
} {
  const { tasks, updateTask, updateTasksBulk, pushTask, toggleTask, deleteTask } = useSupabaseTasks()
  const findTask = useCallback((id: string) =>
    tasks.find((t) => t.id === id) ?? tasks.flatMap((t) => t.subtasks ?? []).find((t) => t.id === id), [tasks])
  const gated = useGatedTaskActions(useMemo(() => ({ updateTask, updateTasksBulk, pushTask }), [updateTask, updateTasksBulk, pushTask]), findTask)
  const { setPlanned, reschedule, markDone, undoDone } = useActionableInstances()
  const { routines, updateRoutine, deleteRoutine } = useRoutines()

  const actions = useMemo(() => makePlanActions({
    findTask,
    // Choosing / un-choosing a day is not a scheduling decision; placing a
    // time or a date is, and asks "where does this belong?" when needed.
    updateTask: (id, u) => ('scheduledFor' in u || 'bucket' in u) ? gated.updateTask(id, u) : updateTask(id, u),
    pushTask: (id, target) => target === 'week' && viewedWeek
      ? gated.updateTask(id, { bucket: 'week', weekStart: viewedWeek })
      : gated.pushTask(id, target),
    setRoutinePlanned: (id, day, planned) => setPlanned('routine', id, day, planned),
    rescheduleRoutine: (id, from, when) => reschedule('routine', id, from, when),
    // A routine with no day yet is given one by writing its RULE.
    updateRoutine: (id, u) => updateRoutine(id, { recurrence_pattern: u.recurrence_pattern, time_of_day: u.time_of_day }),
    findRoutine: (id) => routines.find((r) => r.id === id),
    pushAction,
    notify: (m) => showToast(m, 'warning'),
  }), [findTask, gated, updateTask, setPlanned, reschedule, updateRoutine, routines, pushAction, viewedWeek])

  return {
    ...actions,
    toggleTask: (id: string) => { void toggleTask(id) },
    completeRoutine: (routineId: string, day: Date, done: boolean) =>
      done ? markDone('routine', routineId, day) : undoDone('routine', routineId, day),
    deleteTask,
    deleteRoutine,
  }
}
