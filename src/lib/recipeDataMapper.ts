import type { RecipeData } from './recipeParser'
import { parseDurationToMinutes } from './parseDurationToMinutes'

export interface RecipeInsertRow {
  user_id: string
  title: string
  source_url: string
  source_label: string | null
  image_url: string | null
  prep_minutes: number | null
  ingredients: string[]
  instructions: string[]
  tags: string[]
  kid_acceptance: Record<string, never>
  acceptance_sentence: null
  is_prep_friendly: boolean
  times_cooked: number
  last_cooked_at: null
  streak_note: null
}

/**
 * Map a parsed RecipeData (from `recipeParser.fetchRecipe()`) to a row ready
 * for `supabase.from('recipes').insert(...)`. Omits the columns DB defaults
 * fill in (id, created_at, updated_at).
 *
 * The user_id arg comes from the caller's auth context.
 */
export function recipeDataToInsertRow(
  data: RecipeData,
  userId: string,
): RecipeInsertRow {
  let mins = data.totalTime ? parseDurationToMinutes(data.totalTime) : null
  if (mins === null && (data.prepTime || data.cookTime)) {
    const p = data.prepTime ? parseDurationToMinutes(data.prepTime) ?? 0 : 0
    const c = data.cookTime ? parseDurationToMinutes(data.cookTime) ?? 0 : 0
    mins = p + c > 0 ? p + c : null
  }

  return {
    user_id: userId,
    title: data.title,
    source_url: data.source,
    source_label: extractSourceLabel(data.source),
    image_url: data.image ?? null,
    prep_minutes: mins,
    ingredients: data.ingredients,
    instructions: data.instructions,
    tags: [],
    kid_acceptance: {},
    acceptance_sentence: null,
    is_prep_friendly: false,
    times_cooked: 0,
    last_cooked_at: null,
    streak_note: null,
  }
}

function extractSourceLabel(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host.includes('cooking.nytimes.com')) return 'NYT Cooking'
    if (host.includes('halfbakedharvest.com')) return 'Half Baked Harvest'
    if (host.includes('smittenkitchen.com')) return 'Smitten Kitchen'
    if (host.includes('seriouseats.com')) return 'Serious Eats'
    if (host.includes('food52.com')) return 'Food52'
    if (host.includes('bonappetit.com')) return 'Bon Appétit'
    if (host.includes('epicurious.com')) return 'Epicurious'
    if (host.includes('allrecipes.com')) return 'AllRecipes'
    return host
  } catch {
    return null
  }
}
