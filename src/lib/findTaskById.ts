// src/lib/findTaskById.ts
//
// One task lookup that reaches SUBTASKS.
//
// Subtasks are nested under their parent by `nestSubtasks`, so the obvious
// `tasks.find(t => t.id === id)` silently misses every per-person item. Anything
// that has to agree with useSupabaseTasks' `toggleTask` about a task's state
// must walk the nesting the same way it does — HomeView's undo toast did not,
// so completing a per-person item read `wasCompleted` off `undefined`: the
// toast named the wrong verb and its Undo wrote the wrong value back.

import type { Task } from '@/types/task'

/** The task with this id, whether it is a top-level row or a nested subtask. */
export function findTaskById(tasks: Task[], id: string): Task | undefined {
  for (const task of tasks) {
    if (task.id === id) return task
    const subtask = task.subtasks?.find((s) => s.id === id)
    if (subtask) return subtask
  }
  return undefined
}
