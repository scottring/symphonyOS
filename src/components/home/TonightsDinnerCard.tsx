import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMealPlan } from '@/hooks/useMealPlan'
import { useRecipes } from '@/hooks/useRecipes'
import { mondayOfWeek } from '@/lib/weekHelpers'
import type { Recipe } from '@/types/meal-planner'

interface Props {
  viewedDate: Date
}

/** Compact card on the home Today view showing what's planned for dinner.
 *  Hidden entirely when nothing's planned (so users who don't use the meal
 *  planner don't see noise). Tap → /meals/plan. */
export function TonightsDinnerCard({ viewedDate }: Props) {
  const navigate = useNavigate()
  const weekStart = useMemo(() => mondayOfWeek(viewedDate), [viewedDate])
  const { plan } = useMealPlan(weekStart)
  const { recipes } = useRecipes()

  const dayOfWeek = (viewedDate.getDay() + 6) % 7
  const recipesById = useMemo(() => {
    const m = new Map<string, Recipe>()
    recipes.forEach(r => m.set(r.id, r))
    return m
  }, [recipes])

  const dinnerEntries = plan?.entries.filter(e => e.dayOfWeek === dayOfWeek && e.slot === 'dinner') ?? []
  if (dinnerEntries.length === 0) return null

  // Collapse repeated entries — Iris/Scott/Family all eating the same recipe
  // should render as one row, not three.
  const titleByKey = new Map<string, string>()
  for (const e of dinnerEntries) {
    if (e.recipeId) {
      const r = recipesById.get(e.recipeId)
      if (r) titleByKey.set(`r:${e.recipeId}`, r.title)
    } else if (e.adHocTitle) {
      titleByKey.set(`a:${e.adHocTitle}`, e.adHocTitle)
    }
  }
  const distinctTitles = Array.from(titleByKey.values())
  if (distinctTitles.length === 0) return null

  const today = new Date()
  const isToday = viewedDate.getFullYear() === today.getFullYear()
    && viewedDate.getMonth() === today.getMonth()
    && viewedDate.getDate() === today.getDate()
  const kicker = isToday ? 'TONIGHT · DINNER' : `${viewedDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()} · DINNER`

  return (
    <button
      onClick={() => navigate('/meals/plan')}
      className="w-full text-left rounded-2xl border border-neutral-200 bg-bg-elevated px-5 py-3 mb-3 shadow-card hover:border-primary-200 transition-colors"
    >
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary-500">
          {kicker}
        </span>
      </div>
      <div className="mt-1 font-display text-[1.15rem] text-neutral-800">
        {distinctTitles.join(' · ')}
      </div>
    </button>
  )
}
