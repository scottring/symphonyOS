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

/**
 * Can this GOAL become a single action again — the same row, `is_goal` off?
 *
 * Only while no relationship would be left pointing at a row that is no goal
 * (Codex review, 2026-09-27). The database's guard checks a link only when
 * the row carrying it changes, so it allows both of these; the app refuses
 * them and says why, and never unlinks anything silently:
 *   - next actions filed under it (`goal_task_id`);
 *   - month goals that support it (their `supports_goal_task_id`);
 *   - its own link up to a season goal (`supports_goal_task_id`), which a
 *     task may not carry.
 * A season goal's `goal_id` (its year goal) is kept: a task may serve a year
 * goal, so that link stays true after the change.
 */
export function goalToTaskConversion(
  goal: Pick<Task, 'id' | 'isGoal' | 'completed' | 'supportsGoalTaskId'>,
  tasks: readonly Pick<Task, 'id' | 'title' | 'goalTaskId' | 'supportsGoalTaskId'>[],
): GoalConversion {
  if (!goal.isGoal) return { ok: false, reason: 'It is already a single action.' }
  if (goal.completed) return { ok: false, reason: 'It is finished. Reopen it first.' }
  const steps = tasks.filter((t) => t.goalTaskId === goal.id)
  if (steps.length) {
    return { ok: false, reason: `It holds ${steps.length === 1 ? 'a next action' : `${steps.length} next actions`}. Move or remove ${steps.length === 1 ? 'it' : 'them'} first, so nothing is left under a single action.` }
  }
  const supporters = tasks.filter((t) => t.supportsGoalTaskId === goal.id && t.id !== goal.id)
  if (supporters.length) {
    const names = supporters.slice(0, 2).map((t) => `“${t.title}”`).join(' and ') + (supporters.length > 2 ? ` and ${supporters.length - 2} more` : '')
    return { ok: false, reason: `${names} ${supporters.length === 1 ? 'supports' : 'support'} it. Unlink ${supporters.length === 1 ? 'that goal' : 'those goals'} first, so no link is left pointing at a single action.` }
  }
  if (goal.supportsGoalTaskId) {
    const parent = tasks.find((t) => t.id === goal.supportsGoalTaskId)
    return { ok: false, reason: `It supports ${parent ? `“${parent.title}”` : 'a season goal'}. Remove that link first (open it and choose “No linked goal”) — a single action can’t carry it.` }
  }
  return { ok: true }
}
