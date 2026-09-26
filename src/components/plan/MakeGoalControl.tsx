// src/components/plan/MakeGoalControl.tsx
//
// "Make it a goal", in task details. Always offered on an open task; when the
// task cannot be a goal, pressing it says why instead of doing nothing — the
// action is explained, never hidden (Scott, 2026-09-25).

import { useId, useState } from 'react'
import { Target } from 'lucide-react'
import type { Task } from '@/types/task'
import { goalConversion } from '@/lib/planning/goalConversion'
import { showToast } from '@/hooks/useToast'

/** Convert the SAME row, with an Undo that converts it back. */
export async function makeTaskAGoal(
  task: Pick<Task, 'id' | 'title'>,
  setGoal: (id: string, isGoal: boolean) => Promise<void> | void,
  message = `“${task.title}” is now a goal. Its lists, links and people are unchanged.`,
): Promise<void> {
  await setGoal(task.id, true)
  showToast(message, 'success', 8000, {
    label: 'Undo',
    onClick: () => { void setGoal(task.id, false) },
  })
}

export function MakeGoalControl({ task, tasks, setGoal }: {
  task: Task
  tasks: readonly Pick<Task, 'id' | 'title'>[]
  setGoal: (id: string, isGoal: boolean) => Promise<void> | void
}) {
  const [reason, setReason] = useState<string | null>(null)
  const reasonId = useId()
  if (task.isGoal || task.completed) return null
  return (
    <div className="mt-1">
      <button
        type="button"
        aria-describedby={reason ? reasonId : undefined}
        onClick={() => {
          const check = goalConversion(task, tasks)
          if (check.ok) { setReason(null); void makeTaskAGoal(task, setGoal) }
          else setReason(check.reason)
        }}
        className="inline-flex items-center gap-1 rounded text-[13px] text-primary-700 hover:underline"
      >
        <Target className="h-3.5 w-3.5" aria-hidden="true" />
        Make it a goal
      </button>
      {reason && (
        <p id={reasonId} role="status" className="mt-0.5 text-xs text-neutral-500">{reason}</p>
      )}
    </div>
  )
}
