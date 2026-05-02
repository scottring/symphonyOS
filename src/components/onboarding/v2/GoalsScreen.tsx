import { useMemo } from 'react'
import { OnboardingShell, OnboardingCta } from './OnboardingShell'
import { useOnboarding, GOAL_PRESETS, type GoalKey } from '@/contexts/OnboardingContext'

const GOAL_SUBS: Record<GoalKey, string> = {
  eight_hundred_g:       'fruit + veg by weight',
  waste_less:            'use what we have',
  eat_together:          'family dinners > solo',
  kid_favorites:         'parallel plates',
  batch_friendly:        'cook once, eat thrice',
  low_effort_weeknights: 'under 30 min',
  seasonal:              "follow what's good",
  new_techniques:        'one stretch dish',
}

interface Props {
  onBack: () => void
  onContinue: () => void
}

export function GoalsScreen({ onBack, onContinue }: Props) {
  const { goals, setSelectedGoals, setCustomGoal } = useOnboarding()
  const selectedSet = useMemo(() => new Set(goals.selected), [goals.selected])

  const toggle = (key: GoalKey) => {
    if (selectedSet.has(key)) {
      setSelectedGoals(goals.selected.filter(g => g !== key))
    } else if (goals.selected.length < 2) {
      setSelectedGoals([...goals.selected, key])
    } else {
      // Replace the older one (FIFO) so users can swap freely.
      setSelectedGoals([goals.selected[1], key])
    }
  }

  const summaryLabels = goals.selected
    .map(k => GOAL_PRESETS.find(p => p.key === k)?.label)
    .filter(Boolean)

  return (
    <OnboardingShell
      stepNumber={2}
      eyebrow="STEP 2 · GOALS"
      footerLeft={<OnboardingCta onClick={onBack}>← Back</OnboardingCta>}
      footerRight={<OnboardingCta primary onClick={onContinue}>Continue →</OnboardingCta>}
    >
      <div className="px-20 py-10 flex-1 flex flex-col">
        <h1 className="font-display text-[48px] leading-[1.1] text-neutral-800">What's the point this season?</h1>
        <div className="h-2" />
        <p className="font-display italic text-[18px] text-neutral-500 max-w-[620px] leading-[1.4]">
          Pick one or two. Symphony will favor plans that lean into them — and respect them when you push back.
        </p>

        <div className="h-8" />

        <div className="grid gap-3 max-w-[980px]" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {GOAL_PRESETS.map(g => {
            const selected = selectedSet.has(g.key)
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => toggle(g.key)}
                className={`
                  text-left p-[18px] rounded-[14px] border transition-all relative
                  ${selected
                    ? 'bg-accent-50 border-accent-300'
                    : 'bg-bg-elevated border-neutral-200 hover:border-neutral-300'}
                `}
              >
                {selected && (
                  <span className="absolute top-3 right-3 w-[18px] h-[18px] rounded-full bg-accent-500 text-white grid place-items-center text-[11px]">
                    ✓
                  </span>
                )}
                <div className="font-display text-[22px] text-neutral-800 leading-[1.2]">{g.label}</div>
                <div className="h-1" />
                <div className="text-[12.5px] text-neutral-500">{GOAL_SUBS[g.key]}</div>
              </button>
            )
          })}
        </div>

        <div className="h-6" />
        <div className="max-w-[600px]">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400">
            OR DESCRIBE IT YOUR WAY
          </div>
          <div className="h-2" />
          <textarea
            value={goals.custom}
            onChange={e => setCustomGoal(e.target.value)}
            placeholder="cook 4 weeknights, eat more lentils, no fish for the kids…"
            rows={2}
            className="w-full bg-bg-elevated border border-neutral-200 rounded-xl px-[18px] py-3.5 font-display italic text-[18px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:border-primary-400 resize-none"
          />
        </div>

        <div className="flex-1" />

        {(summaryLabels.length > 0 || goals.custom.trim()) && (
          <div className="mt-4 px-4 py-3 bg-accent-50 border border-accent-100 rounded-[10px] inline-flex items-center gap-2.5 self-start">
            <span className="font-display italic text-[16px] text-accent-500">
              {summaryLabels.length} selected
            </span>
            {summaryLabels.length > 0 && (
              <>
                <span className="text-neutral-300">·</span>
                <span className="text-[13px] text-neutral-600">
                  {summaryLabels.map((label, i) => (
                    <span key={i}>
                      {i > 0 && ' + '}
                      <strong className="font-medium">{label}</strong>
                    </span>
                  ))}
                </span>
              </>
            )}
            {goals.custom.trim() && summaryLabels.length === 0 && (
              <>
                <span className="text-neutral-300">·</span>
                <span className="text-[13px] text-neutral-600 italic">in your words</span>
              </>
            )}
          </div>
        )}
      </div>
    </OnboardingShell>
  )
}
