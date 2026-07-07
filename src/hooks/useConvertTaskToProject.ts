import { useCallback } from 'react'
import { convertTaskToProject, type ConvertTaskToProjectDeps } from '@/lib/convertTaskToProject'
import { showToast } from '@/hooks/useToast'
import type { Task, TaskContext } from '@/types/task'

/**
 * Builds the `onConvertTaskToProject` handler for ScheduleActionsContext.
 * Looks the task up from the caller's task list, runs the expand-to-project
 * orchestration, and surfaces failure as a toast (the convert modal treats a
 * null return as failure and stays open, which reads as a dead button).
 */
export function useConvertTaskToProject(tasks: Task[], deps: ConvertTaskToProjectDeps) {
  const { addProject, updateTask, deleteTask } = deps
  return useCallback(
    async (taskId: string, details: { name: string; notes?: string; context?: TaskContext }) => {
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return null
      const project = await convertTaskToProject(task, details, { addProject, updateTask, deleteTask })
      if (project) showToast(`Project "${project.name}" created`, 'success')
      else showToast('Could not create the project. Please try again.', 'error')
      return project
    },
    [tasks, addProject, updateTask, deleteTask],
  )
}
