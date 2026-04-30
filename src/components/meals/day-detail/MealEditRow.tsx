import type { MealPlanEntry, MealSlot, Recipe } from '@/types/meal-planner'
import { MEAL_SLOT_LABEL } from '@/types/meal-planner'
import { extractGrams, sumGramsInTags } from '../today/grams'
import { EditCell } from './EditCell'

export interface PersonAssignment {
  /** The entry shown in this column (if any). */
  entry?: MealPlanEntry
  /** Resolved recipe for the entry, if recipe-backed. */
  recipe?: Recipe
}

interface Props {
  slot: MealSlot
  iris: PersonAssignment
  scott: PersonAssignment
  kids: PersonAssignment
  /** Optional kid sub-tag rendered as a soft sage box under the dinner row. */
  kidsSubTag?: string
  /** Save text edits per cell. */
  onCommitText?: (entryId: string | undefined, person: 'iris' | 'scott' | 'kids', next: string) => void | Promise<void>
}

/** Build gram-hint chips for a given person assignment.
 *  For recipe-backed entries we surface tag-level grams; for ad-hoc entries
 *  we attempt to pull the trailing "<n>g" off the title. */
function hintsForAssignment(a: PersonAssignment): { label: string; grams: number }[] {
  if (a.recipe) {
    const tagged = a.recipe.tags
      .map(t => ({ label: stripGrams(t), grams: extractGrams(t) }))
      .filter(h => h.grams > 0)
    if (tagged.length > 0) return tagged
    // No tag-level hints — fall back to a single recipe-level total.
    const total = sumGramsInTags(a.recipe.tags)
    if (total > 0) return [{ label: a.recipe.title.toLowerCase(), grams: total }]
    return []
  }
  if (a.entry?.adHocTitle) {
    const g = extractGrams(a.entry.adHocTitle)
    if (g > 0) return [{ label: stripGrams(a.entry.adHocTitle).toLowerCase(), grams: g }]
  }
  return []
}

/** "Apple 90g" → "Apple". "~80g raw veg" → "raw veg". */
function stripGrams(text: string): string {
  return text.replace(/~?\s*\d{1,4}\s*g\b/i, '').trim() || text
}

function bodyForAssignment(a: PersonAssignment): string {
  if (a.recipe) return a.recipe.title
  if (a.entry?.adHocTitle) return a.entry.adHocTitle
  return ''
}

/** One full meal row: kicker label on the left, three editable cells (iris,
 *  scott, kids) on the right, with an optional kid sub-tag below. */
export function MealEditRow({
  slot, iris, scott, kids, kidsSubTag, onCommitText,
}: Props) {
  const slotLabel = MEAL_SLOT_LABEL[slot]

  return (
    <div className="grid grid-cols-[88px_1fr] gap-4 py-5 border-b border-neutral-100 last:border-b-0">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400 pt-1">
        {slotLabel}
      </div>
      <div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
          <EditCell
            person="iris"
            value={bodyForAssignment(iris)}
            placeholder="—"
            hints={hintsForAssignment(iris)}
            onCommit={(next) => onCommitText?.(iris.entry?.id, 'iris', next)}
          />
          <EditCell
            person="scott"
            value={bodyForAssignment(scott)}
            placeholder="Skipping"
            hints={hintsForAssignment(scott)}
            onCommit={(next) => onCommitText?.(scott.entry?.id, 'scott', next)}
          />
          <EditCell
            person="kids"
            value={bodyForAssignment(kids)}
            placeholder="—"
            kidVoice
            hints={hintsForAssignment(kids)}
            onCommit={(next) => onCommitText?.(kids.entry?.id, 'kids', next)}
          />
        </div>

        {kidsSubTag && (
          <div className="mt-4 rounded-2xl bg-sage-100 border border-sage-100 px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-sage-600 mb-1">
              KIDS
            </div>
            <div className="font-display italic text-[0.95rem] text-neutral-700 leading-snug">
              {kidsSubTag}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
