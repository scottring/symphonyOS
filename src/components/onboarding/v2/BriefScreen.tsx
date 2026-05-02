import { useEffect, useMemo, useState } from 'react'
import { OnboardingShell, OnboardingCta } from './OnboardingShell'
import { useOnboarding } from '@/contexts/OnboardingContext'
import { useWeeklyBrief } from '@/hooks/useWeeklyBrief'
import { useGeneratePlan } from '@/hooks/useGeneratePlan'
import { sundayOfWeek, formatDateMonthDay } from '@/lib/weekHelpers'

const SUGGESTION_CHIPS = [
  '+ try one new recipe',
  '+ use Sunday leftovers',
  '+ a simple Tuesday',
  '+ go pantry-forward',
  '+ veggie-heavy lunches',
]

interface Props {
  onBack: () => void
  onGenerated: () => void
}

/** Step 4: pre-filled brief composer + generate. Reuses the same hooks as
 *  the regular planner page (useWeeklyBrief / useGeneratePlan), but renders
 *  a richer onboarding-styled layout around the textarea. */
export function BriefScreen({ onBack, onGenerated }: Props) {
  const { brief: stateBrief, setBrief, buildPrefilledBrief } = useOnboarding()
  const weekStart = useMemo(() => sundayOfWeek(new Date()), [])
  const weekEnd = useMemo(() => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 5)
    return d
  }, [weekStart])

  const { brief, loading, setBody } = useWeeklyBrief(weekStart)
  const { generate, generating, error: genError } = useGeneratePlan()
  const [draft, setDraft] = useState('')
  const [errorToast, setErrorToast] = useState<string | null>(null)
  const [seeded, setSeeded] = useState(false)

  // First-paint seeding: prefer existing weekly_brief body if it exists
  // (so a returning user picks up where they left off), otherwise fall back
  // to the goal-derived prefill, otherwise the OnboardingContext draft.
  useEffect(() => {
    if (loading || seeded) return
    if (brief?.body?.trim()) {
      setDraft(brief.body)
    } else if (stateBrief.trim()) {
      setDraft(stateBrief)
    } else {
      const prefill = buildPrefilledBrief()
      if (prefill) setDraft(prefill)
    }
    setSeeded(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, brief?.id])

  const lines = draft.split('\n').filter(l => l.trim().length > 0)

  const onChangeDraft = (v: string) => {
    setDraft(v)
    setBrief(v)
  }

  const insertChip = (chipText: string) => {
    const text = chipText.replace(/^\+\s*/, '')
    const next = draft.trim() ? `${draft.trim()}\n${text}` : text
    onChangeDraft(next)
  }

  const onGenerate = async () => {
    if (!draft.trim()) {
      setErrorToast('Add a line or two first.')
      return
    }
    if (draft !== brief?.body) await setBody(draft)
    const r = await generate(weekStart)
    if (!r.ok) {
      setErrorToast(r.error ?? 'Generation failed.')
      return
    }
    onGenerated()
  }

  const weekLabel = `${formatDateMonthDay(weekStart).toUpperCase()} → ${formatDateMonthDay(weekEnd).toUpperCase()}`

  return (
    <OnboardingShell
      stepNumber={4}
      eyebrow="STEP 4 · THIS WEEK'S BRIEF"
      footerLeft={<OnboardingCta onClick={onBack}>← Back</OnboardingCta>}
      footerRight={
        <OnboardingCta primary onClick={onGenerate} disabled={generating || !draft.trim()}>
          {generating ? (
            <span className="font-display italic">Drafting your week…</span>
          ) : (
            <>
              <span className="w-3.5 h-3.5 rounded-full bg-white/25 inline-grid place-items-center font-display italic text-[10px]">S</span>
              Generate my plan →
            </>
          )}
        </OnboardingCta>
      }
    >
      <div className="px-20 py-10 flex-1 flex flex-col">
        <h1 className="font-display text-[44px] leading-[1.1] text-neutral-800">
          Tell Symphony what this week looks like.
        </h1>
        <div className="h-2" />
        <p className="font-display italic text-[18px] text-neutral-500 max-w-[700px] leading-[1.4]">
          A few lines. What's special, what's off, what you want to try. Symphony reads it like a brief, not a form.
        </p>

        <div className="h-7" />

        <div className="grid gap-8 flex-1 min-h-0" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
          {/* LEFT — composer */}
          <div className="bg-bg-elevated border border-neutral-200 rounded-[14px] shadow-card flex flex-col min-h-0">
            <div className="px-[22px] py-3.5 border-b border-neutral-100 flex items-center gap-2.5 text-[12px] text-neutral-500">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-500">
                WEEK OF {weekLabel}
              </span>
              <span className="ml-auto text-primary-500 font-display italic text-[14px]">
                {lines.length} line{lines.length === 1 ? '' : 's'} · {draft.trim() ? 'ready to generate' : 'add a line'}
              </span>
            </div>
            <div className="flex-1 px-7 py-6 relative">
              {/* Numbered overlay (visible up to 6 lines) sits behind the textarea */}
              <div className="absolute left-7 top-6 bottom-6 w-8 pointer-events-none flex flex-col gap-2 text-right pr-2">
                {Array.from({ length: Math.max(lines.length + 1, 5) }).map((_, i) => (
                  <span key={i} className="font-display italic text-[16px] text-neutral-400 h-[36px] leading-[36px]">
                    {i + 1}
                  </span>
                ))}
              </div>
              <textarea
                value={draft}
                onChange={e => onChangeDraft(e.target.value)}
                placeholder="add a line…"
                className="w-full h-full resize-none bg-transparent border-0 focus:outline-none font-display text-[24px] text-neutral-800 leading-[36px] placeholder:text-neutral-300 placeholder:italic pl-10"
              />
            </div>
          </div>

          {/* RIGHT — suggestions + What you'll get */}
          <div className="flex flex-col gap-[18px] min-h-0">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400">
                SUGGESTIONS · BASED ON YOUR GOALS
              </div>
              <div className="h-2.5" />
              <div className="flex flex-wrap gap-2">
                {SUGGESTION_CHIPS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => insertChip(c)}
                    className="px-3.5 py-2 rounded-full text-[13px] font-medium bg-bg-elevated border border-neutral-200 text-neutral-600 hover:border-primary-300 hover:text-primary-600 transition-colors"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-5 bg-bg-elevated border border-neutral-200 rounded-[14px] shadow-card">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary-500">
                WHAT YOU'LL GET
              </div>
              <div className="h-3" />
              <NextLine n="1" t="A 6-day plan" sub="with dinners, lunches, and your habits applied" />
              <NextLine n="2" t="Sunday batch list" sub="cook once, place into many meals" />
              <NextLine n="3" t="Grocery list" sub="organized by store section · ready to send" />
              <NextLine n="4" t="Daily gram totals" sub="toward your 800g target" />
            </div>
          </div>
        </div>

        {(errorToast || (genError && !errorToast)) && (
          <div className="mt-4 px-4 py-2 rounded-xl border border-accent-100 bg-accent-50 text-accent-600 text-[13px] self-start">
            {errorToast ?? genError}
            {errorToast && (
              <button onClick={() => setErrorToast(null)} className="ml-3 italic underline">
                dismiss
              </button>
            )}
          </div>
        )}
      </div>
    </OnboardingShell>
  )
}

function NextLine({ n, t, sub }: { n: string; t: string; sub: string }) {
  return (
    <div className="grid gap-2.5 py-1.5" style={{ gridTemplateColumns: '24px 1fr' }}>
      <div className="font-display italic text-[16px] text-primary-500">{n}</div>
      <div>
        <div className="font-display text-[17px] text-neutral-800">{t}</div>
        <div className="text-[12px] text-neutral-500 mt-px">{sub}</div>
      </div>
    </div>
  )
}
