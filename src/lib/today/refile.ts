// src/lib/today/refile.ts
//
// One-time "needs re-filing" scan for the Inbox: the current user's own open
// rows whose sharing has drifted from what their domain implies. Two kinds:
//  - family-private: tagged Family (the shared layer) but scope is still
//    individual — nobody else can actually see it.
//  - private-shared: tagged Work/Personal (a private layer) but scope is
//    compound (household-readable) — an assignment leaked visibility wider
//    than the domain intends.
// Pure selector, no bulk action — RefileStrip renders one button per row and
// a person decides each one.
import type { Task } from '@/types/task'

export type RefileKind = 'family-private' | 'private-shared'

export interface RefileRow {
  task: Task
  kind: RefileKind
}

function kindOf(task: Task): RefileKind | null {
  if (task.context === 'family' && task.scope === 'individual') return 'family-private'
  if ((task.context === 'work' || task.context === 'personal') && task.scope === 'compound') return 'private-shared'
  return null
}

export function selectRefileRows(tasks: Task[], currentUserId: string | null): RefileRow[] {
  if (!currentUserId) return []
  return tasks
    .filter((t) => !t.completed && t.userId === currentUserId && kindOf(t) !== null)
    .map((task) => ({ task, kind: kindOf(task) as RefileKind }))
    .sort((a, b) => new Date(a.task.createdAt).getTime() - new Date(b.task.createdAt).getTime())
}
