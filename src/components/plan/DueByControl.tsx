// The done-by date in a task's details (Scott, 2026-11-13: "amazon items
// need to show a bit before today"). A plain date field; clearing it removes
// the date. Today brings the task into To do three days before (dueSoon.ts).
import type { Task } from '@/types/task'
import { localYmd, parseLocalYmd } from '@/lib/cadence/config'

export function DueByControl({ task, onUpdateTask }: {
  task: Pick<Task, 'id' | 'dueOn'>
  onUpdateTask: (id: string, updates: Partial<Task>) => unknown
}) {
  const id = `due-by-${task.id}`
  return (
    <span className="due-by-control inline-flex items-center gap-1.5 text-[13px] text-neutral-600">
      <label htmlFor={id}>Due by</label>
      <input
        id={id}
        type="date"
        value={task.dueOn ? localYmd(task.dueOn) : ''}
        onChange={(e) => { void onUpdateTask(task.id, { dueOn: e.target.value ? parseLocalYmd(e.target.value) : undefined }) }}
        className="rounded-md border border-neutral-200 bg-transparent px-1.5 py-0.5 text-[13px] text-neutral-800"
      />
    </span>
  )
}
