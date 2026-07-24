// src/lib/planning/monthGroups.ts
//
// The month shelf's roll-up. A month list fills with the STEPS of a move —
// five backyard chores are one move ("Porch and backyard") with five steps —
// and reading them as five separate lines makes the month look like a chore
// list instead of a plan. Two ways a cluster earns one line:
//   1. the moves thread to the same season pick (the real parent), or
//   2. three or more share a project and nothing has been threaded yet.
// Everything else stays a loose pill: grouping is for clusters, not for
// tidiness. Pure — the shelf renders whatever this returns.

import type { Task } from '@/types/task'
import { partitionSeason, partitionMonth } from '@/lib/planning/betPulse'

export interface MonthShelfGroup {
  id: string
  label: string
  taskIds: string[]
}

const CLUSTER_THRESHOLD = 3

export function monthShelfGroups(
  pool: readonly Task[],
  allTasks: readonly Task[],
  projectsMap: Map<string, { id: string; name: string }>,
): MonthShelfGroup[] {
  const inPool = new Set(pool.map((t) => t.id))
  const groups: MonthShelfGroup[] = []
  const taken = new Set<string>()

  // 1. By pick — the move's real parent. partitionMonth already resolves a
  //    move to exactly one pick, so nothing can land in two groups.
  const picks = partitionSeason(allTasks).picks
  const { byPick } = partitionMonth(picks, allTasks)
  for (const p of picks) {
    const members = (byPick.get(p.id) ?? []).filter((t) => inPool.has(t.id))
    if (members.length === 0) continue
    for (const m of members) taken.add(m.id)
    groups.push({ id: `pick:${p.id}`, label: p.title, taskIds: members.map((t) => t.id) })
  }

  // 2. By project, for what's left — only once a cluster is big enough that
  //    the project, not the item, is the honest unit.
  const byProject = new Map<string, Task[]>()
  for (const t of pool) {
    if (taken.has(t.id) || !t.projectId) continue
    const arr = byProject.get(t.projectId) ?? []
    arr.push(t)
    byProject.set(t.projectId, arr)
  }
  for (const [projectId, members] of byProject) {
    if (members.length < CLUSTER_THRESHOLD) continue
    const name = projectsMap.get(projectId)?.name
    if (!name) continue
    groups.push({ id: `project:${projectId}`, label: name, taskIds: members.map((t) => t.id) })
  }

  return groups
}
