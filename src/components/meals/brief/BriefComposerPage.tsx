import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWeeklyBrief } from '@/hooks/useWeeklyBrief'
import { mondayOfWeek, formatDateMonthDay } from '@/lib/weekHelpers'
import { MealsTabs } from '../MealsTabs'

const PLACEHOLDER = `800g challenge · No stir fry this week · Bittman shrimp — finally!`
const HINT = 'Add more thoughts, goals, exclusions, cravings, experiments…'
const MAX = 500

/** Surface 1 — Weekly Brief composer. The free-form text Iris types Sunday
 *  morning. Symphony drafts the plan from this. */
export function BriefComposerPage() {
  const navigate = useNavigate()
  const weekStart = useMemo(() => mondayOfWeek(new Date()), [])
  const weekIndex = useMemo(() => Math.ceil((Date.now() - new Date(weekStart.getFullYear(), 0, 1).getTime()) / (7 * 86400000)), [weekStart])
  const { brief, loading, setBody, markGenerated } = useWeeklyBrief(weekStart)

  const [draft, setDraft] = useState('')
  const [generating, setGenerating] = useState(false)

  useEffect(() => { if (brief) setDraft(brief.body) }, [brief?.id])

  const charCount = draft.length
  const canGenerate = draft.trim().length > 0 && !generating

  const onChange = (next: string) => {
    setDraft(next.slice(0, MAX))
  }

  const onBlur = () => {
    if (draft !== brief?.body) void setBody(draft)
  }

  const onGenerate = async () => {
    setGenerating(true)
    if (draft !== brief?.body) await setBody(draft)
    await markGenerated()
    setGenerating(false)
    navigate('/meals/plan')
  }

  if (loading) {
    return (
      <div className="px-12 py-12 max-w-3xl mx-auto">
        <MealsTabs />
        <div className="text-[12px] uppercase tracking-widest text-neutral-400">Loading…</div>
      </div>
    )
  }

  return (
    <div className="px-12 py-12 max-w-3xl mx-auto">
      <MealsTabs />

      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-500 mb-2">
        WEEK OF {formatDateMonthDay(weekStart).toUpperCase()} · WEEK {weekIndex}
      </div>
      <h1 className="font-display text-[3rem] leading-[1.05] text-neutral-800">
        Family Meal <span className="italic text-primary-500">Plan.</span>
      </h1>
      <p className="font-display italic text-[1.1rem] text-neutral-500 mt-2">
        Tell Symphony what shape this week wants to take.
      </p>

      {/* Brief textarea */}
      <div className="mt-8 rounded-3xl border border-neutral-200 bg-bg-elevated shadow-card p-5">
        <textarea
          value={draft}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
          rows={6}
          autoFocus
          placeholder={PLACEHOLDER}
          className="w-full bg-transparent resize-none focus:outline-none
                     font-display text-[1.4rem] leading-[1.45] text-neutral-800 placeholder:text-neutral-400"
        />
        <div className="mt-2 flex items-end justify-between gap-3">
          <p className="font-display italic text-[0.95rem] text-neutral-400 max-w-md">
            {HINT}
          </p>
          <span className="text-[11px] font-medium text-neutral-400 tabular-nums">
            {charCount}/{MAX}
          </span>
        </div>
      </div>

      {/* CTA row */}
      <div className="mt-5 flex items-center justify-between gap-4">
        <p className="text-[12px] text-neutral-500 italic">
          Symphony will draft your full week from this.
        </p>
        <button
          onClick={onGenerate}
          disabled={!canGenerate}
          className="px-5 py-2.5 rounded-full bg-primary-500 text-white text-[13px] font-medium
                     shadow-primary hover:bg-primary-600 disabled:opacity-40 flex items-center gap-2"
        >
          <span className="text-[15px]">✦</span>
          <span className="text-[10px] uppercase tracking-[0.18em] mr-1 px-1.5 py-0.5 rounded
                           bg-white/15 font-bold">Enter</span>
          {generating ? 'Generating…' : 'Generate plan'}
        </button>
      </div>
      <p className="text-[11px] italic text-neutral-400 mt-2 text-right">
        Shift + Enter for new line
      </p>

      {/* Status hint */}
      {brief?.status === 'generated' && brief.generatedAt && (
        <p className="mt-6 text-[12px] italic text-neutral-400">
          Last generated {brief.generatedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.
        </p>
      )}
    </div>
  )
}
