import type { MealPlan, Recipe } from '@/types/meal-planner'
import { categorizeIngredient, type GroceryCategory } from './categorizeIngredient'

export interface ConsolidatedIngredient {
  text: string
  category: GroceryCategory
  fromRecipeIds: string[]
}

interface Parsed {
  value: number
  unit: string | null   // base form (singular), e.g. "cup", "tbsp"; null = no unit
  noun: string          // ingredient noun without quantity, unit, or trailing prep clause
}

const UNITS_BASE = [
  'cup', 'tablespoon', 'tbsp', 'teaspoon', 'tsp',
  'ounce', 'oz', 'pound', 'lb', 'gram', 'g', 'kilogram', 'kg',
  'milliliter', 'ml', 'liter', 'l',
  'pinch', 'dash', 'clove', 'sprig', 'bunch', 'head',
  'can', 'package', 'pkg', 'stick', 'slice',
] as const

const UNIT_TO_BASE: Record<string, string> = {}
for (const u of UNITS_BASE) {
  UNIT_TO_BASE[u] = u
  UNIT_TO_BASE[u + 's'] = u
}
UNIT_TO_BASE['tablespoon'] = 'tbsp'
UNIT_TO_BASE['tablespoons'] = 'tbsp'
UNIT_TO_BASE['teaspoon'] = 'tsp'
UNIT_TO_BASE['teaspoons'] = 'tsp'
UNIT_TO_BASE['ounces'] = 'oz'
UNIT_TO_BASE['pounds'] = 'lb'
UNIT_TO_BASE['liters'] = 'l'
UNIT_TO_BASE['milliliters'] = 'ml'
UNIT_TO_BASE['grams'] = 'g'
UNIT_TO_BASE['kilograms'] = 'kg'

const PLURAL_OVERRIDES: Record<string, string> = {
  tomato: 'tomatoes',
  potato: 'potatoes',
  leaf: 'leaves',
  loaf: 'loaves',
}

// Unicode single-character fractions recipes love to use (½ cup, ¾ tsp).
const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6,
}
const UNICODE_FRACTION_CLASS = Object.keys(UNICODE_FRACTIONS).join('')

function parseQuantity(s: string): number | null {
  const t = s.trim()
  // mixed: "1 1/2"
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3])
  // fraction: "1/2"
  const frac = t.match(/^(\d+)\/(\d+)$/)
  if (frac) return parseInt(frac[1]) / parseInt(frac[2])
  // digit + unicode fraction: "1½"
  const uMixed = t.match(new RegExp(`^(\\d+)\\s*([${UNICODE_FRACTION_CLASS}])$`))
  if (uMixed) return parseInt(uMixed[1]) + UNICODE_FRACTIONS[uMixed[2]]
  // single unicode fraction: "½"
  if (t.length === 1 && UNICODE_FRACTIONS[t] != null) return UNICODE_FRACTIONS[t]
  // decimal or integer
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Prep/state/size words that describe an ingredient but don't change WHAT it
 *  is. Stripped when building the merge key so "fresh basil leaves", "chopped
 *  basil", and "½ cup basil, torn" all collapse to the same shopping item.
 *  Deliberately excludes color words (red/green) and nouns like pesto/sauce/
 *  paste/powder that DO distinguish a different product. */
const DESCRIPTORS = new Set([
  'fresh', 'dried', 'frozen', 'canned', 'jarred', 'ground', 'whole', 'halved', 'quartered',
  'chopped', 'minced', 'diced', 'sliced', 'shredded', 'grated', 'crushed', 'torn', 'cubed',
  'julienned', 'crumbled', 'melted', 'softened', 'packed', 'peeled', 'seeded', 'pitted',
  'cooked', 'raw', 'roasted', 'toasted', 'beaten', 'divided', 'rinsed', 'drained', 'trimmed',
  'large', 'small', 'medium', 'extra', 'jumbo', 'ripe', 'boneless', 'skinless', 'lean',
  'thin', 'thick', 'fine', 'coarse',
  'roughly', 'finely', 'coarsely', 'thinly', 'freshly', 'lightly', 'well',
  'of', 'plus', 'more', 'for', 'to', 'taste', 'garnish', 'finishing', 'serving', 'optional',
  'and', 'or', 'total', 'about', 'approximately', 'approx', 'room', 'temperature', 'cold', 'warm', 'hot',
  'leaves', 'leaf', 'sprigs', 'sprig', 'stalks', 'stalk',
])

// All unit tokens (singular + plural, from UNIT_TO_BASE keys) — stripped from
// the merge key too, so differing units never splinter one ingredient.
const UNIT_WORDS = new Set(Object.keys(UNIT_TO_BASE))

/** The canonical "what is this ingredient" key: lowercase, drop markdown links,
 *  parentheticals, everything after a comma/dash, then all numbers, units, and
 *  descriptor words — leaving the core noun ("basil", "parsley", "basil pesto").
 *  Same core → one shopping line, regardless of quantity, unit, or phrasing. */
function canonicalKey(raw: string): string {
  let s = raw.toLowerCase()
  s = s.replace(/\[[^\]]*\]\([^)]*\)/g, ' ') // markdown links [x](y)
  s = s.replace(/\([^)]*\)/g, ' ')           // parentheticals
  // Cut a trailing prep clause: at a comma, or a space-padded dash ("basil — torn").
  // NOT a bare dash, which appears inside quantity ranges like "¾–1 cup".
  const cut = s.search(/,|\s[—–]/)
  if (cut >= 0) s = s.slice(0, cut)
  const tokens = s.split(/[^a-z]+/).filter(Boolean)
  const core = tokens.filter(t => !UNIT_WORDS.has(t) && !DESCRIPTORS.has(t))
  return (core.length > 0 ? core : tokens).join(' ').trim()
}

/** One clean display line for an un-summable group: first contribution's text
 *  with the markdown/parenthetical/prep-clause noise removed. */
function cleanDisplay(raw: string): string {
  let s = raw.replace(/\[[^\]]*\]\([^)]*\)/g, '').replace(/\([^)]*\)/g, '').trim()
  const cut = s.search(/,|\s[—–]/)
  if (cut >= 0) s = s.slice(0, cut).trim()
  return s.replace(/\s+/g, ' ')
}

function parseIngredient(ingredient: string): Parsed | null {
  const lower = ingredient.toLowerCase().trim()
  // Quantity: integer, fraction, mixed, decimal, or unicode fraction at the start.
  const qtyMatch = lower.match(
    new RegExp(`^(\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+\\s*[${UNICODE_FRACTION_CLASS}]|[${UNICODE_FRACTION_CLASS}]|\\d+(?:\\.\\d+)?)\\s*`),
  )
  if (!qtyMatch) return null
  const value = parseQuantity(qtyMatch[1])
  if (value == null) return null

  let rest = lower.slice(qtyMatch[0].length).trim()

  // Optional unit
  let unit: string | null = null
  const firstWord = rest.match(/^([a-z]+)\.?\s+/)
  if (firstWord) {
    const candidate = firstWord[1]
    const base = UNIT_TO_BASE[candidate]
    if (base) {
      unit = base
      rest = rest.slice(firstWord[0].length).trim()
    }
  }

  // Drop trailing prep clause (anything after a comma or " — ").
  const splitIdx = rest.search(/[,—]/)
  let noun = (splitIdx >= 0 ? rest.slice(0, splitIdx) : rest).trim()
  // Also strip trailing parentheticals ("(optional)", "(divided)").
  noun = noun.replace(/\s*\(.*?\)\s*$/, '').trim()
  // Strip leading "of " (e.g. "1 cup of milk")
  noun = noun.replace(/^of\s+/, '').trim()

  if (!noun) return null
  return { value, unit, noun }
}

function pluralizeNoun(noun: string): string {
  const words = noun.split(/\s+/)
  const last = words[words.length - 1]
  if (PLURAL_OVERRIDES[last]) {
    words[words.length - 1] = PLURAL_OVERRIDES[last]
    return words.join(' ')
  }
  if (last.endsWith('s')) return noun
  if (last.endsWith('y') && !/[aeiou]y$/.test(last)) {
    words[words.length - 1] = last.slice(0, -1) + 'ies'
    return words.join(' ')
  }
  if (last.endsWith('ch') || last.endsWith('sh') || last.endsWith('x')) {
    words[words.length - 1] = last + 'es'
    return words.join(' ')
  }
  return noun + 's'
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n)
  // Convert common decimals back to fractions for readability
  const FRAC_MAP: Record<string, string> = {
    '0.25': '1/4', '0.50': '1/2', '0.33': '1/3', '0.67': '2/3', '0.75': '3/4',
  }
  const frac = (n - Math.floor(n)).toFixed(2)
  if (FRAC_MAP[frac]) {
    const whole = Math.floor(n)
    return whole === 0 ? FRAC_MAP[frac] : `${whole} ${FRAC_MAP[frac]}`
  }
  return n.toFixed(2).replace(/\.?0+$/, '')
}

function pluralizeUnit(unit: string, count: number): string {
  if (count === 1) return unit
  // Most units pluralize by adding 's'. Exceptions: g, kg, ml, l, oz, lb, tbsp, tsp.
  const NO_PLURAL = new Set(['g', 'kg', 'ml', 'l', 'oz', 'lb', 'tbsp', 'tsp'])
  if (NO_PLURAL.has(unit)) return unit
  return unit + 's'
}

/** Merge key = the canonical core ingredient, so the SAME ingredient collapses
 *  to one line no matter how each recipe phrases it (quantity, unit, prep, or
 *  descriptors). `parsed` is unused for keying now but kept for the signature. */
function ingredientKey(_parsed: Parsed | null, raw: string): string {
  return canonicalKey(raw)
}

interface Accumulator {
  category: GroceryCategory
  fromRecipeIds: string[]
  contributions: { raw: string; parsed: Parsed | null }[]
}

function renderText(acc: Accumulator): string {
  // If every contribution parsed and they share the same unit, sum and pluralize.
  const allParsed = acc.contributions.every(c => c.parsed)
  if (allParsed && acc.contributions.length > 0) {
    const parts = acc.contributions.map(c => c.parsed!) as Parsed[]
    const unit = parts[0].unit
    const sameUnit = parts.every(p => p.unit === unit)
    if (sameUnit) {
      const total = parts.reduce((s, p) => s + p.value, 0)
      const noun = parts[0].noun
      if (unit) {
        return `${formatNumber(total)} ${pluralizeUnit(unit, total)} ${noun}`.trim()
      }
      const displayNoun = total === 1 ? noun : pluralizeNoun(noun)
      return `${formatNumber(total)} ${displayNoun}`.trim()
    }
  }
  // Un-summable (mixed units, or some without quantities): one clean line from
  // the first contribution rather than repeating the ingredient N times.
  return cleanDisplay(acc.contributions[0]?.raw ?? '')
}

export function consolidateIngredients(plan: MealPlan, recipes: Recipe[]): ConsolidatedIngredient[] {
  const recipesById = new Map<string, Recipe>()
  recipes.forEach(r => recipesById.set(r.id, r))

  const byKey = new Map<string, Accumulator>()

  // Count each recipe's ingredients ONCE, even if it's scheduled on several
  // days (a "weekly batch" breakfast on 5 mornings is one shopping need, not
  // five). Multiplying per-entry produced absurd lists ("40 eggs"). Ingredients
  // shared across DIFFERENT recipes still sum — that dedup happens by key below.
  const seenRecipeIds = new Set<string>()
  const uniqueRecipes: Recipe[] = []
  for (const entry of plan.entries) {
    if (entry.leftoverFrom) continue
    const recipe = entry.recipe ?? (entry.recipeId ? recipesById.get(entry.recipeId) : undefined)
    if (!recipe || seenRecipeIds.has(recipe.id)) continue
    seenRecipeIds.add(recipe.id)
    uniqueRecipes.push(recipe)
  }

  for (const recipe of uniqueRecipes) {
    for (const ingredient of recipe.ingredients) {
      const parsed = parseIngredient(ingredient)
      const key = ingredientKey(parsed, ingredient)
      if (!key) continue
      const existing = byKey.get(key)
      if (existing) {
        existing.contributions.push({ raw: ingredient, parsed })
        if (!existing.fromRecipeIds.includes(recipe.id)) {
          existing.fromRecipeIds.push(recipe.id)
        }
      } else {
        byKey.set(key, {
          category: categorizeIngredient(ingredient),
          fromRecipeIds: [recipe.id],
          contributions: [{ raw: ingredient, parsed }],
        })
      }
    }
  }

  return Array.from(byKey.values()).map(acc => ({
    text: renderText(acc),
    category: acc.category,
    fromRecipeIds: acc.fromRecipeIds,
  }))
}
