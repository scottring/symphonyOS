import { useState, useEffect, useMemo } from 'react'

interface RecipeViewerProps {
  url: string
  onClose: () => void
}

interface RecipeData {
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
}

// Parse recipe from JSON-LD or microdata
function parseRecipeFromHtml(html: string, url: string): RecipeData | null {
  try {
    // Try to find JSON-LD recipe data
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

    // Fallback: try to extract from meta tags and structured content
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

  // Parse ingredients
  let ingredients: string[] = []
  if (Array.isArray(recipe.recipeIngredient)) {
    ingredients = recipe.recipeIngredient.map((i) => String(i).trim())
  }

  // Parse instructions
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

  // Parse image
  let image: string | undefined
  if (typeof recipe.image === 'string') {
    image = recipe.image
  } else if (Array.isArray(recipe.image) && recipe.image.length > 0) {
    const first = recipe.image[0]
    image = typeof first === 'string' ? first : (first as Record<string, unknown>)?.url as string
  } else if (typeof recipe.image === 'object' && recipe.image !== null) {
    image = (recipe.image as Record<string, unknown>).url as string
  }

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
  }
}

function parseDuration(duration: unknown): string | undefined {
  if (!duration || typeof duration !== 'string') return undefined

  // Parse ISO 8601 duration (PT1H30M)
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

function parseRecipeFromMeta(html: string, url: string): RecipeData | null {
  // Extract title from og:title or <title>
  const titleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<title>([^<]+)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : 'Recipe'

  // Extract description
  const descMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
  const description = descMatch ? descMatch[1].trim() : undefined

  // Extract image
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

// Convert to narrative Alice Waters style
function toNarrativeStep(step: string, ingredients: string[]): string {
  // Find ingredient amounts and highlight them inline
  let narrative = step

  // Bold ingredient names when they appear in instructions
  for (const ing of ingredients) {
    // Extract just the ingredient name (remove amounts like "1 cup", "2 tablespoons")
    const nameMatch = ing.match(/(?:\d+[\d\/\s]*(?:cup|tablespoon|teaspoon|pound|ounce|gram|ml|g|oz|lb|tsp|tbsp|c\.)?\s*)?(.+)/i)
    if (nameMatch) {
      const name = nameMatch[1].trim()
      if (name.length > 2) {
        // Create case-insensitive regex for the ingredient name
        const regex = new RegExp(`\\b(${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi')
        narrative = narrative.replace(regex, '**$1**')
      }
    }
  }

  return narrative
}

// Format ingredient with amount inline in prose style
function formatIngredientNarrative(ingredient: string): { amount: string; name: string; full: string } {
  // Match patterns like "1 cup flour" or "2 large eggs" or "1/2 teaspoon salt"
  const match = ingredient.match(/^([\d\/\s]+(?:\s*(?:cup|tablespoon|teaspoon|pound|ounce|gram|ml|g|oz|lb|tsp|tbsp|c\.|large|medium|small|cloves?|heads?|bunch|can|package|stick)s?\s*(?:of)?)?)\s*(.+)$/i)

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

export function RecipeViewer({ url, onClose }: RecipeViewerProps) {
  const [recipe, setRecipe] = useState<RecipeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    async function fetchRecipe() {
      setLoading(true)
      setError(null)

      try {
        // Use a CORS proxy for fetching recipe pages
        // In production, this would be an edge function
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
        const response = await fetch(proxyUrl)

        if (!response.ok) {
          throw new Error('Failed to fetch recipe')
        }

        const html = await response.text()
        const parsed = parseRecipeFromHtml(html, url)

        if (!parsed) {
          throw new Error('Could not parse recipe from page')
        }

        setRecipe(parsed)
      } catch (err) {
        console.error('Recipe fetch error:', err)
        setError(err instanceof Error ? err.message : 'Failed to load recipe')
      } finally {
        setLoading(false)
      }
    }

    fetchRecipe()
  }, [url])

  const parsedIngredients = useMemo(() => {
    if (!recipe) return []
    return recipe.ingredients.map(formatIngredientNarrative)
  }, [recipe])

  const narrativeSteps = useMemo(() => {
    if (!recipe) return []
    return recipe.instructions.map((step) => toNarrativeStep(step, recipe.ingredients))
  }, [recipe])

  if (loading) {
    return (
      <div className="h-full flex flex-col bg-bg-elevated">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-100">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-lg text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
            aria-label="Close recipe"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          <span className="text-sm text-neutral-500">Loading recipe...</span>
          <div className="w-10" />
        </div>

        {/* Loading skeleton */}
        <div className="flex-1 p-6 animate-pulse">
          <div className="w-full h-48 bg-neutral-200 rounded-xl mb-6" />
          <div className="h-8 bg-neutral-200 rounded w-3/4 mb-4" />
          <div className="h-4 bg-neutral-100 rounded w-full mb-2" />
          <div className="h-4 bg-neutral-100 rounded w-5/6" />
        </div>
      </div>
    )
  }

  if (error || !recipe) {
    return (
      <div className="h-full flex flex-col bg-bg-elevated">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-100">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-lg text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          <span className="text-sm text-neutral-500">Recipe</span>
          <div className="w-10" />
        </div>

        {/* Error state */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-neutral-800 mb-2">Couldn't load recipe</h3>
          <p className="text-neutral-500 mb-6 max-w-xs">
            {error || 'The recipe couldn\'t be parsed from this page.'}
          </p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors"
          >
            Open original recipe
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-bg-elevated">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-neutral-100 bg-bg-elevated sticky top-0 z-10">
        <button
          onClick={onClose}
          className="p-2 -ml-2 rounded-lg text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          aria-label="Close recipe"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </button>
        <span className="text-sm text-neutral-500">{recipe.source}</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 -mr-2 rounded-lg text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          aria-label="Open original"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
            <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
          </svg>
        </a>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {/* Hero image */}
        {recipe.image && (
          <div className="aspect-[4/3] w-full bg-neutral-200 overflow-hidden">
            <img
              src={recipe.image}
              alt={recipe.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          </div>
        )}

        {/* Recipe content */}
        <div className="p-6">
          {/* Title and meta */}
          <h1 className="text-2xl font-semibold text-neutral-800 mb-3 leading-tight">
            {recipe.title}
          </h1>

          {recipe.description && (
            <p className="text-neutral-600 mb-4 leading-relaxed">{recipe.description}</p>
          )}

          {/* Time and servings */}
          <div className="flex flex-wrap gap-4 mb-8 text-sm">
            {recipe.totalTime && (
              <div className="flex items-center gap-1.5 text-neutral-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                <span>{recipe.totalTime}</span>
              </div>
            )}
            {recipe.servings && (
              <div className="flex items-center gap-1.5 text-neutral-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                </svg>
                <span>{recipe.servings}</span>
              </div>
            )}
          </div>

          {/* Ingredients - narrative style */}
          {parsedIngredients.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-neutral-800 mb-4">Gather</h2>
              <div className="bg-primary-50/50 rounded-xl p-5 border border-primary-100">
                <p className="text-neutral-700 leading-relaxed">
                  {parsedIngredients.map((ing, i) => (
                    <span key={i}>
                      {i > 0 && (i === parsedIngredients.length - 1 ? ', and ' : ', ')}
                      {ing.amount && (
                        <span className="text-primary-700 font-medium">{ing.amount} </span>
                      )}
                      <span className="text-neutral-800">{ing.name}</span>
                    </span>
                  ))}
                  .
                </p>
              </div>
            </section>
          )}

          {/* Instructions - step by step with narrative formatting */}
          {narrativeSteps.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-neutral-800 mb-4">Cook</h2>
              <div className="space-y-6">
                {narrativeSteps.map((step, i) => (
                  <div
                    key={i}
                    className={`
                      p-4 rounded-xl border transition-all cursor-pointer
                      ${currentStep === i
                        ? 'bg-primary-50/50 border-primary-200'
                        : 'bg-white border-neutral-100 hover:border-neutral-200'
                      }
                    `}
                    onClick={() => setCurrentStep(i)}
                  >
                    <div className="flex gap-4">
                      <div
                        className={`
                          w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-medium text-sm
                          ${currentStep === i
                            ? 'bg-primary-500 text-white'
                            : 'bg-neutral-100 text-neutral-500'
                          }
                        `}
                      >
                        {i + 1}
                      </div>
                      <p
                        className="flex-1 text-neutral-700 leading-relaxed pt-1"
                        dangerouslySetInnerHTML={{
                          __html: step.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-primary-700">$1</strong>')
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Bottom padding */}
          <div className="h-8" />
        </div>
      </div>

      {/* Bottom navigation for steps */}
      {narrativeSteps.length > 1 && (
        <div className="border-t border-neutral-100 p-4 bg-bg-elevated safe-bottom">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
              className={`
                px-4 py-2 rounded-lg font-medium text-sm transition-colors
                ${currentStep === 0
                  ? 'text-neutral-300 cursor-not-allowed'
                  : 'text-neutral-600 hover:bg-neutral-100'
                }
              `}
            >
              Previous
            </button>
            <span className="text-sm text-neutral-500">
              Step {currentStep + 1} of {narrativeSteps.length}
            </span>
            <button
              onClick={() => setCurrentStep(Math.min(narrativeSteps.length - 1, currentStep + 1))}
              disabled={currentStep === narrativeSteps.length - 1}
              className={`
                px-4 py-2 rounded-lg font-medium text-sm transition-colors
                ${currentStep === narrativeSteps.length - 1
                  ? 'text-neutral-300 cursor-not-allowed'
                  : 'bg-primary-500 text-white hover:bg-primary-600'
                }
              `}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
