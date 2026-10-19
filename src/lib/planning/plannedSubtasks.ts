// A step of a line that has been planned for a week or given a day is week
// work, wherever it was written (spec 2026-10-19). Most steps are subtasks
// (`parentTaskId`), which `nestSubtasks` keeps under their parent and off the
// top level, so the Week page never drew one: "Inventory all documents" put on
// this week vanished from it. Today already reaches dated subtasks
// (taskPools.selectTimed); this gives the Week page the same reach.

import type { Task } from '@/types/task'

/** The list plus each nested subtask that has a week or a day of its own.
 *  A subtask still nested stays nested too; it is only also drawn. A date
 *  copied from the parent is the parent's, not the step's own. */
export function withPlacedSubtasks(tasks: Task[]): Task[] {
  const top = new Set(tasks.map((t) => t.id))
  const extra: Task[] = []
  for (const t of tasks) {
    for (const s of t.subtasks ?? []) {
      if (top.has(s.id)) continue
      const ownWeek = (s.commitments ?? []).some((c) => c.level === 'week' && c.status !== 'removed')
      const ownDay = !!s.scheduledFor && !(t.scheduledFor && s.scheduledFor.getTime() === t.scheduledFor.getTime())
      if (ownWeek || ownDay) { extra.push(s); top.add(s.id) }
    }
  }
  return extra.length ? [...tasks, ...extra] : tasks
}
