// Goals with an open choice: the projects someone is in the middle of, so
// Today can offer a way back to them after the day's tasks are ticked off.
// Facts only: which goal, which choices are still open.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { GoalRef } from '@/types/choice'
import type { TaskContext } from '@/types/task'

type Db = Pick<SupabaseClient, 'from'>

export interface InProgressGoal {
  goal: GoalRef
  title: string
  context: TaskContext | null
  choices: { id: string; title: string }[]
}

/** Open choices grouped under their goals, oldest choice first. A finished
 *  goal (ticked task, or a year goal no longer active) is left out. null =
 *  a read failed. */
export async function listInProgressGoals(db: Db): Promise<InProgressGoal[] | null> {
  const open = await db.from('choices').select('id, title, goal_task_id, goal_id')
    .eq('status', 'open').order('created_at', { ascending: true })
  if (open.error || !open.data) return null
  const rows = open.data as { id: string; title: string; goal_task_id: string | null; goal_id: string | null }[]
  if (rows.length === 0) return []

  const taskIds = [...new Set(rows.map((r) => r.goal_task_id).filter((id): id is string => !!id))]
  const goalIds = [...new Set(rows.map((r) => r.goal_id).filter((id): id is string => !!id))]
  const live = new Map<string, { title: string; context: TaskContext | null }>()
  if (taskIds.length > 0) {
    const res = await db.from('tasks').select('id, title, context, completed').in('id', taskIds)
    if (res.error || !res.data) return null
    for (const t of res.data as { id: string; title: string; context: TaskContext | null; completed: boolean }[]) {
      if (!t.completed) live.set(`task:${t.id}`, { title: t.title, context: t.context })
    }
  }
  if (goalIds.length > 0) {
    const res = await db.from('goals').select('id, name, context, status').in('id', goalIds)
    if (res.error || !res.data) return null
    for (const g of res.data as { id: string; name: string; context: TaskContext | null; status: string | null }[]) {
      if ((g.status ?? 'active') === 'active') live.set(`goal:${g.id}`, { title: g.name, context: g.context })
    }
  }

  const byGoal = new Map<string, InProgressGoal>()
  for (const r of rows) {
    const goal: GoalRef = r.goal_task_id ? { kind: 'task', id: r.goal_task_id } : { kind: 'goal', id: r.goal_id! }
    const key = `${goal.kind}:${goal.id}`
    const facts = live.get(key)
    if (!facts) continue
    const entry = byGoal.get(key) ?? { goal, title: facts.title, context: facts.context, choices: [] }
    entry.choices.push({ id: r.id, title: r.title })
    byGoal.set(key, entry)
  }
  return [...byGoal.values()]
}
