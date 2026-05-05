import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useMealPlan } from '@/hooks/useMealPlan'
import { useStandingHabits } from '@/hooks/useStandingHabits'
import { sundayOfWeek } from '@/lib/weekHelpers'
import { OnboardingShell } from './OnboardingShell'
import {
  useOnboarding,
  rhythmToSlot,
  rhythmToLabel,
} from '@/contexts/OnboardingContext'

// No props — NowWhatScreen handles its own navigation per-card. The flow
// completes when the user clicks one of the three action cards (or closes
// the tab). Persistence happens on mount; nothing else here needs to fire
// before the user leaves.
type Props = Record<string, never>

/** Terminal screen — also where the durable mutations land. On mount we write
 *  household + season_goals to user_profiles, insert the parsed rhythm habits
 *  as standing_habits rows, and stamp onboarding_completed_at. Failures
 *  surface a toast but do NOT block the user from leaving with their plan. */
 
export function NowWhatScreen(_props: Props = {} as Props) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { household, goals, rhythms } = useOnboarding()
  const weekStart = useMemo(() => sundayOfWeek(new Date()), [])
  const { plan } = useMealPlan(weekStart)
  const { habits } = useStandingHabits()
  const persisted = useRef(false)
  const [persistError, setPersistError] = useState<string | null>(null)

  useEffect(() => {
    if (!user || persisted.current) return
    persisted.current = true

    void (async () => {
      const errors: string[] = []

      // 1. user_profiles upsert with household + goals + completion stamp.
      const profilePayload = {
        user_id: user.id,
        household: {
          adults: household.adults.filter(a => a.name.trim()),
          kids: household.kids.filter(k => k.name.trim()),
        },
        season_goals: {
          selected: goals.selected,
          ...(goals.custom.trim() ? { custom: goals.custom.trim() } : {}),
        },
        onboarding_completed_at: new Date().toISOString(),
      }
      const { error: profileErr } = await supabase
        .from('user_profiles')
        .upsert(profilePayload, { onConflict: 'user_id' })
      if (profileErr) errors.push(`profile: ${profileErr.message}`)

      // 2. standing_habits inserts (only the parsed rhythm rows).
      const rows = rhythms.parsed
        .filter(h => h.what.trim())
        .map((h, i) => ({
          user_id: user.id,
          name: h.what.trim(),
          slot: rhythmToSlot(h.when),
          when_label: rhythmToLabel(h.when),
          detail: h.detail?.trim() || null,
          contributes_grams: h.contributesGrams ?? null,
          grams_hint: h.contributesGrams ?? null,
          sort_order: i,
        }))
      if (rows.length > 0) {
        const { error: habitsErr } = await supabase.from('standing_habits').insert(rows)
        if (habitsErr) errors.push(`habits: ${habitsErr.message}`)
      }

      if (errors.length > 0) {
        console.error('Onboarding persistence partial failure:', errors)
        setPersistError(errors.join(' · '))
      }
    })()
  }, [user, household, goals, rhythms])

  const itemCount = plan?.entries.length ?? 0
  // Habits-from-this-flow may not yet be in the live `habits` query; fall back
  // to what we just parsed so the kicker stat reflects reality.
  const habitCount = Math.max(habits.length, rhythms.parsed.filter(h => h.what.trim()).length)
  const dayCount = (() => {
    if (!plan) return 6
    const days = new Set(plan.entries.map(e => e.dayOfWeek))
    return Math.max(days.size, 6)
  })()

  return (
    <OnboardingShell>
      <div className="flex-1 px-20 py-13 flex flex-col" style={{ paddingTop: 52, paddingBottom: 52 }}>
        {/* Hero */}
        <div className="flex items-end gap-6">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary-500">
              YOUR FIRST PLAN IS READY
            </div>
            <div className="h-3" />
            <h1 className="font-display text-[64px] leading-[1.05] text-neutral-800">
              That's it. <span className="italic text-primary-500">Now what?</span>
            </h1>
            <div className="h-2.5" />
            <p className="font-display italic text-[22px] text-neutral-500 max-w-[640px] leading-[1.4]">
              Three things you can do next. Or just close this and come back Sunday — Symphony will be ready when you are.
            </p>
          </div>
          <div className="flex-1" />
          <div className="text-right">
            <div className="font-display italic text-[60px] text-primary-500 leading-none">
              {dayCount}
            </div>
            <div className="text-[11px] text-neutral-400 font-semibold tracking-[0.18em]">
              DAYS · {itemCount} ITEMS · {habitCount} HABIT{habitCount === 1 ? '' : 'S'}
            </div>
          </div>
        </div>

        <div className="h-9" />

        {/* Three cards */}
        <div className="grid gap-5 flex-1" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <NextCard
            kicker="① REVIEW"
            title="See your week"
            sub="Open the plan. Edit anything. Add a kid mod."
            cta="Open plan →"
            primary
            onClick={() => { navigate('/meals/plan') }}
          />
          <NextCard
            kicker="② SHOP"
            title="Send the grocery list"
            sub={`${itemCount || 27} items, organized by section. Lands in Apple Reminders.`}
            cta="Review & send →"
            onClick={() => { navigate('/meals/plan#groceries') }}
          />
          <NextCard
            kicker="③ COOK"
            title="Set up the wall"
            sub="Optional. The kitchen iPad shows tonight's dinner, big and confident."
            cta="Show me how →"
            faded
            onClick={() => { navigate('/wall') }}
          />
        </div>

        <div className="h-7" />

        <div className="flex items-center gap-3.5 px-[22px] py-4 bg-bg-elevated border border-neutral-200 rounded-xl">
          <span className="w-7 h-7 rounded-full bg-primary-500 text-white grid place-items-center font-display italic text-[16px] shrink-0">S</span>
          <p className="text-[14px] text-neutral-700">
            Need to come back to this? Hit the <strong className="font-medium">?</strong> in the topbar — quick tour, sample plan, or just a refresher of where things live.
          </p>
        </div>

        {persistError && (
          <div className="mt-3 px-3 py-2 rounded-lg border border-accent-100 bg-accent-50 text-accent-600 text-[12px] italic self-start">
            Couldn't save some of your setup ({persistError}). You can fix it later in Settings.
          </div>
        )}
      </div>
    </OnboardingShell>
  )
}

function NextCard({
  kicker, title, sub, cta, primary, faded, onClick,
}: {
  kicker: string
  title: string
  sub: string
  cta: string
  primary?: boolean
  faded?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        text-left rounded-[18px] p-7 flex flex-col transition-all
        ${primary
          ? 'bg-primary-500 border border-primary-500 text-white shadow-primary hover:bg-primary-600'
          : 'bg-bg-elevated border border-neutral-200 text-neutral-800 shadow-card hover:border-primary-300'}
        ${faded ? 'opacity-[0.78] hover:opacity-100' : ''}
      `}
    >
      <div className={`text-[10.5px] font-bold uppercase tracking-[0.18em] ${
        primary ? 'text-white/70' : 'text-primary-500'
      }`}>
        {kicker}
      </div>
      <div className="h-3" />
      <div className="font-display text-[32px] leading-[1.1]">{title}</div>
      <div className="h-2" />
      <div className={`text-[13.5px] leading-[1.55] ${
        primary ? 'text-white/85' : 'text-neutral-500'
      }`}>
        {sub}
      </div>
      <div className="flex-1" />
      <div className="mt-[18px]">
        <span className={`
          inline-flex items-center gap-1.5 px-4 py-2.5 rounded-[10px]
          text-[13px] font-medium
          ${primary
            ? 'bg-white text-primary-500'
            : 'border border-primary-300 text-primary-500'}
        `}>
          {cta}
        </span>
      </div>
    </button>
  )
}
