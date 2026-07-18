import { useNavigate } from 'react-router-dom'
import { dayLabelFor } from '@/lib/weekHelpers'
import { SlotSection } from './SlotSection'
import { DAY_MEAL_SLOTS } from '@/types/meal-planner'
import type { MealPlanEntry, MealSlot, Recipe } from '@/types/meal-planner'

interface Props {
  dayOfWeek: number
  date: Date
  isToday: boolean
  entriesBySlot: Map<MealSlot, MealPlanEntry[]>
  recipesById: Map<string, Recipe>
  /** entry.id → "from X" label, populated for leftover entries. */
  parentLabelById?: Map<string, string>
  /** When true, apply a highlight ring to this day card. */
  highlighted?: boolean
  onPickForSlot: (slot: MealSlot) => void
  onReplace: (entryId: string) => void
  onRemove: (entryId: string) => void
  onConsolidateSlot: (
    dayOfWeek: number,
    slot: MealSlot,
    entries: MealPlanEntry[],
    shared: { recipeId?: string; adHocTitle?: string },
  ) => void
}

/** Compact in-document day card — surface 4 (compact). Header row with day
 *  label, then a stacked breakfast/lunch/dinner section. */
export function DayCard({
  dayOfWeek, date, isToday,
  entriesBySlot, recipesById,
  parentLabelById, highlighted,
  onPickForSlot, onReplace, onRemove, onConsolidateSlot,
}: Props) {
  const navigate = useNavigate()
  const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const dateIso = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`

  const highlightClass = highlighted
    ? 'ring-2 ring-primary-400 ring-offset-2 transition-shadow duration-300'
    : 'transition-shadow duration-300'

  return (
    <div
      data-day-card={dayOfWeek}
      className={`rounded-2xl px-6 py-5 mb-3 border ${highlightClass} ${
        isToday
          ? 'bg-primary-50/60 border-primary-100 border-l-4 border-l-primary-500'
          : 'bg-bg-elevated border-neutral-200'
      }`}
    >
      {/* Header */}
      <div className="mb-3 pb-3 border-b border-neutral-100">
        <div className={`text-[10px] font-bold uppercase tracking-[0.22em] mb-0.5 ${
          isToday ? 'text-primary-600' : 'text-neutral-400'
        }`}>
          {dayLabelFor(dayOfWeek)} · {dateLabel.toUpperCase()}{isToday && ' · TODAY'}
        </div>
        <div className="font-display text-[1.5rem] text-neutral-800 leading-tight">
          {date.toLocaleDateString('en-US', { weekday: 'long' })}
        </div>
      </div>

      {/* Stacked meal rows — breakfast/lunch/dinner. */}
      <div>
        {DAY_MEAL_SLOTS.map(slot => (
          <SlotSection
            key={slot}
            slot={slot}
            entries={entriesBySlot.get(slot) ?? []}
            recipesById={recipesById}
            parentLabelById={parentLabelById}
            onPick={() => onPickForSlot(slot)}
            onReplace={onReplace}
            onRemove={onRemove}
            onConsolidate={(entries, shared) => onConsolidateSlot(dayOfWeek, slot, entries, shared)}
          />
        ))}
      </div>

      {/* Footer link to expanded edit detail (surface 4 expanded) */}
      <div className="mt-3 text-right">
        <button onClick={() => navigate(`/meals/day/${dateIso}`)}
                className="text-[12px] text-primary-500 italic hover:text-primary-600">
          View day →
        </button>
      </div>
    </div>
  )
}
