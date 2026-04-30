import { useState } from 'react'
import { dayLabelFor } from '@/lib/weekHelpers'
import { KidAcceptanceLine } from '../shelf/KidAcceptanceLine'
import { MealActionMenu } from './MealActionMenu'
import type { Recipe, MealPlanEntry } from '@/types/meal-planner'

interface Props {
  dayOfWeek: number
  date: Date
  isToday: boolean
  entry: MealPlanEntry
  recipe?: Recipe
  onReplace: (entryId: string) => void
  onRemove: (entryId: string) => void
}

export function DayStanza({ dayOfWeek, date, isToday, entry, recipe, onReplace, onRemove }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const title = recipe?.title ?? entry.adHocTitle ?? '(unnamed)'

  return (
    <div className={`relative rounded-2xl px-6 py-5 mb-3 border ${
      isToday
        ? 'bg-primary-50 border-primary-100 border-l-4 border-l-primary-500'
        : 'bg-bg-elevated border-neutral-200'
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className={`text-[0.7rem] font-bold uppercase tracking-[0.22em] mb-1 ${isToday ? 'text-primary-600' : 'text-neutral-400'}`}>
            {dayLabelFor(dayOfWeek)} · {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{isToday && ' · TODAY'}
            {recipe?.prepMinutes != null && <span className="ml-3 text-neutral-300">· {recipe.prepMinutes} MIN</span>}
          </div>
          <button onClick={() => setMenuOpen(true)}
                  className="block text-left font-display text-[1.75rem] leading-snug text-neutral-800 hover:text-primary-700 transition-colors">
            {title}
          </button>
          <div className="mt-1 space-y-0.5">
            <KidAcceptanceLine sentence={recipe?.acceptanceSentence} />
          </div>
        </div>
        <div className="relative">
          <button onClick={() => setMenuOpen(true)} aria-label="Edit meal"
                  className="text-neutral-400 hover:text-neutral-700 px-2 py-1 text-[18px]">
            ⋯
          </button>
          <MealActionMenu
            isOpen={menuOpen}
            onClose={() => setMenuOpen(false)}
            onReplace={() => onReplace(entry.id)}
            onRemove={() => onRemove(entry.id)}
          />
        </div>
      </div>
    </div>
  )
}
