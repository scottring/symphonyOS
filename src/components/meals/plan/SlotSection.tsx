import { MealRow } from './MealRow'
import { MEAL_SLOT_LABEL } from '@/types/meal-planner'
import type { MealPlanEntry, MealSlot, Recipe } from '@/types/meal-planner'
import type { FamilyMember } from '@/types/family'

interface Props {
  slot: MealSlot
  entries: MealPlanEntry[]
  recipesById: Map<string, Recipe>
  familyMembers: FamilyMember[]
  onPick: (familyMemberId?: string) => void
  onReplace: (entryId: string) => void
  onRemove: (entryId: string) => void
}

/** One slot inside a day card. May render:
 *   - empty state ("tap for ideas")
 *   - a single shared family row
 *   - per-person sub-rows (Iris / Scott / Kids variants)
 *  The picker is invoked with an optional family_member_id to record per-
 *  person context. */
export function SlotSection({
  slot, entries, recipesById, familyMembers,
  onPick, onReplace, onRemove,
}: Props) {
  const familyEntries = entries.filter(e => !e.familyMemberId)
  const personalEntries = entries.filter(e => !!e.familyMemberId)
  const hasSplit = personalEntries.length > 0

  // Empty slot — render the lone tap-to-add row at the family-default level.
  if (entries.length === 0) {
    return (
      <div className="border-b border-neutral-100 last:border-b-0">
        <MealRow
          slot={slot}
          entry={undefined}
          recipe={undefined}
          onPick={() => onPick(undefined)}
          onReplace={onReplace}
          onRemove={onRemove}
        />
      </div>
    )
  }

  // Shared family row — single entry, no per-person split.
  if (!hasSplit && familyEntries.length === 1) {
    const e = familyEntries[0]
    return (
      <div className="border-b border-neutral-100 last:border-b-0">
        <MealRow
          slot={slot}
          entry={e}
          recipe={e.recipeId ? recipesById.get(e.recipeId) : undefined}
          onPick={() => onPick(undefined)}
          onReplace={onReplace}
          onRemove={onRemove}
        />
      </div>
    )
  }

  // Mixed / split mode — render slot kicker once, then a row per variant.
  return (
    <div className="border-b border-neutral-100 last:border-b-0 py-1">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400 pt-2 pb-1">
        {MEAL_SLOT_LABEL[slot]}
      </div>

      {/* family-default rows first */}
      {familyEntries.map(e => (
        <PerPersonRow
          key={e.id}
          forLabel="FAMILY"
          forColor="text-neutral-400"
          entry={e}
          recipe={e.recipeId ? recipesById.get(e.recipeId) : undefined}
          onReplace={onReplace}
          onRemove={onRemove}
        />
      ))}

      {/* per-person rows */}
      {personalEntries.map(e => {
        const member = familyMembers.find(m => m.id === e.familyMemberId)
        return (
          <PerPersonRow
            key={e.id}
            forLabel={(member?.name ?? '?').toUpperCase()}
            forColor={memberColorClass(member)}
            entry={e}
            recipe={e.recipeId ? recipesById.get(e.recipeId) : undefined}
            onReplace={onReplace}
            onRemove={onRemove}
          />
        )
      })}

      {/* + add for <person> affordance */}
      <div className="flex flex-wrap gap-2 mt-1.5 mb-1">
        {familyMembers
          .filter(m => !personalEntries.some(e => e.familyMemberId === m.id))
          .filter(m => m.is_full_user || m.member_type === 'core')
          .map(m => (
            <button key={m.id} onClick={() => onPick(m.id)}
                    className="text-[11px] italic text-neutral-400 hover:text-primary-500 transition-colors">
              + add for {m.name}
            </button>
          ))}
        {familyEntries.length === 0 && (
          <button onClick={() => onPick(undefined)}
                  className="text-[11px] italic text-neutral-400 hover:text-primary-500 transition-colors">
            + add shared
          </button>
        )}
      </div>
    </div>
  )
}

interface PerPersonRowProps {
  forLabel: string
  forColor: string
  entry: MealPlanEntry
  recipe?: Recipe
  onReplace: (entryId: string) => void
  onRemove: (entryId: string) => void
}

function PerPersonRow({ forLabel, forColor, entry, recipe, onReplace, onRemove }: PerPersonRowProps) {
  const title = recipe?.title ?? entry.adHocTitle ?? '(unnamed)'
  return (
    <div className="grid grid-cols-[80px_1fr_auto] items-start gap-3 py-1">
      <div className={`text-[10px] font-bold uppercase tracking-[0.16em] pt-1 ${forColor}`}>
        {forLabel}
      </div>
      <div className="font-display text-[1rem] leading-tight text-neutral-800">
        {title}
      </div>
      <div className="flex items-center gap-1 pt-0.5">
        <button onClick={() => onReplace(entry.id)}
                aria-label="Replace"
                className="px-1 text-neutral-300 hover:text-primary-500 text-[14px]">↻</button>
        <button onClick={() => onRemove(entry.id)}
                aria-label="Remove"
                className="px-1 text-neutral-300 hover:text-accent-500 text-[14px]">×</button>
      </div>
    </div>
  )
}

function memberColorClass(member?: FamilyMember): string {
  if (!member) return 'text-neutral-400'
  switch (member.color) {
    case 'blue':   return 'text-blue-600'
    case 'purple': return 'text-purple-600'
    case 'green':  return 'text-green-600'
    case 'orange': return 'text-orange-600'
    case 'pink':   return 'text-pink-600'
    case 'teal':   return 'text-teal-600'
    default:       return 'text-primary-600'
  }
}
