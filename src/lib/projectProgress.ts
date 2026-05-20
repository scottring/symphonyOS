import type { Project } from '@/types/project'
import type { Task } from '@/types/task'

export interface RankedProject {
  id: string
  name: string
  progress: number      // 0–100, rounded integer
  totalTasks: number
}

/**
 * Picks active projects for the Today rail's ACTIVE PROJECTS panel.
 *
 * - Filters out completed projects (active = in_progress, on_hold, not_started).
 * - Computes progress = completed-tasks / total-tasks (0% if the project has no tasks).
 * - Sorts by recency (most-recently-updated first).
 * - Caps at `limit` (default 5).
 */
export function rankActiveProjects(
  projects: Project[],
  tasks: Task[],
  limit = 5,
): RankedProject[] {
  // Pre-bucket tasks by project_id once so we don't N×M scan.
  const tasksByProject = new Map<string, { total: number; done: number }>()
  for (const t of tasks) {
    if (!t.projectId) continue
    const bucket = tasksByProject.get(t.projectId) ?? { total: 0, done: 0 }
    bucket.total += 1
    if (t.completed) bucket.done += 1
    tasksByProject.set(t.projectId, bucket)
  }

  const active = projects
    .filter((p) => p.status !== 'completed')
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, limit)

  return active.map((p) => {
    const counts = tasksByProject.get(p.id)
    const progress = counts && counts.total > 0
      ? Math.round((counts.done / counts.total) * 100)
      : 0
    return {
      id: p.id,
      name: p.name,
      progress,
      totalTasks: counts?.total ?? 0,
    }
  })
}
