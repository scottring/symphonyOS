/**
 * Shared recipe parsing logic.
 * Fetches a recipe URL via CORS proxy, parses JSON-LD / microdata,
 * and returns structured recipe data.
 */

export interface RecipeData {
  title: string
  description?: string
  image?: string
  prepTime?: string
  cookTime?: string
  totalTime?: string
  servings?: string
  ingredients: string[]
  instructions: string[]
  source: string
  /** Non-blocking household alerts (e.g. allergy ingredients) — surface in the import UI. */
  warnings?: string[]
}

// ── Household ingredient flags ──────────────────────────────────

/** Ingredients that trigger a non-blocking household warning on import. */
const FLAGGED_INGREDIENTS: Array<{ pattern: RegExp; warning: string }> = [
  { pattern: /avocado/i, warning: 'Contains avocado — household allergy (hard restriction).' },
]

export function ingredientWarnings(ingredients: string[]): string[] {
  return FLAGGED_INGREDIENTS
    .filter(f => ingredients.some(i => f.pattern.test(i)))
    .map(f => f.warning)
}

export interface ParsedIngredient {
  amount: string
  name: string
  full: string
}

// ── Fetching ────────────────────────────────────────────────────

export async function fetchRecipe(url: string): Promise<RecipeData> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  const response = await fetch(`${supabaseUrl}/functions/v1/fetch-recipe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ url }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to fetch recipe')
  }

  const { html } = await response.json()
  const parsed = parseRecipeFromHtml(html, url)

  if (!parsed) {
    throw new Error('Could not parse recipe from page')
  }

  return parsed
}

// ── HTML Parsing ────────────────────────────────────────────────

export function parseRecipeFromHtml(html: string, url: string): RecipeData | null {
  try {
    const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)

    if (jsonLdMatch) {
      for (const match of jsonLdMatch) {
        const jsonContent = match.replace(/<script[^>]*>|<\/script>/gi, '')
        try {
          const data = JSON.parse(jsonContent)
          const recipeData = findRecipeInJsonLd(data)
          if (recipeData) {
            return normalizeRecipe(recipeData, url)
          }
        } catch {
          // Continue to next match
        }
      }
    }

    return parseRecipeFromMeta(html, url)
  } catch {
    return null
  }
}

function findRecipeInJsonLd(data: unknown): unknown {
  if (!data) return null

  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeInJsonLd(item)
      if (found) return found
    }
    return null
  }

  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>
    if (obj['@type'] === 'Recipe' || (Array.isArray(obj['@type']) && obj['@type'].includes('Recipe'))) {
      return obj
    }
    if (obj['@graph'] && Array.isArray(obj['@graph'])) {
      return findRecipeInJsonLd(obj['@graph'])
    }
  }

  return null
}

function normalizeRecipe(data: unknown, url: string): RecipeData {
  const recipe = data as Record<string, unknown>

  let ingredients: string[] = []
  if (Array.isArray(recipe.recipeIngredient)) {
    ingredients = recipe.recipeIngredient.map((i) => String(i).trim())
  }

  let instructions: string[] = []
  if (Array.isArray(recipe.recipeInstructions)) {
    instructions = recipe.recipeInstructions.map((step) => {
      if (typeof step === 'string') return step.trim()
      if (typeof step === 'object' && step !== null) {
        const s = step as Record<string, unknown>
        return String(s.text || s.name || '').trim()
      }
      return ''
    }).filter(Boolean)
  } else if (typeof recipe.recipeInstructions === 'string') {
    instructions = recipe.recipeInstructions.split(/\n+/).map((s) => s.trim()).filter(Boolean)
  }

  let image: string | undefined
  if (typeof recipe.image === 'string') {
    image = recipe.image
  } else if (Array.isArray(recipe.image) && recipe.image.length > 0) {
    const first = recipe.image[0]
    image = typeof first === 'string' ? first : (first as Record<string, unknown>)?.url as string
  } else if (typeof recipe.image === 'object' && recipe.image !== null) {
    image = (recipe.image as Record<string, unknown>).url as string
  }

  const warnings = ingredientWarnings(ingredients)

  return {
    title: String(recipe.name || 'Untitled Recipe'),
    description: recipe.description ? String(recipe.description) : undefined,
    image,
    prepTime: parseDuration(recipe.prepTime),
    cookTime: parseDuration(recipe.cookTime),
    totalTime: parseDuration(recipe.totalTime),
    servings: recipe.recipeYield ? String(recipe.recipeYield) : undefined,
    ingredients,
    instructions,
    source: new URL(url).hostname.replace(/^www\./, ''),
    ...(warnings.length ? { warnings } : {}),
  }
}

function parseRecipeFromMeta(html: string, url: string): RecipeData | null {
  const titleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<title>([^<]+)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : 'Recipe'

  const descMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
  const description = descMatch ? descMatch[1].trim() : undefined

  const imageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
  const image = imageMatch ? imageMatch[1] : undefined

  return {
    title,
    description,
    image,
    ingredients: [],
    instructions: [],
    source: new URL(url).hostname.replace(/^www\./, ''),
  }
}

export function parseDuration(duration: unknown): string | undefined {
  if (!duration || typeof duration !== 'string') return undefined

  const match = String(duration).match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
  if (match) {
    const hours = parseInt(match[1] || '0', 10)
    const minutes = parseInt(match[2] || '0', 10)
    if (hours && minutes) return `${hours}h ${minutes}m`
    if (hours) return `${hours}h`
    if (minutes) return `${minutes}m`
  }
  return undefined
}

// ── Ingredient Parsing ──────────────────────────────────────────

export function formatIngredientNarrative(ingredient: string): ParsedIngredient {
  const match = ingredient.match(/^([\d/\s]+(?:\s*(?:cup|tablespoon|teaspoon|pound|ounce|gram|ml|g|oz|lb|tsp|tbsp|c\.|large|medium|small|cloves?|heads?|bunch|can|package|stick)s?\s*(?:of)?)?)\s*(.+)$/i)

  if (match) {
    return {
      amount: match[1].trim(),
      name: match[2].trim(),
      full: ingredient,
    }
  }

  return {
    amount: '',
    name: ingredient,
    full: ingredient,
  }
}

// ── Narrative Step Formatting ───────────────────────────────────

export function toNarrativeStep(step: string, ingredients: string[]): string {
  let narrative = step

  for (const ing of ingredients) {
    const nameMatch = ing.match(/(?:\d+[\d/\s]*(?:cup|tablespoon|teaspoon|pound|ounce|gram|ml|g|oz|lb|tsp|tbsp|c\.)?\s*)?(.+)/i)
    if (nameMatch) {
      const name = nameMatch[1].trim()
      if (name.length > 2) {
        const regex = new RegExp(`\\b(${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi')
        narrative = narrative.replace(regex, '**$1**')
      }
    }
  }

  return narrative
}
