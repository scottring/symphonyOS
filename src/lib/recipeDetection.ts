/**
 * Recipe URL detection utility
 * Detects recipe URLs from event descriptions and titles
 */

// Known recipe website patterns
const RECIPE_DOMAINS = [
  'allrecipes.com',
  'epicurious.com',
  'bonappetit.com',
  'seriouseats.com',
  'food52.com',
  'cooking.nytimes.com',
  'nytimes.com/cooking',
  'budgetbytes.com',
  'minimalistbaker.com',
  'skinnytaste.com',
  'delish.com',
  'foodnetwork.com',
  'tasty.co',
  'simplyrecipes.com',
  'thekitchn.com',
  'smittenkitchen.com',
  'halfbakedharvest.com',
  'loveandlemons.com',
  'cookieandkate.com',
  'pinchofyum.com',
  'damndelicious.net',
  'recipetineats.com',
  'joyofcooking.com',
]

/**
 * Detect a recipe URL from text (event description or title)
 * Returns the first recipe URL found, or null if none detected
 */
export function detectRecipeUrl(text: string | null | undefined): string | null {
  if (!text) return null

  // Build regex pattern for known recipe domains
  const domainPattern = RECIPE_DOMAINS
    .map(d => d.replace(/\./g, '\\.'))
    .join('|')

  const recipeUrlPattern = new RegExp(
    `https?:\\/\\/(?:www\\.)?(?:${domainPattern})\\/[^\\s<>"']+`,
    'gi'
  )

  const match = text.match(recipeUrlPattern)
  if (match) {
    return cleanUrl(match[0])
  }

  // Fallback: Check for any URL that might be a recipe
  // Look for URLs containing 'recipe' in the path
  const anyUrlPattern = /https?:\/\/[^\s<>"']+/gi
  const urls = text.match(anyUrlPattern)

  if (urls) {
    for (const url of urls) {
      const lowerUrl = url.toLowerCase()
      if (
        lowerUrl.includes('/recipe') ||
        lowerUrl.includes('/recipes/')
      ) {
        return cleanUrl(url)
      }
    }
  }

  return null
}

/**
 * Resolve the recipe URL for a meal/event description.
 *
 * Planned meals store the recipe's `sourceUrl` as the entire description, so if
 * the description IS a bare URL we use it directly — regardless of domain. Only
 * for free-text descriptions (e.g. a Google Calendar event with a URL embedded
 * in prose) do we fall back to `detectRecipeUrl`'s recipe-domain heuristic.
 */
export function resolveRecipeUrl(text: string | null | undefined): string | null {
  if (!text) return null
  const trimmed = text.trim()
  if (/^https?:\/\/\S+$/.test(trimmed)) return trimmed
  return detectRecipeUrl(text)
}

/**
 * Clean up a URL by removing trailing punctuation
 */
function cleanUrl(url: string): string {
  // Remove trailing punctuation that might have been captured
  return url.replace(/[.,;:!?)]+$/, '')
}

/**
 * Check if a URL is from a known recipe website
 */
export function isRecipeDomain(url: string): boolean {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.replace(/^www\./, '')
    return RECIPE_DOMAINS.some(domain => hostname.includes(domain))
  } catch {
    return false
  }
}

/**
 * Split a meal title that has a recipe link pasted into it.
 *
 * `meal_plan_entries` has no URL column, so an ad-hoc meal (no recipe row) has
 * nowhere to keep its link except the title — and people paste one, brackets
 * and all: "Golden tofu noodle bowl https://cooking.nytimes.com/...)". Left
 * alone that URL renders as title text on the wall and the tap has nothing to
 * open (Scott, 2026-09-15).
 *
 * Any URL counts here, not just a known recipe domain: the user putting a link
 * next to a dish name has already told us what it is, and being wrong about a
 * domain is better than printing a URL across the kitchen wall.
 */
export function splitRecipeTitleUrl(
  title: string | null | undefined,
): { name: string; url: string | null } {
  const raw = (title ?? '').trim()
  if (!raw) return { name: '', url: null }

  const match = raw.match(/https?:\/\/[^\s<>"')\]]+/i)
  if (!match) return { name: raw, url: null }

  const url = cleanUrl(match[0])
  const name = raw
    .replace(match[0], ' ')
    // What a stripped markdown link leaves behind: "[Dish]( )" → "Dish".
    .replace(/[[\]()]/g, ' ')
    // Separators that only existed to hold the link off the name. Hyphens are
    // matched with surrounding space so "Sheet-Pan" keeps its own.
    .replace(/\s+[-–—·:|]+\s*$/, '')
    .replace(/[\s,;]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  // A title that was nothing but a link still needs something to read.
  if (!name) {
    try {
      return { name: new URL(url).hostname.replace(/^www\./, ''), url }
    } catch {
      return { name: url, url }
    }
  }
  return { name, url }
}

/**
 * Extract recipe title hint from event title
 * Removes common prefixes like "Dinner:", "Make:", etc.
 */
export function extractRecipeNameHint(eventTitle: string): string | null {
  const patterns = [
    /^(?:dinner|lunch|breakfast|brunch|meal|cook|make|bake|prepare|recipe)\s*[:·]\s*(.+)/i,
    /^(.+?)\s*(?:dinner|lunch|breakfast|meal)$/i,
  ]

  for (const pattern of patterns) {
    const match = eventTitle.match(pattern)
    if (match) {
      return match[1].trim()
    }
  }

  return null
}
