import type { Task, TaskContext, TaskLink } from '@/types/task'
import type { Project } from '@/types/project'

/** Dependencies the orchestrator needs — supplied by App.tsx hooks or mocked in tests. */
export interface ConvertTaskToProjectDeps {
  addProject: (project: {
    name: string
    notes?: string
    context?: TaskContext
    links?: TaskLink[]
    phoneNumber?: string
  }) => Promise<Project | null>
  // useSupabaseTasks.updateTask now reports success as a boolean; this
  // orchestrator ignores the return value, so the type just needs to admit it.
  updateTask: (id: string, updates: Partial<Task>) => Promise<boolean> | Promise<void> | void
  deleteTask: (id: string) => Promise<void> | void
}

/**
 * Convert a task into a project: the task "expands" into a project.
 * - title/notes/context come from `details` and are authoritative — the modal
 *   pre-fills them from the task, so callers must pass `details.notes` (and
 *   context) to preserve the task's values; omitting them clears those fields.
 * - links/phoneNumber carry over from the source task
 * - each subtask is re-parented into the new project (parentTaskId cleared)
 * - the original parent task is deleted
 * Returns the new project, or null if creation failed (no destructive ops run).
 */
export async function convertTaskToProject(
  task: Task,
  details: { name: string; notes?: string; context?: TaskContext },
  deps: ConvertTaskToProjectDeps,
): Promise<Project | null> {
  const newProject = await deps.addProject({
    name: details.name,
    notes: details.notes,
    context: details.context,
    links: task.links,
    phoneNumber: task.phoneNumber,
  })

  if (!newProject) return null

  for (const subtask of task.subtasks ?? []) {
    await deps.updateTask(subtask.id, {
      projectId: newProject.id,
      parentTaskId: undefined,
    })
  }

  await deps.deleteTask(task.id)
  return newProject
}
