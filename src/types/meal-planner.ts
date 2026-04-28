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

// `(string & {})` preserves literal-autocomplete while still allowing arbitrary
// freeform strings (e.g., "high-protein week", "Whole 30"). Without that, the
// `| string` would widen the union and IDEs would stop suggesting the literals.
export type MealParameter = 'regular' | '800g' | 'low-carb' | 'custom' | (string & {})

export type MealSlot =
  | 'dinner'
  | 'prep'
  | 'lunch_iris'
  | 'lunch_scott'
  | 'kid_alternate'

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
  parameter: string | null
  created_at: string
  updated_at: string
}

export interface DbMealPlanEntry {
  id: string
  meal_plan_id: string
  day_of_week: number  // 0=Mon, 6=Sun
  slot: MealSlot
  recipe_id: string | null
  ad_hoc_title: string | null
  notes: string | null
  leftover_from: string | null
  created_at: string
}

export interface MealPlan {
  id: string
  userId: string
  weekStart: Date
  parameter?: MealParameter
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
}

// ─────────────────────────────────────────────────────────────────
// cooking_history
// ─────────────────────────────────────────────────────────────────

export type CookingOutcome = AcceptanceLevel | 'skipped'

export interface DbCookingHistory {
  id: string
  user_id: string
  recipe_id: string
  entry_id: string | null
  cooked_at: string
  outcome: Record<string, CookingOutcome>
  notes: string | null
}

export interface CookingHistoryEntry {
  id: string
  userId: string
  recipeId: string
  entryId?: string
  cookedAt: Date
  outcome: Record<string, CookingOutcome>
  notes?: string
}

// ─────────────────────────────────────────────────────────────────
// ai_undo_tokens
// ─────────────────────────────────────────────────────────────────

export type InverseActionType =
  | 'delete_meal_plan_entry'
  | 'delete_list_item'
  | 'restore_meal_plan_entry'
  | 'restore_list_item'

export interface InverseAction {
  type: InverseActionType
  payload: Record<string, unknown>
}

export interface DbUndoToken {
  id: string
  user_id: string
  description: string
  inverse_actions: InverseAction[]
  created_at: string
  expires_at: string
  used_at: string | null
}

export interface UndoToken {
  id: string
  userId: string
  description: string
  inverseActions: InverseAction[]
  createdAt: Date
  expiresAt: Date
  usedAt?: Date
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
    parameter: row.parameter ?? undefined,
    entries: entries.map(dbMealPlanEntryToMealPlanEntry),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export function dbCookingHistoryToEntry(row: DbCookingHistory): CookingHistoryEntry {
  return {
    id: row.id,
    userId: row.user_id,
    recipeId: row.recipe_id,
    entryId: row.entry_id ?? undefined,
    cookedAt: new Date(row.cooked_at),
    outcome: row.outcome,
    notes: row.notes ?? undefined,
  }
}

export function dbUndoTokenToToken(row: DbUndoToken): UndoToken {
  return {
    id: row.id,
    userId: row.user_id,
    description: row.description,
    inverseActions: row.inverse_actions,
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
    usedAt: row.used_at ? new Date(row.used_at) : undefined,
  }
}
