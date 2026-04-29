import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useRecipe } from '@/hooks/useRecipe'
import { useCookingProgress } from '@/hooks/useCookingProgress'
import { MealsTabs } from '@/components/meals/MealsTabs'
import { StepRow } from './StepRow'
import { IngredientList } from './IngredientList'
import { MarkDoneButton } from './MarkDoneButton'

/** Default "Good with" suggestions when the recipe has no field for them. */
const DEFAULT_PAIRINGS = ['Quinoa', 'Roasted veggies', 'Green salad']

/**
 * Surface 6 — Recipe Scaffold View / Kitchen Mode.
 * Mounted at /meals/cook/:recipeId. Step-by-step cooking page with
 * checkable steps, ingredient sidebar, and Mark-as-done CTA that bumps
 * times_cooked and returns to the plan.
 */
export function CookPage() {
  const { recipeId } = useParams<{ recipeId?: string }>()
  const navigate = useNavigate()
  const { recipe, loading, error } = useRecipe(recipeId ?? null)
  const { isChecked, toggle } = useCookingProgress(recipeId)
  const [marking, setMarking] = useState(false)

  const handleBack = useCallback(() => navigate('/meals/plan'), [navigate])

  const handleMarkDone = useCallback(async () => {
    if (!recipe) return
    setMarking(true)
    try {
      await supabase
        .from('recipes')
        .update({
          times_cooked: recipe.timesCooked + 1,
          last_cooked_at: new Date().toISOString(),
        })
        .eq('id', recipe.id)
      navigate('/meals/plan')
    } finally {
      setMarking(false)
    }
  }, [recipe, navigate])

  // ── Loading / error / not-found ────────────────────────────────
  if (loading) {
    return (
      <div className="px-6 py-6 max-w-7xl mx-auto">
        <MealsTabs />
        <div className="text-sm italic text-neutral-400">Loading recipe…</div>
      </div>
    )
  }

  if (error || !recipe) {
    return (
      <div className="px-6 py-6 max-w-7xl mx-auto">
        <MealsTabs />
        <button
          type="button"
          onClick={handleBack}
          className="text-sm text-neutral-500 hover:text-neutral-700"
        >
          ← Back to day
        </button>
        <p className="mt-8 text-sm italic text-neutral-500">
          {error ?? 'Recipe not found.'}
        </p>
      </div>
    )
  }

  // ── Derived display values ─────────────────────────────────────
  const hasSteps = recipe.instructions.length > 1
  const encouragement = recipe.timesCooked === 0
    ? 'First time — you’ve got this!'
    : recipe.timesCooked === 1
      ? 'Second time — you know the moves now.'
      : `${ordinal(recipe.timesCooked + 1)} time — old friend.`

  return (
    <div className="px-6 py-6 max-w-7xl mx-auto">
      <MealsTabs />

      {/* Back link */}
      <button
        type="button"
        onClick={handleBack}
        className="mb-6 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
      >
        ← Back to day
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left half — photo */}
        <div className="lg:col-span-5">
          {recipe.imageUrl ? (
            <img
              src={recipe.imageUrl}
              alt={recipe.title}
              className="w-full aspect-[4/5] object-cover rounded-3xl shadow-card"
            />
          ) : (
            <div className="w-full aspect-[4/5] rounded-3xl bg-sage-100 flex items-center justify-center shadow-card">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-sage-500">
                No photo yet
              </span>
            </div>
          )}
        </div>

        {/* Middle — title + steps */}
        <div className="lg:col-span-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400 mb-2">
            Serves 4
          </p>
          <h1 className="font-display text-[2.5rem] leading-[1.05] text-neutral-800">
            {recipe.title}
          </h1>
          <p className="mt-3 font-display italic text-[18px] text-sage-500 leading-snug">
            {encouragement}
          </p>

          <div className="mt-8">
            {hasSteps ? (
              <ol className="divide-y divide-neutral-100">
                {recipe.instructions.map((step, i) => (
                  <li key={i}>
                    <StepRow
                      index={i}
                      text={step}
                      checked={isChecked(i)}
                      onToggle={() => toggle(i)}
                    />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="font-display italic text-[16px] text-neutral-500">
                No step-by-step yet
              </p>
            )}
          </div>
        </div>

        {/* Right sidebar — ingredients + pairings */}
        <aside className="lg:col-span-3 space-y-8">
          <IngredientList
            title="You'll need"
            items={recipe.ingredients}
            emptyMessage="No ingredients listed."
          />
          <IngredientList
            title="Good with"
            items={DEFAULT_PAIRINGS}
          />
        </aside>
      </div>

      {/* Bottom-right CTA */}
      <div className="mt-12 flex justify-end">
        <MarkDoneButton onClick={handleMarkDone} loading={marking} />
      </div>
    </div>
  )
}

function ordinal(n: number): string {
  const suffix = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0])
}
