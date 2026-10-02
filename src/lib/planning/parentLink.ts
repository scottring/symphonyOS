// src/lib/planning/parentLink.ts
//
// What a task serves, read the way the Week list reads it (WeekV2's
// `parentOf`): the line it was copied down from (`source_id`) or the goal it
// is a step of (`goal_task_id`). Today draws the same muted line at rest, so
// the plan made on year → season → month → week is still legible on the day
// the work is done (walkthrough 2026-10-02, #24).
//
// `find` is the caller's own task lookup — already filtered to what the reader
// may see — so a parent outside the reader's view is simply absent and its
// title cannot leak through a child that is shared.

import type { Task } from '@/types/task'

export interface ParentLink { id: string; title: string; isGoal: boolean }

export function parentLinkOf(
  task: Pick<Task, 'id' | 'sourceId' | 'goalTaskId'>,
  find: (id: string) => Pick<Task, 'id' | 'title' | 'isGoal'> | undefined,
): ParentLink | null {
  for (const id of [task.sourceId, task.goalTaskId]) {
    if (!id || id === task.id) continue
    const p = find(id)
    if (p) return { id: p.id, title: p.title, isGoal: !!p.isGoal }
  }
  return null
}

/** "Step toward “Run a 10K”" · "From “Plan the garden”". */
export function parentLinkText(p: ParentLink): string {
  return `${p.isGoal ? 'Step toward' : 'From'} “${p.title}”`
}
