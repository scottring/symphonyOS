// src/components/planning/guided/stepTypes/InboxStep.tsx
//
// Weekly "Look Around": drive the inbox to zero with the same triage rows.
// The count in the header falls as items get homes — inbox zero is the
// step's visible win.
import { useMemo } from 'react'
import { Inbox, PartyPopper } from 'lucide-react'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { useGuided } from '../GuidedContext'
import { TaskTriageRow } from './ReviewStep'

export function InboxStep() {
  const { host } = useGuided()
  const match = useMemo(() => makeAssigneeFilter([]), [])
  const pool = useMemo(
    () => host.tasks.filter((t) => !t.completed && t.bucket === 'inbox' && match(t.assignedTo, t.assignedToAll)),
    [host.tasks, match],
  )
  if (host.tasksLoading) return <p className="text-sm text-neutral-400">Gathering your inbox…</p>
  if (pool.length === 0) {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-primary-700">
        <PartyPopper className="w-4 h-4" /> Inbox zero. You are planning from reality.
      </p>
    )
  }
  return (
    <div>
      <p className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-neutral-400 mb-3">
        <Inbox className="w-3.5 h-3.5" /> {pool.length} to process
      </p>
      <ul className="space-y-2">{pool.map((t) => <TaskTriageRow key={t.id} task={t} />)}</ul>
    </div>
  )
}
