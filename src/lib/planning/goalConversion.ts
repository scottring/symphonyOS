// src/lib/planning/goalConversion.ts
//
// Can this task become a goal — the SAME row, not a copy? One answer for every
// surface that offers it (plan rows, task details), and a reason in plain words
// when the answer is no, so the action is explained rather than hidden
// (Scott, 2026-09-25: "Nourish a love of reading" had no way to become a goal).
//
// The rules are the ones the data already enforces:
//   - a goal lives on a month or season list (useSupabaseTasks.setGoal);
//   - goals are one level deep: a step under a goal cannot be a goal itself
//     (goalSteps, guard_goal_support);
//   - a finished task is reopened before it changes what it is.
// Converting flips `is_goal` on the row. Its commitments, links, notes and
// people are untouched, so nothing is duplicated and nothing moves.

import type { Task } from '@/types/task'

export type GoalConversion = { ok: true } | { ok: false; reason: string }

export function goalConversion(
  task: Pick<Task, 'isGoal' | 'completed' | 'goalTaskId' | 'parentTaskId' | 'bucket'>,
  tasks: readonly Pick<Task, 'id' | 'title'>[] = [],
): GoalConversion {
  if (task.isGoal) return { ok: false, reason: 'It is already a goal.' }
  if (task.completed) return { ok: false, reason: 'It is finished. Reopen it first, then make it a goal.' }
  if (task.goalTaskId) {
    const goal = tasks.find((t) => t.id === task.goalTaskId)
    return {
      ok: false,
      reason: `It is a step of ${goal ? `“${goal.title}”` : 'another goal'}, and a goal cannot sit under another goal. Take it out of that goal first.`,
    }
  }
  if (task.parentTaskId) return { ok: false, reason: 'It is part of another task, so it cannot become a goal on its own.' }
  if (task.bucket !== 'month' && task.bucket !== 'quarter') {
    return {
      ok: false,
      reason: 'Only something on a month or season list can be a goal — a goal is not planned for a week or a day. Put it on a month or season first.',
    }
  }
  return { ok: true }
}
