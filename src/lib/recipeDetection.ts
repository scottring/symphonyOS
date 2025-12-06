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
 * Extract recipe title hint from event title
 * Removes common prefixes like "Dinner:", "Make:", etc.
 */
export function extractRecipeNameHint(eventTitle: string): string | null {
  const patterns = [
    /^(?:dinner|lunch|breakfast|meal|cook|make|bake|prepare|recipe):\s*(.+)/i,
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
