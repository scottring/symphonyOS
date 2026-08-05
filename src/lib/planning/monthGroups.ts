// src/lib/planning/monthGroups.ts
//
// The month shelf's partition. A month list fills with the STEPS of a move —
// five backyard chores are one move ("Porch and backyard") with five steps —
// and reading them as five separate lines makes the month look like a chore
// list instead of a plan. Two ways a cluster earns its own block:
//   1. the moves thread to the same season pick (the real parent), or
//   2. three or more share a project and nothing has been threaded yet.
//
// Everything else falls into one 'unfiled' block. This is a TOTAL partition:
// every pool task lands in exactly one block. The board renders one block per
// group and nothing else, so a task missing from every block would be
// invisible on the page — the previous partial partition left a remainder for
// the caller to render loose, which is what forced grouped and ungrouped pills
// into a single wrap-flow. Pure — the shelf renders whatever this returns.

import type { Task } from '@/types/task'
import { partitionSeason, partitionMonth } from '@/lib/planning/betPulse'

export interface MonthShelfGroup {
  id: string
  label: string
  /** 'unfiled' is the residue, not a cluster — the shelf renders it last and
   *  gives it no drag handle (dragging nine unrelated moves onto one week is
   *  a footgun, not a feature). */
  kind: 'pick' | 'project' | 'unfiled'
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
    groups.push({ id: `pick:${p.id}`, label: p.title, kind: 'pick', taskIds: members.map((t) => t.id) })
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
    for (const m of members) taken.add(m.id)
    groups.push({ id: `project:${projectId}`, label: name, kind: 'project', taskIds: members.map((t) => t.id) })
  }

  // Biggest clusters lead; a singleton keeps its own block because the label
  // IS the point — it names the season pick that move serves.
  groups.sort((a, b) => b.taskIds.length - a.taskIds.length)

  // 3. The remainder — one block, always last. Threaded work reads first;
  //    unfiled residue is what you should thread or cut.
  const unfiled = pool.filter((t) => !taken.has(t.id)).map((t) => t.id)
  if (unfiled.length > 0) {
    groups.push({ id: 'unfiled', label: 'Unfiled', kind: 'unfiled', taskIds: unfiled })
  }

  return groups
}
