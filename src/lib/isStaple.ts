import type { ConsolidatedIngredient } from './consolidateIngredients'

/** Common pantry staples a household almost always has on hand — the ones the
 *  chat planner already offers to skip ("oil, salt, rice, soy sauce, flour,
 *  butter, etc."). Deliberately narrow: broad Pantry items like beans, pasta,
 *  or tortillas are NOT staples (you often need to buy them), so we key off a
 *  curated list plus the Spices category rather than the whole Pantry aisle. */
const STAPLE_PATTERN = new RegExp(
  '\\b(' + [
    'olive oil', 'vegetable oil', 'canola oil', 'cooking oil', 'oil',
    'salt', 'pepper', 'butter', 'flour', 'sugar', 'brown sugar',
    'honey', 'maple syrup', 'vinegar', 'soy sauce', 'water',
    'baking soda', 'baking powder', 'cornstarch', 'mustard',
    'mayonnaise', 'mayo', 'ketchup', 'cooking spray',
  ].join('|') + ')\\b',
  'i',
)

/** True when an ingredient is a staple the household likely already has, so the
 *  shopping list can offer it under "check before buying" instead of adding it
 *  by default. Spices are always treated as staples. */
export function isStaple(item: ConsolidatedIngredient): boolean {
  if (item.category === 'Spices') return true
  // "pepper" the seasoning is a staple; a bell or chili pepper is produce you
  // buy (a red bell pepper was left off the list, 2026-11-01).
  if (FRESH_PEPPER.test(item.text)) return false
  return STAPLE_PATTERN.test(item.text)
}

const FRESH_PEPPER = /\b(bell|jalape\w*|poblano|serrano|habanero|banana|sweet|shishito|chil[ei])\s+peppers?\b/i
