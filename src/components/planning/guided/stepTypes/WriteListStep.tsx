// src/components/planning/guided/stepTypes/WriteListStep.tsx
//
// Write this horizon's list, fresh. Creation is ONE atomic addTask with the
// bucket in options (host.createTaskInBucket) — never create-then-setBucket.
// The soft cap is a nudge, never a wall.
import { useState, useMemo, useCallback } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { funRatio } from '@/lib/planning/coachLines'
import { useGuided } from '../GuidedContext'
import { extractProjectTag } from '../projectTag'
import { TaskTriageRow, SeasonListRow } from './ReviewStep'

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
    await host.createTaskInBucket(title, bucket, { projectId })
  }, [draft, bucket, host])

  if (!bucket) return null
  const over = softCap !== undefined && pool.length > softCap
  // The grain rule, stated where lists get written. One line, always visible:
  // this is what keeps season lists from filling with week-sized crumbs.
  const GRAIN_HINT: Partial<Record<string, string>> = {
    quarter: 'Season grain: outcomes you can finish in these three months. One sitting belongs on a week; one chunk on a month.',
    month: 'Month grain: one concrete chunk each — an order placed, a call made, a decision written down.',
    week: 'Week grain: single sittings. If it needs several, it’s a month item wearing a week costume.',
  }
  const grainHint = GRAIN_HINT[bucket]

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
          placeholder={
            bucket === 'quarter' ? 'Add an outcome for this season… (#project attaches it)'
            : bucket === 'month' ? 'Add a chunk to this month… (#project attaches it)'
            : 'Add a task to this week… (#project attaches it)'
          }
          className="flex-1 min-w-0 text-sm bg-transparent placeholder:text-neutral-400 focus:outline-none"
        />
      </div>
      {grainHint && <p className="text-xs text-neutral-400 italic">{grainHint}</p>}
      {/* The pivotal shift from looking → writing. When the list is still empty,
          say plainly that THIS is where you compose it, and frame the list as
          its own artifact (look, don't link) so the standalone list reads as
          intentional, not disconnected (walkthrough #11, #12). */}
      {pool.length === 0 && (
        <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50/40 px-4 py-3">
          <p className="text-sm font-medium text-neutral-700">
            {bucket === 'quarter' ? 'This is your season list — write it here.'
              : bucket === 'month' ? 'This is your month list — write it here.'
              : 'This is your week list — write it here.'}
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            Type in the box above and press Enter. It&rsquo;s your own list — the goals and
            projects you just looked at are fuel, not a checklist to copy.
          </p>
        </div>
      )}
      {softCap !== undefined && (
        <p className={`text-xs ${over ? 'text-amber-600' : 'text-neutral-400'}`}>
          {pool.length} of ~{softCap}{over ? ' — a list you believe beats a list you admire' : ''}
        </p>
      )}
      {/* The fun audit, live: tally chip + per-row ✨ toggle (Best Laid Plans'
          2:1 rule). Marking is one tap; the coach line reads the same data. */}
      {pool.length > 0 && (
        <p className="text-xs text-neutral-400 inline-flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-500" />
          {funRatio(pool).fun} fun · {funRatio(pool).obligation} obligation — tap ✨ on the ones that make you smile
        </p>
      )}
      {pool.length > 0 && (
        <ul className="space-y-2">
          {pool.map((t) => (
            <li key={t.id} className="flex items-start gap-1.5">
              <button type="button"
                onClick={() => host.onUpdateTask(t.id, { isFun: !t.isFun })}
                aria-label={t.isFun ? 'Unmark as fun' : 'Mark as fun'}
                aria-pressed={t.isFun === true}
                title={t.isFun ? 'Marked fun' : 'This one makes me smile'}
                className={`shrink-0 mt-1.5 p-1 rounded-md transition-colors ${
                  t.isFun ? 'text-amber-500 bg-amber-50' : 'text-neutral-300 hover:text-amber-500 hover:bg-amber-50'}`}>
                <Sparkles className="w-3.5 h-3.5" />
              </button>
              <div className="flex-1 min-w-0">
                {/* Season-altitude lists don't route items to days/weeks or complete
                    them here — the list itself is the artifact. Plain rows only. */}
                {step.props?.rows === 'plain' ? <SeasonListRow task={t} /> : <TaskTriageRow task={t} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
