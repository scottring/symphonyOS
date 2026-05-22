import type { Project } from '@/types/project'
import type { Task } from '@/types/task'

export interface RankedProject {
  id: string
  name: string
  progress: number      // 0–100, rounded integer
  totalTasks: number
  pinned: boolean       // true if this project is pinned to the top of the rail
}

// Bucket urgency for undated tasks; lower = sooner. Unknown/none = 4.
const BUCKET_RANK: Record<string, number> = {
  week: 0,
  month: 1,
  quarter: 2,
  inbox: 3,
}

interface ProjectAgg {
  total: number
  done: number
  dueMs: number       // earliest incomplete timed scheduledFor, or Infinity
  bucketRank: number  // min bucket rank among incomplete tasks, or 4
}

/**
 * Picks active projects for the Today rail's ACTIVE PROJECTS panel.
 *
 * - Filters out completed projects.
 * - Computes progress = completed-tasks / total-tasks (0% if no tasks).
 * - Orders: pinned projects first (in `pinnedIds` order), then unpinned by the
 *   earliest incomplete TIMED task's `scheduledFor` (ascending). Projects with no
 *   dated tasks sink to the bottom, ordered by bucket urgency
 *   (week < month < quarter < inbox < none) then most-recently-updated.
 * - Caps at `limit` (default 5); pinned projects take the top slots.
 */
export function rankActiveProjects(
  projects: Project[],
  tasks: Task[],
  limit = 5,
  pinnedIds: string[] = [],
): RankedProject[] {
  // Pre-aggregate tasks by project once.
  const byProject = new Map<string, ProjectAgg>()
  for (const t of tasks) {
    if (!t.projectId) continue
    const agg = byProject.get(t.projectId) ?? { total: 0, done: 0, dueMs: Infinity, bucketRank: 4 }
    agg.total += 1
    if (t.completed) {
      agg.done += 1
    } else {
      // Only incomplete tasks drive the due-date / bucket sort.
      if (t.bucket === 'timed') {
        // Timed tasks carry a real date; they drive dueMs, not bucketRank.
        if (t.scheduledFor) agg.dueMs = Math.min(agg.dueMs, t.scheduledFor.getTime())
      } else {
        const rank = t.bucket ? (BUCKET_RANK[t.bucket] ?? 4) : 4
        agg.bucketRank = Math.min(agg.bucketRank, rank)
      }
    }
    byProject.set(t.projectId, agg)
  }

  // Pin order lookup: project id → index in pinnedIds.
  const pinnedRank = new Map<string, number>()
  pinnedIds.forEach((id, i) => pinnedRank.set(id, i))

  const active = projects.filter((p) => p.status !== 'completed')

  active.sort((a, b) => {
    const aPinned = pinnedRank.has(a.id)
    const bPinned = pinnedRank.has(b.id)
    if (aPinned && bPinned) return pinnedRank.get(a.id)! - pinnedRank.get(b.id)!
    if (aPinned) return -1
    if (bPinned) return 1

    const aAgg = byProject.get(a.id)
    const bAgg = byProject.get(b.id)
    const aDue = aAgg?.dueMs ?? Infinity
    const bDue = bAgg?.dueMs ?? Infinity
    if (aDue !== bDue) return aDue - bDue

    const aRank = aAgg?.bucketRank ?? 4
    const bRank = bAgg?.bucketRank ?? 4
    if (aRank !== bRank) return aRank - bRank

    return b.updatedAt.getTime() - a.updatedAt.getTime()
  })

  return active.slice(0, limit).map((p) => {
    const agg = byProject.get(p.id)
    const progress = agg && agg.total > 0
      ? Math.round((agg.done / agg.total) * 100)
      : 0
    return {
      id: p.id,
      name: p.name,
      progress,
      totalTasks: agg?.total ?? 0,
      pinned: pinnedRank.has(p.id),
    }
  })
}
