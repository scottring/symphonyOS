import type { GeneratedEntry } from '@/types/meal-planner'

const CANONICAL_SLOTS = new Set(['breakfast', 'lunch', 'snack', 'dinner'])

export interface ValidationDrop {
  entry: unknown
  reason: string
}

export interface ValidationResult {
  kept: GeneratedEntry[]
  dropped: ValidationDrop[]
}

/** Validates AI-generated entries against the supplied roster + shelf.
 *  Pure function; no side effects. Mirrored at supabase/functions/_shared/. */
export function validateGeneratedEntries(
  entries: unknown[],
  roster: Set<string>,
  shelf: Set<string>,
): ValidationResult {
  const kept: GeneratedEntry[] = []
  const dropped: ValidationDrop[] = []

  for (const raw of entries) {
    const e = raw as Partial<GeneratedEntry>

    // Validate day_of_week
    if (typeof e.day_of_week !== 'number' || e.day_of_week < 0 || e.day_of_week > 6) {
      dropped.push({ entry: raw, reason: `day_of_week out of range: ${e.day_of_week}` })
      continue
    }

    // Validate slot
    if (typeof e.slot !== 'string' || !CANONICAL_SLOTS.has(e.slot)) {
      dropped.push({ entry: raw, reason: `slot not canonical: ${e.slot}` })
      continue
    }

    // Validate family_member_id against roster
    if (e.family_member_id != null && !roster.has(e.family_member_id)) {
      dropped.push({
        entry: raw,
        reason: `family_member_id not in roster: ${e.family_member_id}`,
      })
      continue
    }

    // Validate recipe_id against shelf
    if (e.recipe_id != null && !shelf.has(e.recipe_id)) {
      dropped.push({ entry: raw, reason: `recipe_id not in shelf: ${e.recipe_id}` })
      continue
    }

    // Validate exactly one of recipe_id or ad_hoc_title is set
    const hasRecipe = e.recipe_id != null
    const hasAdHoc = e.ad_hoc_title != null && e.ad_hoc_title !== ''

    if (hasRecipe === hasAdHoc) {
      dropped.push({
        entry: raw,
        reason: 'exactly one of recipe_id or ad_hoc_title required',
      })
      continue
    }

    // Entry is valid, add to kept
    kept.push({
      day_of_week: e.day_of_week,
      slot: e.slot as GeneratedEntry['slot'],
      family_member_id: e.family_member_id ?? null,
      recipe_id: e.recipe_id ?? null,
      ad_hoc_title: e.ad_hoc_title ?? null,
    })
  }

  return { kept, dropped }
}
