import { useNavigate } from 'react-router-dom'
import { dayLabelFor } from '@/lib/weekHelpers'
import { GramRing } from '../today/GramRing'
import { sumActualGrams, gramsTargetFor } from '../today/grams'
import { SlotSection } from './SlotSection'
import { DAY_MEAL_SLOTS, DAY_MEAL_SLOTS_WITH_PREP } from '@/types/meal-planner'
import type { MealPlanEntry, MealParameter, MealSlot, Recipe } from '@/types/meal-planner'
import type { FamilyMember } from '@/types/family'

interface Props {
  dayOfWeek: number
  date: Date
  isToday: boolean
  entriesBySlot: Map<MealSlot, MealPlanEntry[]>
  recipesById: Map<string, Recipe>
  familyMembers: FamilyMember[]
  parameter?: MealParameter
  /** entry.id → "from X" label, populated for leftover entries. */
  parentLabelById?: Map<string, string>
  /** Map of `${owner_family_member_id}|${slot}` → set of habit names, used
   *  to mark plan entries derived from a standing habit. */
  habitsByOwnerSlot?: Map<string, Set<string>>
  onPickForSlot: (slot: MealSlot, familyMemberId?: string) => void
  onReplace: (entryId: string) => void
  onRemove: (entryId: string) => void
  onConsolidateSlot: (
    dayOfWeek: number,
    slot: MealSlot,
    entries: MealPlanEntry[],
    shared: { recipeId?: string; adHocTitle?: string },
  ) => void
  onSplitSharedSlot: (slot: MealSlot, entry: MealPlanEntry) => void
}

/** Compact in-document day card — surface 4 (compact). Header row with ring
 *  + grams + day label, then a stacked breakfast/lunch/snack/dinner section. */
export function DayCard({
  dayOfWeek, date, isToday,
  entriesBySlot, recipesById, familyMembers, parameter,
  parentLabelById, habitsByOwnerSlot,
  onPickForSlot, onReplace, onRemove, onConsolidateSlot, onSplitSharedSlot,
}: Props) {
  const navigate = useNavigate()
  const target = gramsTargetFor(parameter)
  const allEntries = Array.from(entriesBySlot.values()).flat()
  const actual = sumActualGrams(allEntries, recipesById)
  const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const dateIso = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`

  // Sun = 6 in our Mon=0..Sun=6 convention. Show PREP slot on Sundays, or any day
  // that already has prep entries.
  const isSunday = dayOfWeek === 6
  const hasPrepEntries = (entriesBySlot.get('prep') ?? []).length > 0
  const slotsToRender = (isSunday || hasPrepEntries) ? DAY_MEAL_SLOTS_WITH_PREP : DAY_MEAL_SLOTS

  return (
    <div className={`rounded-2xl px-6 py-5 mb-3 border ${
      isToday
        ? 'bg-primary-50/60 border-primary-100 border-l-4 border-l-primary-500'
        : 'bg-bg-elevated border-neutral-200'
    }`}>
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-4 mb-3 pb-3 border-b border-neutral-100">
        <div>
          <div className={`text-[10px] font-bold uppercase tracking-[0.22em] mb-0.5 ${
            isToday ? 'text-primary-600' : 'text-neutral-400'
          }`}>
            {dayLabelFor(dayOfWeek)} · {dateLabel.toUpperCase()}{isToday && ' · TODAY'}
          </div>
          <div className="font-display text-[1.5rem] text-neutral-800 leading-tight">
            {date.toLocaleDateString('en-US', { weekday: 'long' })}
          </div>
        </div>
        {target !== null && (
          <div className="flex items-center gap-3">
            <GramRing actual={actual} target={target} size={56} stroke={5} showValue={false} />
            <div className="text-right">
              <div className="font-display italic text-[1.05rem] text-primary-700 leading-tight">
                ~{actual}g
              </div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-400">
                / {target}g
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stacked meal rows — each slot may render a single shared row,
          per-person sub-rows, or both. */}
      <div>
        {slotsToRender.map(slot => (
          <SlotSection
            key={slot}
            slot={slot}
            entries={entriesBySlot.get(slot) ?? []}
            recipesById={recipesById}
            familyMembers={familyMembers}
            parentLabelById={parentLabelById}
            habitsByOwnerSlot={habitsByOwnerSlot}
            onPick={(forWho) => onPickForSlot(slot, forWho)}
            onReplace={onReplace}
            onRemove={onRemove}
            onConsolidate={(entries, shared) => onConsolidateSlot(dayOfWeek, slot, entries, shared)}
            onSplitShared={(entry) => onSplitSharedSlot(slot, entry)}
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
