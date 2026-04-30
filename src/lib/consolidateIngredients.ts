import type { MealPlan, Recipe } from '@/types/meal-planner'
import { categorizeIngredient, type GroceryCategory } from './categorizeIngredient'

export interface ConsolidatedIngredient {
  text: string
  category: GroceryCategory
  fromRecipeIds: string[]
}

/**
 * Strip leading quantity/unit so "1 cup whole milk" and "1/2 cup whole milk" share a key.
 * v1 keeps it simple: lowercase + strip leading number/fraction + common units. Quantities aren't summed.
 */
function ingredientKey(ingredient: string): string {
  return ingredient
    .toLowerCase()
    .replace(/^[\d./\s]+/, '')
    .replace(/^\s*(cups?|tbsp|tsp|teaspoon[s]?|tablespoon[s]?|oz|ounce[s]?|lb|pound[s]?|g|kg|ml|l|liter[s]?|pinch|dash|clove[s]?|sprig[s]?|bunch|head|can[s]?|package|pkg|stick[s]?)\.?\s+/, '')
    .trim()
}

export function consolidateIngredients(plan: MealPlan, recipes: Recipe[]): ConsolidatedIngredient[] {
  const recipesById = new Map<string, Recipe>()
  recipes.forEach(r => recipesById.set(r.id, r))

  const byKey = new Map<string, ConsolidatedIngredient>()

  for (const entry of plan.entries) {
    // Leftover entries don't contribute ingredients — the parent (batch) entry
    // already does. Skip them to avoid double-counting on the grocery list.
    if (entry.leftoverFrom) continue
    const recipe = entry.recipe ?? (entry.recipeId ? recipesById.get(entry.recipeId) : undefined)
    if (!recipe) continue
    for (const ingredient of recipe.ingredients) {
      const key = ingredientKey(ingredient)
      if (!key) continue
      const existing = byKey.get(key)
      if (existing) {
        if (!existing.fromRecipeIds.includes(recipe.id)) {
          existing.fromRecipeIds.push(recipe.id)
        }
      } else {
        byKey.set(key, {
          text: ingredient,
          category: categorizeIngredient(ingredient),
          fromRecipeIds: [recipe.id],
        })
      }
    }
  }

  return Array.from(byKey.values())
}
