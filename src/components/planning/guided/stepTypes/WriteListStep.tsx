// src/components/planning/guided/stepTypes/WriteListStep.tsx
//
// Write this horizon's list, fresh. Creation is ONE atomic addTask with the
// bucket in options (host.createTaskInBucket) — never create-then-setBucket.
// The soft cap is a nudge, never a wall.
import { useState, useMemo, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { useGuided } from '../GuidedContext'
import { extractProjectTag } from '../projectTag'
import { TaskTriageRow } from './ReviewStep'

export function WriteListStep() {
  const { step, host } = useGuided()
  const bucket = step.props?.bucket
  const softCap = step.props?.softCap
  const match = useMemo(() => makeAssigneeFilter([]), [])
  const pool = useMemo(
    () => (bucket ? host.tasks.filter((t) => !t.completed && t.bucket === bucket && match(t.assignedTo, t.assignedToAll)) : []),
    [host.tasks, bucket, match],
  )

  const [draft, setDraft] = useState('')
  const submit = useCallback(async () => {
    const raw = draft.trim()
    if (!raw || !bucket) return
    setDraft('')
    // "#kitchen order dishwasher" attaches the chunk to its project at birth.
    const { title, projectId } = extractProjectTag(raw, host.projects)
    if (!title) return
    await host.createTaskInBucket(title, bucket, projectId)
  }, [draft, bucket, host])

  if (!bucket) return null
  const over = softCap !== undefined && pool.length > softCap

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl border border-neutral-200 bg-white focus-within:border-primary-400 transition-colors">
        <button type="button" onClick={() => void submit()} aria-label="Add to this plan"
          className="shrink-0 w-6 h-6 rounded-full bg-primary-600 text-white grid place-items-center hover:bg-primary-700 transition-colors">
          <Plus className="w-4 h-4" />
        </button>
        <input type="text" value={draft} autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
          placeholder="Add to this list… (#project attaches it)"
          className="flex-1 min-w-0 text-sm bg-transparent placeholder:text-neutral-400 focus:outline-none"
        />
      </div>
      {softCap !== undefined && (
        <p className={`text-xs ${over ? 'text-amber-600' : 'text-neutral-400'}`}>
          {pool.length} of ~{softCap}{over ? ' — a list you believe beats a list you admire' : ''}
        </p>
      )}
      {pool.length > 0 && <ul className="space-y-2">{pool.map((t) => <TaskTriageRow key={t.id} task={t} />)}</ul>}
    </div>
  )
}
