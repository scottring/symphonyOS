import { useMemo } from 'react'
import { useMealPlan } from '@/hooks/useMealPlan'
import { useRecipes } from '@/hooks/useRecipes'
import { sundayOfWeek, dayLabelFor } from '@/lib/weekHelpers'
import type { Recipe, MealPlanEntry } from '@/types/meal-planner'

export function MealPlanColumn() {
  const weekStart = useMemo(() => sundayOfWeek(new Date()), [])
  const { plan, loading, error } = useMealPlan(weekStart)
  const { recipes } = useRecipes()

  const recipesById = useMemo(() => {
    const m = new Map<string, Recipe>()
    recipes.forEach(r => m.set(r.id, r))
    return m
  }, [recipes])

  const today = new Date()
  const todayDow = today.getDay()
  const tomorrowDow = (todayDow + 1) % 7

  const dinnerForDay = (day: number): { entry: MealPlanEntry; recipe?: Recipe } | undefined => {
    const e = plan?.entries.find(en => en.dayOfWeek === day && en.slot === 'dinner')
    if (!e) return undefined
    return { entry: e, recipe: e.recipeId ? recipesById.get(e.recipeId) : undefined }
  }
  const prepEntry = plan?.entries.find(e => e.slot === 'prep')
  const prepRecipe = prepEntry?.recipeId ? recipesById.get(prepEntry.recipeId) : undefined

  const tonight = dinnerForDay(todayDow)
  const tomorrow = dinnerForDay(tomorrowDow)

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="text-[1.1rem] font-black uppercase tracking-[0.25em] text-white/50 mb-4">THIS WEEK</div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-white/30 font-black uppercase tracking-widest text-[0.85rem]">Loading…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <div className="text-[1.1rem] font-black uppercase tracking-[0.25em] text-white/50 mb-4">THIS WEEK</div>
        <div className="flex-1 flex items-center justify-center text-center px-4">
          <div>
            <div className="text-[2.5rem] mb-2">⚠️</div>
            <div className="text-white/60 font-black uppercase tracking-wider text-[0.7rem]">{error}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="text-[1.1rem] font-black uppercase tracking-[0.25em] text-white/50 mb-4">THIS WEEK</div>

      {/* TONIGHT */}
      <div className="mb-4">
        <div className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-white/40 mb-1.5">TONIGHT · {dayLabelFor(todayDow)}</div>
        {tonight ? (
          <div className="rounded-[1.1rem] px-4 py-3 shadow-lg bg-[#6DC4A7]" style={{ minHeight: 76 }}>
            <div className="font-black text-[1rem] uppercase tracking-wider text-white leading-tight">
              {tonight.recipe?.title ?? tonight.entry.adHocTitle ?? '(unnamed)'}
            </div>
            {tonight.recipe?.prepMinutes != null && (
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-white/70 mt-1">
                {tonight.recipe.prepMinutes} MIN
              </div>
            )}
            {tonight.recipe?.acceptanceSentence && (
              <div className="text-[0.7rem] italic text-white/80 mt-1.5 leading-snug" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                {tonight.recipe.acceptanceSentence}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-[1.1rem] px-4 py-3 border border-white/10 text-center" style={{ minHeight: 76 }}>
            <div className="text-[2rem] opacity-40 mt-1">🍽️</div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-white/40 mt-1">No dinner planned</div>
          </div>
        )}
      </div>

      {/* TOMORROW */}
      {tomorrow && (
        <div className="mb-4">
          <div className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-white/40 mb-1.5">TOMORROW · {dayLabelFor(tomorrowDow)}</div>
          <div className="rounded-[1rem] px-3.5 py-2.5 shadow-lg bg-[#7BA8E0]" style={{ minHeight: 56 }}>
            <div className="font-black text-[0.85rem] uppercase tracking-wider text-white leading-tight">
              {tomorrow.recipe?.title ?? tomorrow.entry.adHocTitle ?? '(unnamed)'}
            </div>
            {tomorrow.recipe?.prepMinutes != null && (
              <div className="text-[0.6rem] font-black uppercase tracking-widest text-white/70 mt-0.5">{tomorrow.recipe.prepMinutes} MIN</div>
            )}
          </div>
        </div>
      )}

      {/* PREP CALL-OUT */}
      {prepEntry && (
        <div className="mt-2 px-3 py-2 rounded-xl bg-[#F9C35C]/15 border border-[#F9C35C]/30">
          <div className="text-[0.6rem] font-black uppercase tracking-[0.22em] text-[#F9C35C] mb-0.5">THIS WEEK'S PREP</div>
          <div className="text-[0.8rem] font-bold text-white/90 leading-tight">
            {prepRecipe?.title ?? prepEntry.adHocTitle ?? '(unnamed)'}
          </div>
        </div>
      )}
    </div>
  )
}
