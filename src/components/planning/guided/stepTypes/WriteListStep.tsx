// src/components/planning/guided/stepTypes/WriteListStep.tsx
//
// Write this horizon's list, fresh. Creation is ONE atomic addTask with the
// bucket in options (host.createTaskInBucket) — never create-then-setBucket.
// The soft cap is a nudge, never a wall.
import { useState, useMemo, useCallback, useRef } from 'react'
import { Plus, Sparkles, Star } from 'lucide-react'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { belongsToWeek } from '@/lib/today/weekPlacement'
import { funRatio } from '@/lib/planning/coachLines'
import { looksLikeActivity } from '@/lib/planning/outcomeCoach'
import { PICK_CAP } from '@/lib/planning/betPulse'
import { useSharpenBet } from '@/hooks/useSharpenBet'
import { useGuided } from '../GuidedContext'
import { extractProjectTag } from '../projectTag'
import { ListSuggestions, type WriteBucket } from '../ListSuggestions'
import { TaskTriageRow, SeasonListRow } from './ReviewStep'

// Hart-Unger's fun recipe (Best Laid Plans), as things you ADD rather than a
// vibe you audit. Each chip seeds the input and stamps the next item fun.
const FUN_PROMPTS = [
  { label: 'One big experience', placeholder: 'The one big thing this month — ' },
  { label: 'A few social things', placeholder: 'Something with people we like — ' },
  { label: 'A themed quest — optional', placeholder: 'A small quest, just because — ' },
] as const

// Past this many written items the list stops being readable context and starts
// being a wall. See the 2026-07-25 pass: the step's job is writing, not review.
const COLLAPSE_AT = 8

export function WriteListStep() {
  const { step, host, periodStart } = useGuided()
  // "The next thing I add is fun" — set by the composition chips, cleared on add.
  const [nextIsFun, setNextIsFun] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const bucket = step.props?.bucket
  const softCap = step.props?.softCap
  const match = useMemo(() => makeAssigneeFilter([]), [])
  const pool = useMemo(
    () => (bucket ? host.tasks.filter((t) => {
      if (t.completed || t.bucket !== bucket || !match(t.assignedTo, t.assignedToAll)) return false
      // The week list is this session's week — a move placed on a different week
      // is on that week's list, not this one's.
      if (bucket === 'week') return belongsToWeek(t, periodStart)
      return true
    }) : []),
    [host.tasks, bucket, match, periodStart],
  )

  // The level above, as fuel for AI suggestions (look, don't link): the season
  // draws from year goals, the month from the season list, the week from the
  // month list. Only the three list-writing horizons get the helper.
  const writeBucket: WriteBucket | null =
    bucket === 'quarter' || bucket === 'month' || bucket === 'week' ? bucket : null
  const above = useMemo(() => {
    if (writeBucket === 'quarter') {
      return { items: host.goals.filter((g) => g.status === 'active').map((g) => g.name), label: 'your year goals' }
    }
    const aboveBucket = writeBucket === 'month' ? 'quarter' : writeBucket === 'week' ? 'month' : null
    if (!aboveBucket) return { items: [] as string[], label: '' }
    const items = host.tasks
      // The season-above is the CHOSEN season: picks only fuel the month.
      .filter((t) => !t.completed && t.bucket === aboveBucket && match(t.assignedTo, t.assignedToAll) && (aboveBucket !== 'quarter' || !!t.pickedAt))
      .map((t) => t.title)
    return { items, label: aboveBucket === 'quarter' ? 'your season list' : 'your month list' }
  }, [writeBucket, host.goals, host.tasks, match])

  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')
  const { sharpen: sharpenBet, loading: sharpenBetLoading } = useSharpenBet()
  const submit = useCallback(async () => {
    const raw = draft.trim()
    if (!raw || !bucket) return
    setDraft('')
    // "#kitchen order dishwasher" attaches the chunk to its project at birth.
    const { title, projectId } = extractProjectTag(raw, host.projects)
    if (!title) return
    await host.createTaskInBucket(title, bucket, { projectId, isFun: nextIsFun || undefined })
    setNextIsFun(false)
  }, [draft, bucket, host, nextIsFun])

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
        <input type="text" value={draft} autoFocus ref={inputRef}
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
      {/* Bets read best as outcomes, not activities — a quiet hint, never a block. */}
      {step.props?.rows === 'bets' && looksLikeActivity(draft) && (
        <p className="text-[11px] text-amber-700 mt-1 inline-flex items-center gap-1.5">
          Picks read best as outcomes — what will be true by season&rsquo;s end?
          <button
            type="button"
            onClick={async () => {
              const suggestion = await sharpenBet(draft)
              if (suggestion) setDraft(suggestion)
            }}
            disabled={sharpenBetLoading}
            className="inline-flex items-center gap-1 font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Sparkles className="w-3 h-3" />
            {sharpenBetLoading ? 'Sharpening…' : 'Sharpen'}
          </button>
        </p>
      )}
      {/* AI fuel for the blank page: a spread of this-horizon-sized moves drawn
          from the level above. Tap-to-FILL only — the human always confirms. */}
      {writeBucket && (
        <ListSuggestions
          bucket={writeBucket}
          aboveItems={above.items}
          aboveLabel={above.label}
          existingItems={pool.map((t) => t.title)}
          onPick={(t) => { setDraft(t); inputRef.current?.focus() }}
        />
      )}
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
      {/* The picks cap, live: writing is unlimited (the shelf absorbs it), but
          only PICK_CAP get picked. Never blocks — just names the shape. */}
      {step.props?.rows === 'bets' && (
        <p className={`text-[11px] mb-2 ${pool.length > PICK_CAP ? 'text-amber-700 font-medium' : 'text-neutral-400'}`}>
          {pool.filter((t) => t.pickedAt).length} of {PICK_CAP} picked · {pool.length} written — 5 is a season; 19 is a backlog.
        </p>
      )}
      {/* Hart-Unger's fun recipe (Best Laid Plans): name the composition so
          "fun" means a shape, not a vibe. Static hint — no classification. */}
      {step.props?.funComposition && (
        <div className="flex flex-wrap items-center gap-1.5">
          {FUN_PROMPTS.map(({ label, placeholder }) => (
            <button key={label} type="button"
              onClick={() => { setNextIsFun(true); setDraft(placeholder); inputRef.current?.focus() }}
              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50/60 px-2.5 py-1 text-[11px] text-amber-700 hover:bg-amber-100 transition-colors">
              <Sparkles className="w-3 h-3" />
              {label}
            </button>
          ))}
          {nextIsFun && (
            <span className="text-[11px] text-amber-700 font-medium">— adding as fun</span>
          )}
        </div>
      )}
      {/* The written list is CONTEXT here, not the task. This step asks what the
          month needs; a wall of thirty rows, each carrying a ✨ and a Change,
          read as "audit these" and buried the one input that does the work.
          Collapsed by default once it's long — the count is the useful part. */}
      {pool.length > COLLAPSE_AT && !listOpen && (
        <button type="button" onClick={() => setListOpen(true)}
          className="w-full rounded-xl border border-neutral-200 bg-neutral-50/70 px-4 py-2.5 text-left text-xs text-neutral-500 hover:bg-neutral-100 transition-colors">
          <span className="font-medium text-neutral-700">{pool.length} already written</span>
          {' · '}{funRatio(pool).fun} fun{' · '}tap to review
        </button>
      )}
      {pool.length > 0 && (pool.length <= COLLAPSE_AT || listOpen) && (
        <ul className="space-y-2">
          {pool.map((t) => (
            <li key={t.id} className="flex items-start gap-1.5">
              {step.props?.rows === 'bets' && (
                <button type="button"
                  onClick={() => host.onUpdateTask(t.id, { pickedAt: t.pickedAt ? undefined : new Date() })}
                  aria-label={t.pickedAt ? 'Move to shelf' : 'Pick for the season'}
                  aria-pressed={t.pickedAt != null}
                  title={t.pickedAt ? 'Picked — tap to shelve' : 'Pick it for the season'}
                  className={`shrink-0 mt-1.5 p-1 rounded-md transition-colors ${
                    t.pickedAt ? 'text-primary-600 bg-primary-50' : 'text-neutral-300 hover:text-primary-600 hover:bg-primary-50'}`}>
                  <Star className="w-3.5 h-3.5" />
                </button>
              )}
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
                {step.props?.rows === 'bets' || step.props?.rows === 'plain'
                  ? <SeasonListRow task={t} /> : <TaskTriageRow task={t} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
