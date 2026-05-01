import type { GeneratedEntry } from '@/types/meal-planner'

const CANONICAL_SLOTS = new Set(['breakfast', 'lunch', 'snack', 'dinner', 'prep'])

export interface PromptContextInput {
  weekStart: string                              // YYYY-MM-DD (Monday)
  mealPlanId: string
  members: Array<{ name: string; family_member_id: string; auth_user_id: string | null }>
  shelf:   Array<{ recipe_id: string; title: string; tags: string[]; prep_minutes: number | null; kid_acceptance: string | null; is_prep_friendly: boolean }>
  habits:  Array<{ owner_auth_user_id: string; name: string; slot: string; grams_hint: number | null }>
  restrictions: Array<{ scope: 'household' | 'person'; person_name: string | null; label: string }>
  brief:   string
}

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

    if (typeof e.day_of_week !== 'number' || e.day_of_week < 0 || e.day_of_week > 6) {
      dropped.push({ entry: raw, reason: `day_of_week out of range: ${e.day_of_week}` })
      continue
    }

    if (typeof e.slot !== 'string' || !CANONICAL_SLOTS.has(e.slot)) {
      dropped.push({ entry: raw, reason: `slot not canonical: ${e.slot}` })
      continue
    }

    if (e.family_member_id != null && !roster.has(e.family_member_id)) {
      dropped.push({ entry: raw, reason: `family_member_id not in roster: ${e.family_member_id}` })
      continue
    }

    if (e.prepared_by_family_member_id != null && !roster.has(e.prepared_by_family_member_id)) {
      dropped.push({ entry: raw, reason: `prepared_by_family_member_id not in roster: ${e.prepared_by_family_member_id}` })
      continue
    }

    // Soft drop: recipe_id miss with an ad_hoc_title fallback becomes ad-hoc.
    let recipeId: string | null = e.recipe_id ?? null
    const hasAdHoc = e.ad_hoc_title != null && e.ad_hoc_title !== ''
    if (recipeId != null && !shelf.has(recipeId)) {
      if (hasAdHoc) {
        recipeId = null  // demote to ad-hoc
      } else {
        dropped.push({ entry: raw, reason: `recipe_id not in shelf: ${recipeId}` })
        continue
      }
    }

    const hasRecipe = recipeId != null
    if (hasRecipe === hasAdHoc) {
      dropped.push({ entry: raw, reason: 'exactly one of recipe_id or ad_hoc_title required' })
      continue
    }

    kept.push({
      day_of_week: e.day_of_week,
      slot: e.slot as GeneratedEntry['slot'],
      family_member_id: e.family_member_id ?? null,
      recipe_id: recipeId,
      ad_hoc_title: e.ad_hoc_title ?? null,
      prepared_by_family_member_id: e.prepared_by_family_member_id ?? null,
      leftover_from: typeof e.leftover_from === 'string' && e.leftover_from.length > 0 ? e.leftover_from : null,
    })
  }

  return { kept, dropped }
}

/** Renders the dynamic context block fed to Haiku alongside the static system
 *  prompt. Format is intentionally human-readable so a planner can eyeball it
 *  in logs. */
export function buildPromptContext(input: PromptContextInput): string {
  const members = input.members.length === 0
    ? '  (none)'
    : input.members.map(m =>
        `  - {name: ${JSON.stringify(m.name)}, family_member_id: ${JSON.stringify(m.family_member_id)}, auth_user_id: ${m.auth_user_id ? JSON.stringify(m.auth_user_id) : 'null'}}`
      ).join('\n')

  const shelf = input.shelf.length === 0
    ? '  (none)'
    : input.shelf.map(r =>
        `  - {recipe_id: ${JSON.stringify(r.recipe_id)}, title: ${JSON.stringify(r.title)}, tags: ${JSON.stringify(r.tags)}, prep_minutes: ${r.prep_minutes ?? 'null'}, kid_acceptance: ${r.kid_acceptance ? JSON.stringify(r.kid_acceptance) : 'null'}, is_prep_friendly: ${r.is_prep_friendly}}`
      ).join('\n')

  const habits = input.habits.length === 0
    ? '  (none)'
    : input.habits.map(h =>
        `  - {owner_auth_user_id: ${JSON.stringify(h.owner_auth_user_id)}, name: ${JSON.stringify(h.name)}, slot: ${JSON.stringify(h.slot)}, grams_hint: ${h.grams_hint ?? 'null'}}`
      ).join('\n')

  const restrictions = input.restrictions.length === 0
    ? '  (none)'
    : input.restrictions.map(r =>
        r.scope === 'household'
          ? `  - household: ${JSON.stringify(r.label)}`
          : `  - ${r.person_name}: ${JSON.stringify(r.label)}`
      ).join('\n')

  return [
    `WEEK: ${input.weekStart} (Mon-Sun)`,
    `MEAL_PLAN_ID: ${input.mealPlanId}`,
    '',
    'HOUSEHOLD MEMBERS:',
    members,
    '',
    `SHELF (household, ${input.shelf.length} recipes):`,
    shelf,
    '',
    'STANDING HABITS:',
    habits,
    '',
    'RESTRICTIONS:',
    restrictions,
    '',
    'BRIEF:',
    JSON.stringify(input.brief),
  ].join('\n')
}
