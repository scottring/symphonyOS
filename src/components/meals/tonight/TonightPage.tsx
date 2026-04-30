import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMealPlan } from '@/hooks/useMealPlan'
import { useRecipes } from '@/hooks/useRecipes'
import { useMealDayLog } from '@/hooks/useMealDayLog'
import { mondayOfWeek, dateForDayOfWeek } from '@/lib/weekHelpers'
import type { MealPlanEntry, Recipe } from '@/types/meal-planner'
import { TonightHero } from './TonightHero'
import { UpcomingDayRow } from './UpcomingDayRow'
import { MobileTabBar } from './MobileTabBar'

const DAY_LABEL_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Surface 10 · Mobile read-only "Tonight" view (Scott's view). */
export function TonightPage() {
  const navigate = useNavigate()
  const today = useMemo(() => new Date(), [])
  const weekStart = useMemo(() => mondayOfWeek(today), [today])
  const todayDow = (today.getDay() + 6) % 7  // Mon=0 … Sun=6

  const { plan, loading, error } = useMealPlan(weekStart)
  const { recipes } = useRecipes()
  const { log: todayLog } = useMealDayLog(today)

  const recipesById = useMemo(() => {
    const m = new Map<string, Recipe>()
    recipes.forEach(r => m.set(r.id, r))
    return m
  }, [recipes])

  const tonightEntry: MealPlanEntry | undefined = useMemo(() => {
    if (!plan) return undefined
    return plan.entries.find(e => e.dayOfWeek === todayDow && e.slot === 'dinner')
  }, [plan, todayDow])

  const tonightRecipe = tonightEntry?.recipeId
    ? recipesById.get(tonightEntry.recipeId)
    : undefined

  const upcoming = useMemo(() => {
    if (!plan) return []
    return plan.entries
      .filter(e => e.dayOfWeek > todayDow && e.slot === 'dinner')
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
  }, [plan, todayDow])

  // Header bar dates
  const headerSubtitle = today.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  // Resolve "going out" / "morning only" style labels from entry notes when present.
  // TODO: Enrich with per-day useMealDayLog notes once a multi-day log fetcher exists;
  // today the hook is per-date so we can't call it inside a map.
  function rowFor(entry: MealPlanEntry): { title: string; muted: boolean } {
    const noteText = entry.notes?.trim()
    if (noteText && /going out|morning only|takeout|eating out/i.test(noteText)) {
      return { title: noteText, muted: true }
    }
    if (entry.recipeId) {
      const r = recipesById.get(entry.recipeId)
      if (r) return { title: r.title, muted: false }
    }
    if (entry.adHocTitle) return { title: entry.adHocTitle, muted: false }
    if (noteText) return { title: noteText, muted: true }
    return { title: 'Untitled', muted: true }
  }

  const heroTitle =
    tonightRecipe?.title ??
    tonightEntry?.adHocTitle ??
    (tonightEntry?.notes ?? 'Nothing planned')

  // Cook time isn't on the recipe schema; surface prep_minutes as "Prep" only.
  // We omit Cook / Feeds when unknown — design accommodates a partial stat row.
  const prepMinutes = tonightRecipe?.prepMinutes
  const kidsLine =
    tonightRecipe?.acceptanceSentence ??
    // Fall back to today's day-log notes if it reads like a kid line.
    todayLog?.notes ??
    undefined

  if (loading) {
    return (
      <div className="px-5 py-5">
        <div className="text-[12px] uppercase tracking-widest text-neutral-400">Loading…</div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="px-5 py-5">
        <div className="text-accent-500 text-[14px]">{error}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-base pb-20">
      {/* Top app bar */}
      <header className="px-5 pt-5 pb-3 flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-full bg-sage-100 text-sage-500 flex items-center justify-center text-[13px] font-bold shrink-0"
          aria-hidden="true"
        >
          S
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-[1.4rem] leading-tight text-neutral-800">
            Tonight
          </h1>
          <p className="font-display italic text-[12px] text-neutral-500">
            {headerSubtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/meals/today')}
          className="text-[12px] text-primary-700 hover:text-primary-800"
        >
          day
        </button>
      </header>

      {/* Hero */}
      <div className="px-5">
        <TonightHero
          title={heroTitle}
          imageUrl={tonightRecipe?.imageUrl}
          prepMinutes={prepMinutes}
          // cookMinutes / feeds aren't on the recipe schema — left undefined.
          kidsLine={kidsLine}
          onViewSteps={() => {
            // No-op for now; navigate to today's tracking view as closest match.
            navigate('/meals/today')
          }}
          onMarkDone={() => {
            // No-op for now; tracking happens on /meals/today.
            navigate('/meals/today')
          }}
        />
      </div>

      {/* This Week */}
      <section className="px-5 mt-8">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-500 mb-2">
          This Week
        </h2>
        {upcoming.length === 0 ? (
          <p className="font-display italic text-[14px] text-neutral-400 py-3">
            Nothing else on the plan.
          </p>
        ) : (
          <ul className="card px-4 py-1">
            {upcoming.map(entry => {
              const { title, muted } = rowFor(entry)
              const date = dateForDayOfWeek(weekStart, entry.dayOfWeek)
              const dayLabel = DAY_LABEL_SHORT[entry.dayOfWeek] ?? date
                .toLocaleDateString('en-US', { weekday: 'short' })
              return (
                <UpcomingDayRow
                  key={entry.id}
                  dayLabel={dayLabel}
                  title={title}
                  muted={muted}
                />
              )
            })}
          </ul>
        )}
      </section>

      {/* Bottom tabs */}
      <MobileTabBar active="plan" />
    </div>
  )
}
