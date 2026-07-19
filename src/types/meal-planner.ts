// Types for the meal planner feature.
// Schema source: supabase/migrations/075_meal_planner.sql
// Architecture spec: docs/superpowers/specs/2026-04-28-meal-planner.md

export type AcceptanceLevel = 'loves' | 'eats' | 'rejects'

export interface KidAcceptanceEntry {
  level: AcceptanceLevel
  note?: string
}

/** Keyed by family_member_id (uuid string). */
export type KidAcceptanceMap = Record<string, KidAcceptanceEntry>

export type MealSlot = 'breakfast' | 'lunch' | 'dinner'

/** The three canonical day-meal slots, in display order. */
export const DAY_MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner']

export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
}

// ─────────────────────────────────────────────────────────────────
// recipes
// ─────────────────────────────────────────────────────────────────

export interface DbRecipe {
  id: string
  user_id: string
  title: string
  source_url: string | null
  source_label: string | null
  image_url: string | null
  prep_minutes: number | null
  ingredients: string[]
  instructions: string[]
  tags: string[]
  kid_acceptance: KidAcceptanceMap
  acceptance_sentence: string | null
  is_prep_friendly: boolean
  times_cooked: number
  last_cooked_at: string | null
  streak_note: string | null
  created_at: string
  updated_at: string
}

export interface Recipe {
  id: string
  userId: string
  title: string
  sourceUrl?: string
  sourceLabel?: string
  imageUrl?: string
  prepMinutes?: number
  ingredients: string[]
  instructions: string[]
  tags: string[]
  kidAcceptance: KidAcceptanceMap
  acceptanceSentence?: string
  isPrepFriendly: boolean
  timesCooked: number
  lastCookedAt?: Date
  streakNote?: string
  createdAt: Date
  updatedAt: Date
}

// ─────────────────────────────────────────────────────────────────
// meal_plans + meal_plan_entries
// ─────────────────────────────────────────────────────────────────

export interface DbMealPlan {
  id: string
  user_id: string
  week_start: string  // YYYY-MM-DD
  starts_on: string | null  // YYYY-MM-DD within the week; null = week start
  ends_on: string | null    // YYYY-MM-DD within the week; null = week end
  created_at: string
  updated_at: string
}

export interface DbMealPlanEntry {
  id: string
  meal_plan_id: string
  day_of_week: number  // 0=Sunday .. 6=Saturday (JS Date.getDay()); week_start is that week's Sunday
  slot: MealSlot
  recipe_id: string | null
  ad_hoc_title: string | null
  notes: string | null
  leftover_from: string | null
  /** NULL = shared/whole-family meal; set = this member's personal variant. */
  for_member_id: string | null
  created_at: string
}

export interface MealPlan {
  id: string
  userId: string
  weekStart: Date
  /** ISO YYYY-MM-DD bounds of the active (planned) range; null = week edge. */
  startsOn: string | null
  endsOn: string | null
  entries: MealPlanEntry[]
  createdAt: Date
  updatedAt: Date
}

export interface MealPlanEntry {
  id: string
  mealPlanId: string
  dayOfWeek: number
  slot: MealSlot
  recipeId?: string
  /** Populated by hooks (e.g. useMealPlan) via a join on recipes; the
   *  row mapper does NOT set this field. */
  recipe?: Recipe
  adHocTitle?: string
  notes?: string
  leftoverFrom?: string
  /** undefined = shared/whole-family meal; set = this member's personal variant. */
  forMemberId?: string
}

// ─────────────────────────────────────────────────────────────────
// Mappers (kept here for now; may move to a separate file once hooks exist)
// ─────────────────────────────────────────────────────────────────

export function dbRecipeToRecipe(row: DbRecipe): Recipe {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    sourceUrl: row.source_url ?? undefined,
    sourceLabel: row.source_label ?? undefined,
    imageUrl: row.image_url ?? undefined,
    prepMinutes: row.prep_minutes ?? undefined,
    ingredients: row.ingredients,
    instructions: row.instructions,
    tags: row.tags,
    kidAcceptance: row.kid_acceptance,
    acceptanceSentence: row.acceptance_sentence ?? undefined,
    isPrepFriendly: row.is_prep_friendly,
    timesCooked: row.times_cooked,
    lastCookedAt: row.last_cooked_at ? new Date(row.last_cooked_at) : undefined,
    streakNote: row.streak_note ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export function dbMealPlanEntryToMealPlanEntry(row: DbMealPlanEntry): MealPlanEntry {
  return {
    id: row.id,
    mealPlanId: row.meal_plan_id,
    dayOfWeek: row.day_of_week,
    slot: row.slot,
    recipeId: row.recipe_id ?? undefined,
    adHocTitle: row.ad_hoc_title ?? undefined,
    notes: row.notes ?? undefined,
    leftoverFrom: row.leftover_from ?? undefined,
    forMemberId: row.for_member_id ?? undefined,
  }
}

export function dbMealPlanToMealPlan(
  row: DbMealPlan,
  entries: DbMealPlanEntry[],
): MealPlan {
  return {
    id: row.id,
    userId: row.user_id,
    weekStart: new Date(row.week_start),
    startsOn: row.starts_on ?? null,
    endsOn: row.ends_on ?? null,
    entries: entries.map(dbMealPlanEntryToMealPlanEntry),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}
