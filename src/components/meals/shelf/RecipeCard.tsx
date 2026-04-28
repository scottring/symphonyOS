import type { Recipe } from '@/types/meal-planner'
import { KidAcceptanceLine } from './KidAcceptanceLine'

interface Props {
  recipe: Recipe
  onClick: (recipe: Recipe) => void
}

function formatLastCooked(lastCookedAt?: Date): string {
  if (!lastCookedAt) return 'NEVER COOKED · NEW'
  const days = Math.floor((Date.now() - lastCookedAt.getTime()) / 86400000)
  if (days < 7) return `LAST COOKED · ${days} DAY${days === 1 ? '' : 'S'} AGO`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return `LAST COOKED · ${weeks} WEEK${weeks === 1 ? '' : 'S'} AGO`
  }
  const months = Math.floor(days / 30)
  return `LAST COOKED · ${months} MONTH${months === 1 ? '' : 'S'} AGO`
}

export function RecipeCard({ recipe, onClick }: Props) {
  const kicker = formatLastCooked(recipe.lastCookedAt)
  const isNeverCooked = !recipe.lastCookedAt

  return (
    <button
      type="button"
      onClick={() => onClick(recipe)}
      className="group text-left w-full pb-6 mb-6 border-b border-neutral-200"
    >
      <div className={`text-[0.7rem] font-bold uppercase tracking-[0.22em] mb-2 ${
        isNeverCooked ? 'text-accent-500' : 'text-neutral-400'
      }`}>
        {kicker}
        {recipe.sourceLabel && <span className="ml-2 text-neutral-300">·</span>}
        {recipe.sourceLabel && <span className="ml-2">{recipe.sourceLabel}</span>}
        {recipe.prepMinutes != null && <span className="ml-2 text-neutral-300">·</span>}
        {recipe.prepMinutes != null && <span className="ml-2">{recipe.prepMinutes} MIN</span>}
      </div>

      <h3 className="font-display text-[2rem] leading-[1.05] text-neutral-800 group-hover:text-primary-700 transition-colors">
        {recipe.title}
      </h3>

      <div className="mt-2 space-y-1">
        <KidAcceptanceLine sentence={recipe.acceptanceSentence} />
        {recipe.streakNote && (
          <p className="font-display italic text-[15px] text-neutral-500 leading-snug">
            {recipe.streakNote}
          </p>
        )}
      </div>
    </button>
  )
}
