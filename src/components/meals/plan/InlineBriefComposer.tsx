import { useState, useEffect } from 'react'
import { useWeeklyBrief } from '@/hooks/useWeeklyBrief'
import { useGeneratePlan } from '@/hooks/useGeneratePlan'
import { useGeneratePlanContext } from '@/contexts/GeneratePlanContext'
import { ConceptIcon } from '@/lib/conceptIcons'

const PLACEHOLDER = `800g challenge · No stir fry this week · Bittman shrimp — finally!`
const HINT = 'Add more thoughts, goals, exclusions, cravings, experiments…'
const MAX = 4000

interface Props {
  /** Current week start (Monday for now; will become Sunday in Phase B). */
  weekStart: Date
}

/** Inline brief composer: the textarea + Generate CTA, lifted from the
 *  standalone BriefComposerPage. After generate, scrolls smoothly to #read. */
export function InlineBriefComposer({ weekStart }: Props) {
  const { brief, loading, setBody } = useWeeklyBrief(weekStart)
  const { generate, generating, error: genError } = useGeneratePlan()
  const { setLastUndoToken } = useGeneratePlanContext()

  const [draft, setDraft] = useState('')
  const [errorToast, setErrorToast] = useState<string | null>(null)

  useEffect(() => { if (brief) setDraft(brief.body) }, [brief?.id])

  const charCount = draft.length

  const onChange = (next: string) => {
    setDraft(next)
  }

  const overLimit = charCount > MAX

  const onBlur = () => {
    if (draft !== brief?.body) void setBody(draft)
  }

  const onGenerate = async () => {
    if (!draft.trim()) {
      setErrorToast('Write something in the brief first.')
      return
    }
    if (draft !== brief?.body) await setBody(draft)
    const r = await generate(weekStart)
    if (!r.ok) {
      setErrorToast(r.error ?? 'Generation failed.')
      return
    }
    if (r.result?.undoToken) setLastUndoToken({ ...r.result.undoToken, description: 'Plan drafted from your brief.' })
    document.getElementById('read')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-neutral-200 bg-bg-elevated shadow-card p-5">
        <div className="text-[12px] uppercase tracking-widest text-neutral-400">Loading…</div>
      </div>
    )
  }

  return (
    <div className="rounded-3xl border border-neutral-200 bg-bg-elevated shadow-card p-5">
      <textarea
        value={draft}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        rows={6}
        placeholder={PLACEHOLDER}
        className="w-full bg-transparent resize-none focus:outline-none
                   font-display text-[1.4rem] leading-[1.45] text-neutral-800 placeholder:text-neutral-400"
      />
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="font-display italic text-[0.95rem] text-neutral-400 max-w-md">
          {HINT}
        </p>
        <span className={`text-[11px] font-medium tabular-nums ${overLimit ? 'text-accent-500' : 'text-neutral-400'}`}>
          {charCount}/{MAX}
        </span>
      </div>

      {/* CTA row */}
      <div className="mt-5 flex items-center justify-between gap-4">
        <p className="text-[12px] text-neutral-500 italic">
          Symphony will draft your full week from this.
        </p>
        <button
          onClick={onGenerate}
          disabled={!draft.trim() || generating}
          className="px-5 py-2.5 rounded-full bg-primary-500 text-white text-[13px] font-medium
                     shadow-primary hover:bg-primary-600 disabled:opacity-40 flex items-center gap-2"
        >
          {generating ? (
            <span className="font-display italic">Drafting your week…</span>
          ) : (
            <>
              <ConceptIcon name="ai" size={15} decorative />
              <span className="text-[10px] uppercase tracking-[0.18em] mr-1 px-1.5 py-0.5 rounded
                               bg-white/15 font-bold">Enter</span>
              Generate plan
            </>
          )}
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

      {/* Toasts */}
      {errorToast && (
        <div className="mt-4 px-4 py-2 rounded-xl border border-accent-100 bg-accent-50 text-accent-600 text-[13px]">
          {errorToast}
          <button onClick={() => setErrorToast(null)} className="ml-3 italic underline">
            dismiss
          </button>
        </div>
      )}
      {genError && !errorToast && (
        <div className="mt-4 text-[13px] italic text-accent-500">{genError}</div>
      )}
    </div>
  )
}
