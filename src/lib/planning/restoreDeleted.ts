// src/lib/planning/restoreDeleted.ts
//
// Undo for a delete on the plan lists (Scott, 2026-10-25: "and undo, i just
// lost an item"). A task delete removes the row, and the database removes its
// subtasks with it, so Undo puts the row back with the SAME id and everything
// that rides the insert — its period, its links up, who carries it, notes and
// links — and then its pieces under it. The period's list of commitments is
// rebuilt from the period fields by the database's mirror trigger; any older
// history (carried from last month) is not restored.

import type { Task } from '@/types/task'
import type { useSupabaseTasks } from '@/hooks/useSupabaseTasks'

type AddTask = ReturnType<typeof useSupabaseTasks>['addTask']

/** The insert that puts `t` back as it was. */
export function restoreArgs(t: Task): Parameters<AddTask> {
  return [t.title, t.contactId, t.projectId, t.scheduledFor, {
    id: t.id,
    bucket: t.bucket,
    weekStart: t.weekStart, monthStart: t.monthStart, seasonStart: t.seasonStart,
    isGoal: t.isGoal,
    isAllDay: t.isAllDay,
    plannedOn: t.plannedOn,
    parentTaskId: t.parentTaskId,
    sourceId: t.sourceId, goalId: t.goalId, goalTaskId: t.goalTaskId, supportsGoalTaskId: t.supportsGoalTaskId,
    context: t.context ?? null,
    assignedTo: t.assignedTo ?? null, assignedToAll: t.assignedToAll,
    category: t.category,
    location: t.location, locationPlaceId: t.locationPlaceId,
    notes: t.notes, links: t.links,
    phoneNumber: t.phoneNumber, email: t.email,
    needsDiscussion: t.needsDiscussion, discussionNote: t.discussionNote,
    neededOn: t.neededOn, isFun: t.isFun,
  }]
}

/** Put a deleted task back, then its pieces. True when the row is back. */
export async function restoreDeleted(addTask: AddTask, t: Task): Promise<boolean> {
  const id = await addTask(...restoreArgs(t))
  if (!id) return false
  for (const st of t.subtasks ?? []) await addTask(...restoreArgs({ ...st, parentTaskId: t.id }))
  return true
}

/** "Delete for good?", or how many pieces go with it. */
export function deleteQuestion(t: Task): string {
  const n = (t.subtasks ?? []).length
  return n ? `Delete it and its ${n} piece${n === 1 ? '' : 's'}?` : 'Delete for good?'
}
