// The week shows the steps, not the goal (Scott, 2026-11-07: "we want the
// subgoals to show, not the top level"). A line on the week that is a goal
// (`isGoal`, its steps by `goalTaskId`) or a parent (its `subtasks`) stands
// for the work under it: the week draws that work's open steps instead. A
// goal or parent with no open step is drawn itself, so nothing on the week
// disappears. Each step is the same task wherever it shows.

import type { Task } from '@/types/task'

const open = (t: Task) => !t.completed && !t.dismissedAt

export function stepsInstead(listed: readonly Task[], all: readonly Task[]): Task[] {
  const out: Task[] = []
  const seen = new Set<string>()
  const add = (t: Task) => { if (!seen.has(t.id)) { seen.add(t.id); out.push(t) } }
  for (const t of listed) {
    const steps = t.completed ? [] : [
      ...(t.subtasks ?? []).filter(open),
      ...(t.isGoal ? all.filter((s) => s.goalTaskId === t.id && s.id !== t.id && open(s)) : []),
    ]
    if (steps.length === 0) add(t)
    else for (const s of steps) add(s)
  }
  return out
}
