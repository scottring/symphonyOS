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
  return STAPLE_PATTERN.test(item.text)
}
