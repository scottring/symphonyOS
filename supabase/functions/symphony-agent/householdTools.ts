// Household tools for Symphony's assistant (2026-11-11): things a person can
// do in the app that the assistant could not — the recipe shelf, the grocery
// list the meal plan keeps, the kept school digest with the open papers and
// homework, and the life areas.
//
// Every query runs on the caller's RLS-scoped client; nothing here takes a
// service-role client. Executors return a string: JSON on success, a string
// starting "Error:" on failure (the shape runTool and toolOutcome expect).
//
// An edge function cannot import from src/, so the grocery sync below mirrors
// src/lib/consolidateIngredients.ts, src/lib/categorizeIngredient.ts,
// src/lib/isStaple.ts, src/lib/mealGroceries.ts and the write loop in
// src/hooks/useGroceryStatus.ts. householdTools.test.ts holds the copies to
// the originals: change one, the parity tests fail until the other follows.

import { parseDigestResponse, type DigestSection } from '../school-digest/lib/digest.ts'
import { addDays, resolveDate, weekOf } from './meals.ts'

// The caller's RLS-scoped SupabaseClient (typed loosely, as meals.ts does).
// deno-lint-ignore no-explicit-any
type Db = any

export interface HouseholdCtx {
  /** The signed-in user (auth.uid()). */
  userId: string
  /** The household's day, YYYY-MM-DD. */
  today: string
  /** canvasEvents.stableRowId for this creation, when the turn has one. */
  stableId?: string | null
}

const errText = (e: unknown) => e instanceof Error ? e.message : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message) : String(e)
const fail = (e: unknown) => `Error: ${errText(e)}`
/** ilike without the person's own % and _ acting as wildcards. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)
const str = (v: unknown, max = 500) => typeof v === 'string' ? v.trim().slice(0, max) : ''

/** A list of lines from an array of strings or one block of text. */
function lines(v: unknown, maxLines = 200, maxLen = 500): string[] {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\r?\n/) : []
  return raw
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, maxLines)
}

// ═══════════════════════════════ Recipes ═══════════════════════════════
// The household shelf: RLS lets a member read, edit and delete any recipe in
// their household (users_share_household) and insert only their own
// (user_id = auth.uid()). The app (useRecipes) reads with no owner filter.

export const LIST_RECIPES_TOOL = {
  name: 'symphony_list_recipes',
  description: "List recipes on the household recipe shelf (the same shelf the Meals page and the kitchen wall use). search matches the recipe name; tag filters by tag. Use symphony_get_recipe for a recipe's ingredients and steps.",
  input_schema: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Part of the recipe name, any case' },
      tag: { type: 'string', description: 'A tag, e.g. "pasta"' },
      limit: { type: 'number', description: '1 to 200; default 50' },
    },
  },
}

export const GET_RECIPE_TOOL = {
  name: 'symphony_get_recipe',
  description: 'One recipe from the household shelf with its ingredients (one per line) and steps. Pass id when known, else the recipe name.',
  input_schema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Recipe id' },
      title: { type: 'string', description: 'Recipe name, when the id is not known' },
    },
  },
}

export const CREATE_RECIPE_TOOL = {
  name: 'symphony_create_recipe',
  description: "Add a recipe to the household shelf by hand, from what the person tells you or pastes. ingredients and instructions are one ingredient / one step per string (the wall reads them line by line); keep the person's own wording and amounts. Never invent ingredients or steps the person did not give. Check symphony_list_recipes first so the shelf does not get a second copy.",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'The recipe name' },
      ingredients: { type: 'array', items: { type: 'string' }, description: 'One ingredient per string, e.g. "3 oz bucatini"' },
      instructions: { type: 'array', items: { type: 'string' }, description: 'One step per string' },
      prep_minutes: { type: 'number', description: 'Total minutes, prep + cook' },
      source_url: { type: 'string', description: 'Where the recipe came from, http(s) link' },
      source_label: { type: 'string', description: 'Who it is from, e.g. "Grandma" or "NYT Cooking"' },
      tags: { type: 'array', items: { type: 'string' } },
      is_prep_friendly: { type: 'boolean', description: 'Batch-cooks well / good leftovers' },
    },
    required: ['title'],
  },
}

const RECIPE_LIST_COLUMNS = 'id, title, prep_minutes, tags, is_prep_friendly, times_cooked, last_cooked_at'
const RECIPE_COLUMNS = 'id, user_id, title, source_url, source_label, prep_minutes, ingredients, instructions, tags, is_prep_friendly, times_cooked, last_cooked_at, created_at'

export async function listRecipes(db: Db, input: Record<string, unknown>, _ctx?: HouseholdCtx): Promise<string> {
  try {
    const limit = Math.min(200, Math.max(1, Math.round(Number(input.limit)) || 50))
    let q = db.from('recipes').select(RECIPE_LIST_COLUMNS).order('title').limit(limit)
    const search = str(input.search, 200)
    if (search) q = q.ilike('title', `%${likeEscape(search)}%`)
    const tag = str(input.tag, 100)
    if (tag) q = q.contains('tags', [tag])
    const { data, error } = await q
    if (error) throw error
    return JSON.stringify(data ?? [], null, 2)
  } catch (e) { return fail(e) }
}

export async function getRecipe(db: Db, input: Record<string, unknown>, _ctx?: HouseholdCtx): Promise<string> {
  try {
    const id = str(input.id, 64)
    const title = str(input.title, 200)
    if (!id && !title) return 'Error: id or title is required'
    if (id) {
      const { data, error } = await db.from('recipes').select(RECIPE_COLUMNS).eq('id', id).maybeSingle()
      if (error) throw error
      if (!data) return `Error: no recipe with id ${id} on the household shelf`
      return JSON.stringify(data, null, 2)
    }
    // The exact name first ("the chili" may be one of three chilis), then a part.
    const exact = await db.from('recipes').select(RECIPE_COLUMNS).ilike('title', likeEscape(title)).limit(1)
    if (exact.error) throw exact.error
    if (exact.data?.[0]) return JSON.stringify(exact.data[0], null, 2)
    const near = await db.from('recipes').select(RECIPE_COLUMNS).ilike('title', `%${likeEscape(title)}%`).order('title').limit(5)
    if (near.error) throw near.error
    const found = near.data ?? []
    if (!found.length) return `Error: no recipe called "${title}" on the household shelf`
    if (found.length === 1) return JSON.stringify(found[0], null, 2)
    return JSON.stringify({ several_match: found.map((r: { id: string; title: string }) => ({ id: r.id, title: r.title })) }, null, 2)
  } catch (e) { return fail(e) }
}

/** Mirror of src/lib/recipeDataMapper.ts extractSourceLabel. */
export function sourceLabelFor(url: string): string | null {
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

/** The row useRecipes.addManual writes, with an optional source link. */
export function recipeRow(input: Record<string, unknown>, userId: string): { row: Record<string, unknown> } | { error: string } {
  const title = str(input.title ?? input.name, 200)
  if (!title) return { error: 'title is required' }
  let sourceUrl: string | null = null
  const rawUrl = str(input.source_url, 2000)
  if (rawUrl) {
    try {
      const u = new URL(rawUrl)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: 'source_url must be an http(s) link' }
      sourceUrl = u.toString()
    } catch { return { error: 'source_url must be an http(s) link' } }
  }
  const prep = Number(input.prep_minutes)
  const tags = lines(input.tags, 20, 50)
  return {
    row: {
      user_id: userId,
      title,
      source_url: sourceUrl,
      source_label: str(input.source_label, 200) || (sourceUrl ? sourceLabelFor(sourceUrl) : null),
      image_url: null,
      prep_minutes: Number.isFinite(prep) && prep > 0 ? Math.min(24 * 60, Math.round(prep)) : null,
      ingredients: lines(input.ingredients),
      instructions: lines(input.instructions, 100, 2000),
      tags,
      kid_acceptance: {},
      acceptance_sentence: null,
      is_prep_friendly: input.is_prep_friendly === true,
      times_cooked: 0,
      last_cooked_at: null,
      streak_note: null,
    },
  }
}

export async function createRecipe(db: Db, input: Record<string, unknown>, ctx: HouseholdCtx): Promise<string> {
  try {
    const built = recipeRow(input, ctx.userId)
    if ('error' in built) return `Error: ${built.error}`
    const row = ctx.stableId ? { ...built.row, id: ctx.stableId } : built.row
    const { data, error } = await db.from('recipes').insert(row).select('id, title, ingredients, instructions, prep_minutes, source_url, source_label, tags').single()
    if (error?.code === '23505' && ctx.stableId) {
      // This turn already saved it (a resent turn): hand back that row.
      const again = await db.from('recipes').select('id, title, ingredients, instructions, prep_minutes, source_url, source_label, tags').eq('id', ctx.stableId).maybeSingle()
      if (again.data) return JSON.stringify({ ...again.data, already_saved: true }, null, 2)
    }
    if (error) throw error
    return JSON.stringify(data, null, 2)
  } catch (e) { return fail(e) }
}

// ══════════════════════ Ingredients (mirrors of src/lib) ══════════════════════

export type GroceryCategory = 'Produce' | 'Dairy' | 'Meat' | 'Pantry' | 'Spices' | 'Other'

export interface ConsolidatedIngredient {
  text: string
  category: GroceryCategory
  fromRecipeIds: string[]
  key: string
}

// ── src/lib/categorizeIngredient.ts ──
const CATEGORY_PATTERNS: Array<[GroceryCategory, RegExp]> = [
  ['Produce', /\b(apples?|bananas?|berry|berries|grapes?|lemons?|limes?|oranges?|pears?|peach(?:es)?|plums?|avocados?|tomato(?:es)?|onions?|garlic|potato(?:es)?|carrots?|celery|cucumbers?|peppers?|chili(?:es|s)?|broccoli|spinach|kale|lettuce|salad|arugula|cabbages?|cauliflowers?|zucchinis?|squash(?:es)?|mushrooms?|corn|asparagus|herbs?|cilantro|parsley|basil|mint|dill|scallions?|leeks?|ginger|fennel|radish(?:es)?|sprouts?|greens)\b/i],
  ['Dairy', /\b(milk|cream|yogurts?|cheese|butter|eggs?|sour cream|cream cheese|cottage cheese|ricotta|mozzarella|parmesan|feta|cheddar|gruy|brie|half[- ]and[- ]half)\b/i],
  ['Meat', /\b(chicken|beef|pork|bacon|hams?|sausages?|turkey|lamb|veal|salmon|tuna|cod|fish|shrimps?|prawns?|crabs?|lobsters?|scallops?|tofu|tempeh)\b/i],
  ['Spices', /\b(salt|pepper|cinnamon|cumin|paprika|oregano|thyme|rosemary|sage|bay leaf|bay leaves|cardamom|coriander|nutmeg|cloves?|turmeric|saffron|chili powder|garlic powder|onion powder|spices?|seasonings?)\b/i],
  ['Pantry', /\b(flour|sugar|rice|pasta|noodles?|bread|tortillas?|oil|vinegar|sauce|broth|stock|beans?|lentils?|chickpeas?|tomato paste|tomato sauce|coconut milk|honey|syrup|jam|peanut butter|nuts?|seeds?|oats?|cereal|crackers)\b/i],
]

export function categorizeIngredient(text: string): GroceryCategory {
  const lower = text.toLowerCase()
  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(lower)) return category
  }
  return 'Other'
}

// ── src/lib/isStaple.ts ──
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
const FRESH_PEPPER = /\b(bell|jalape\w*|poblano|serrano|habanero|banana|sweet|shishito|chil[ei])\s+peppers?\b/i

export function isStaple(item: ConsolidatedIngredient): boolean {
  if (item.category === 'Spices') return true
  if (FRESH_PEPPER.test(item.text)) return false
  return STAPLE_PATTERN.test(item.text)
}

// ── src/lib/consolidateIngredients.ts ──
interface Parsed { value: number; unit: string | null; noun: string }

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

const PLURAL_OVERRIDES: Record<string, string> = { tomato: 'tomatoes', potato: 'potatoes', leaf: 'leaves', loaf: 'loaves' }

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6,
}
const UNICODE_FRACTION_CLASS = Object.keys(UNICODE_FRACTIONS).join('')

function parseQuantity(s: string): number | null {
  const t = s.trim()
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3])
  const frac = t.match(/^(\d+)\/(\d+)$/)
  if (frac) return parseInt(frac[1]) / parseInt(frac[2])
  const uMixed = t.match(new RegExp(`^(\\d+)\\s*([${UNICODE_FRACTION_CLASS}])$`))
  if (uMixed) return parseInt(uMixed[1]) + UNICODE_FRACTIONS[uMixed[2]]
  if (t.length === 1 && UNICODE_FRACTIONS[t] != null) return UNICODE_FRACTIONS[t]
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

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

const UNIT_WORDS = new Set(Object.keys(UNIT_TO_BASE))

function canonicalKey(raw: string): string {
  let s = raw.toLowerCase()
  s = s.replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
  s = s.replace(/\([^)]*\)/g, ' ')
  const cut = s.search(/,|\s[—–]/)
  if (cut >= 0) s = s.slice(0, cut)
  const tokens = s.split(/[^a-z]+/).filter(Boolean)
  const core = tokens.filter(t => !UNIT_WORDS.has(t) && !DESCRIPTORS.has(t))
  return (core.length > 0 ? core : tokens).join(' ').trim()
}

function cleanDisplay(raw: string): string {
  let s = raw.replace(/\[[^\]]*\]\([^)]*\)/g, '').replace(/\([^)]*\)/g, '').trim()
  const cut = s.search(/,|\s[—–]/)
  if (cut >= 0) s = s.slice(0, cut).trim()
  return s.replace(/\s+/g, ' ')
}

export function stripSectionLabel(raw: string): string {
  return raw.replace(/^\s*[a-z][a-z ]{0,24}?\s*(?:\([^)]*\)\s*)?:\s*(?=\S)/i, '')
}

function parseIngredient(ingredient: string): Parsed | null {
  const lower = ingredient.toLowerCase().trim()
  const qtyMatch = lower.match(
    new RegExp(`^(\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+\\s*[${UNICODE_FRACTION_CLASS}]|[${UNICODE_FRACTION_CLASS}]|\\d+(?:\\.\\d+)?)\\s*`),
  )
  if (!qtyMatch) return null
  const value = parseQuantity(qtyMatch[1])
  if (value == null) return null
  let rest = lower.slice(qtyMatch[0].length).trim()
  let unit: string | null = null
  const firstWord = rest.match(/^([a-z]+)\.?\s+/)
  if (firstWord) {
    const base = UNIT_TO_BASE[firstWord[1]]
    if (base) {
      unit = base
      rest = rest.slice(firstWord[0].length).trim()
    }
  }
  const splitIdx = rest.search(/[,—]/)
  let noun = (splitIdx >= 0 ? rest.slice(0, splitIdx) : rest).trim()
  noun = noun.replace(/\s*\(.*?\)\s*$/, '').trim()
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
  const FRAC_MAP: Record<string, string> = { '0.25': '1/4', '0.50': '1/2', '0.33': '1/3', '0.67': '2/3', '0.75': '3/4' }
  const frac = (n - Math.floor(n)).toFixed(2)
  if (FRAC_MAP[frac]) {
    const whole = Math.floor(n)
    return whole === 0 ? FRAC_MAP[frac] : `${whole} ${FRAC_MAP[frac]}`
  }
  return n.toFixed(2).replace(/\.?0+$/, '')
}

function pluralizeUnit(unit: string, count: number): string {
  if (count <= 1) return unit
  const NO_PLURAL = new Set(['g', 'kg', 'ml', 'l', 'oz', 'lb', 'tbsp', 'tsp'])
  if (NO_PLURAL.has(unit)) return unit
  return unit + 's'
}

interface Accumulator {
  key: string
  category: GroceryCategory
  fromRecipeIds: string[]
  contributions: { raw: string; parsed: Parsed | null }[]
}

function renderText(acc: Accumulator): string {
  const allParsed = acc.contributions.every(c => c.parsed)
  if (allParsed && acc.contributions.length > 0) {
    const parts = acc.contributions.map(c => c.parsed!) as Parsed[]
    const unit = parts[0].unit
    if (parts.every(p => p.unit === unit)) {
      const total = parts.reduce((s, p) => s + p.value, 0)
      const noun = parts[0].noun
      if (unit) return `${formatNumber(total)} ${pluralizeUnit(unit, total)} ${noun}`.trim()
      const displayNoun = total === 1 ? noun : pluralizeNoun(noun)
      return `${formatNumber(total)} ${displayNoun}`.trim()
    }
  }
  return cleanDisplay(acc.contributions[0]?.raw ?? '')
}

export interface WindowEntry { dayOfWeek: number; recipeId?: string | null; leftoverFrom?: string | null }
export interface ShelfRecipe { id: string; title?: string; ingredients: string[] }

/** consolidateIngredients(plan, recipes), on the entries alone. */
export function consolidateIngredients(entries: WindowEntry[], recipes: ShelfRecipe[]): ConsolidatedIngredient[] {
  const recipesById = new Map(recipes.map(r => [r.id, r]))
  const byKey = new Map<string, Accumulator>()
  const seen = new Set<string>()
  const unique: ShelfRecipe[] = []
  for (const entry of entries) {
    if (entry.leftoverFrom) continue
    const recipe = entry.recipeId ? recipesById.get(entry.recipeId) : undefined
    if (!recipe || seen.has(recipe.id)) continue
    seen.add(recipe.id)
    unique.push(recipe)
  }
  for (const recipe of unique) {
    for (const line of recipe.ingredients) {
      const ingredient = stripSectionLabel(line)
      const parsed = parseIngredient(ingredient)
      const key = canonicalKey(ingredient)
      if (!key) continue
      const existing = byKey.get(key)
      if (existing) {
        existing.contributions.push({ raw: ingredient, parsed })
        if (!existing.fromRecipeIds.includes(recipe.id)) existing.fromRecipeIds.push(recipe.id)
      } else {
        byKey.set(key, { key, category: categorizeIngredient(ingredient), fromRecipeIds: [recipe.id], contributions: [{ raw: ingredient, parsed }] })
      }
    }
  }
  return Array.from(byKey.values()).map(acc => ({ text: renderText(acc), category: acc.category, fromRecipeIds: acc.fromRecipeIds, key: acc.key }))
}

// ── src/lib/mealGroceries.ts ──
export interface MealGroceryLine { id: string; ingredientKey: string; recipeIds: string[]; text: string; listItemId: string | null; skipped: boolean }
export interface GroceryListItem { id: string; text: string; completed: boolean }
export type MealGroceryStep =
  | { kind: 'add'; item: ConsolidatedIngredient; lineId?: string }
  | { kind: 'skip'; item: ConsolidatedIngredient }
  | { kind: 'link'; item: ConsolidatedIngredient; listItemId: string }
  | { kind: 'drop'; line: MealGroceryLine; checkOffItemId: string | null }
  | { kind: 'update'; line: MealGroceryLine; item: ConsolidatedIngredient; rewriteItemId: string | null }

export function alreadyListed(item: ConsolidatedIngredient, openTexts: string[]): boolean {
  const key = item.text.toLowerCase()
  return openTexts.some(t => {
    const it = t.toLowerCase()
    return it.includes(key) || key.includes(it)
  })
}

function builtEarlier(item: ConsolidatedIngredient, items: GroceryListItem[], linked: Set<string>): GroceryListItem | undefined {
  const text = item.text.trim()
  return items.find(i => !i.completed && !linked.has(i.id) && i.text.trim() === text)
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every(x => s.has(x))
}

export function syncSteps(needed: ConsolidatedIngredient[], lines: MealGroceryLine[], items: GroceryListItem[]): MealGroceryStep[] {
  if (lines.length === 0) return []
  const steps: MealGroceryStep[] = []
  const lineByKey = new Map(lines.map(l => [l.ingredientKey, l]))
  const itemById = new Map(items.map(i => [i.id, i]))
  const openTexts = items.filter(i => !i.completed).map(i => i.text)
  const linked = new Set(lines.flatMap(l => (l.listItemId ? [l.listItemId] : [])))
  const neededKeys = new Set<string>()
  for (const item of needed) {
    if (!item.key) continue
    neededKeys.add(item.key)
    const line = lineByKey.get(item.key)
    if (!line) {
      const earlier = builtEarlier(item, items, linked)
      if (earlier) {
        linked.add(earlier.id)
        steps.push({ kind: 'link', item, listItemId: earlier.id })
      } else {
        steps.push(isStaple(item) || alreadyListed(item, openTexts) ? { kind: 'skip', item } : { kind: 'add', item })
      }
      continue
    }
    if (line.text === item.text && sameSet(line.recipeIds, item.fromRecipeIds)) continue
    const listed = line.listItemId ? itemById.get(line.listItemId) : undefined
    const rewrite = listed && !listed.completed && listed.text === line.text && line.text !== item.text
    steps.push({ kind: 'update', line, item, rewriteItemId: rewrite ? listed.id : null })
  }
  for (const line of lines) {
    if (neededKeys.has(line.ingredientKey)) continue
    const listed = line.listItemId ? itemById.get(line.listItemId) : undefined
    steps.push({ kind: 'drop', line, checkOffItemId: listed && !listed.completed ? listed.id : null })
  }
  return steps
}

// ══════════════════════════════ Groceries ══════════════════════════════
// The Groceries list is the Apple Reminders "Groceries" list (useGroceryStatus
// finds it by external_source/external_id). Lists, list_items and
// meal_grocery_lines are owner-only, so this is the caller's own list.
//
// A "window" is the Meals page's 7 days from the household's week start
// (meal_grocery_lines.week_start is that first day, e.g. a Saturday); meals
// are stored under the Sunday week of their date (src/lib/mealWeek.ts).

const GROCERIES_LIST = 'Groceries'
/** Said when there is no synced Groceries list. On 2026-11-11 the bare "no
 * Groceries list" led the assistant to offer to create one; a list made here
 * is a plain list that meals never update, so it must not offer that. */
export const NO_GROCERIES_LIST = 'no Groceries list. Meals update only the Apple Reminders list named Groceries (synced from the Mac). A list made in Symphony will not follow the meal plan, so do not offer to create one; say the ingredients can go on the list once Reminders is connected, or list them in the reply.'

async function groceriesList(db: Db): Promise<string | null> {
  const { data, error } = await db.from('lists').select('id')
    .eq('external_source', 'apple_reminders').eq('external_id', GROCERIES_LIST).maybeSingle()
  if (error) throw error
  return (data?.id as string | undefined) ?? null
}

/** The first days of built windows that hold `date`, newest first. */
async function builtWindowsHolding(db: Db, listId: string, date: string): Promise<string[]> {
  const { data, error } = await db.from('meal_grocery_lines').select('week_start')
    .eq('list_id', listId).gte('week_start', addDays(date, -6)).lte('week_start', date)
  if (error) throw error
  return [...new Set(((data ?? []) as { week_start: string }[]).map((r) => String(r.week_start).slice(0, 10)))].sort().reverse()
}

const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)

/** weekHelpers.activeDayRange against the window's first day. */
export function activeDayRange(windowStart: string, startsOn: string | null, endsOn: string | null): { firstDay: number; lastDay: number } {
  const idx = (iso: string) => Math.min(6, Math.max(0, dayDiff(windowStart, iso.slice(0, 10))))
  const firstDay = startsOn ? idx(startsOn) : 0
  const lastDay = endsOn ? idx(endsOn) : 6
  return lastDay < firstDay ? { firstDay, lastDay: firstDay } : { firstDay, lastDay }
}

interface PlanRow { id: string; week_start: string; starts_on?: string | null; ends_on?: string | null; created_at: string }

/** What a window's meals need, as useMealPlan + useGroceryStatus compute it.
 *  `resolved` false: a meal's recipe could not be read, and syncing would
 *  check off its ingredients (useGroceryStatus.recipesResolved). */
export async function windowNeeds(db: Db, windowStart: string): Promise<{ needed: ConsolidatedIngredient[]; resolved: boolean; recipes: ShelfRecipe[] }> {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(windowStart, i))
  const weeks = [...new Set(dates.map((d) => weekOf(d).weekStart))]
  const anchor = weekOf(dates[3]).weekStart
  const { data: planRows, error: planErr } = await db.from('meal_plans').select('id, week_start, starts_on, ends_on, created_at')
    .in('week_start', weeks).order('created_at', { ascending: true })
  if (planErr) throw planErr
  const plans = new Map<string, PlanRow>()
  for (const p of (planRows ?? []) as PlanRow[]) {
    const key = String(p.week_start).slice(0, 10)
    if (!plans.has(key)) plans.set(key, p)
  }
  const weekOfPlan = new Map([...plans].map(([week, p]) => [p.id, week]))
  let entries: WindowEntry[] = []
  if (plans.size) {
    const { data, error } = await db.from('meal_plan_entries').select('id, meal_plan_id, day_of_week, recipe_id, leftover_from')
      .in('meal_plan_id', [...weekOfPlan.keys()]).order('day_of_week', { ascending: true })
    if (error) throw error
    entries = ((data ?? []) as { meal_plan_id: string; day_of_week: number; recipe_id: string | null; leftover_from: string | null }[])
      .flatMap((e) => {
        const week = weekOfPlan.get(e.meal_plan_id)
        if (!week) return []
        const position = dayDiff(windowStart, addDays(week, e.day_of_week))
        return position >= 0 && position < 7 ? [{ dayOfWeek: position, recipeId: e.recipe_id, leftoverFrom: e.leftover_from }] : []
      })
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
  }
  const recipeIds = [...new Set(entries.flatMap((e) => (e.recipeId ? [e.recipeId] : [])))]
  let recipes: ShelfRecipe[] = []
  if (recipeIds.length) {
    const { data, error } = await db.from('recipes').select('id, title, ingredients').in('id', recipeIds)
    if (error) throw error
    recipes = ((data ?? []) as { id: string; title: string; ingredients: unknown }[]).map((r) => ({
      id: r.id, title: r.title,
      ingredients: Array.isArray(r.ingredients) ? r.ingredients.filter((x): x is string => typeof x === 'string') : [],
    }))
  }
  const have = new Set(recipes.map((r) => r.id))
  const resolved = entries.every((e) => e.leftoverFrom || !e.recipeId || have.has(e.recipeId))
  const anchorPlan = plans.get(anchor)
  const { firstDay, lastDay } = activeDayRange(windowStart, anchorPlan?.starts_on ?? null, anchorPlan?.ends_on ?? null)
  const active = entries.filter((e) => e.dayOfWeek >= firstDay && e.dayOfWeek <= lastDay)
  return { needed: consolidateIngredients(active, recipes), resolved, recipes }
}

interface LineRow { id: string; ingredient_key: string; recipe_ids: string[] | null; text: string; list_item_id: string | null; skipped: boolean }
const toLine = (r: LineRow): MealGroceryLine => ({ id: r.id, ingredientKey: r.ingredient_key, recipeIds: r.recipe_ids ?? [], text: r.text, listItemId: r.list_item_id, skipped: r.skipped })

/** useGroceryStatus.loadWeek: the list's open items and the window's lines, fresh. */
async function loadWeek(db: Db, listId: string, windowStart: string): Promise<{ items: GroceryListItem[]; lines: MealGroceryLine[] }> {
  const { data: items, error: itemsErr } = await db.from('list_items').select('id,text,completed').eq('list_id', listId).eq('completed', false)
  if (itemsErr) throw itemsErr
  const { data: lineRows, error: linesErr } = await db.from('meal_grocery_lines')
    .select('id,ingredient_key,recipe_ids,text,list_item_id,skipped').eq('list_id', listId).eq('week_start', windowStart)
  if (linesErr) throw linesErr
  return {
    items: ((items ?? []) as GroceryListItem[]).map((i) => ({ id: i.id, text: i.text, completed: false })),
    lines: ((lineRows ?? []) as LineRow[]).map(toLine),
  }
}

/** useGroceryStatus.applySteps, on the caller's client. First error, or null. */
export async function applySteps(db: Db, steps: MealGroceryStep[], ctx: { listId: string; weekStart: string; userId: string }, now = () => new Date().toISOString()): Promise<string | null> {
  let firstError: string | null = null
  const note = (e: { message: string } | null | undefined) => { if (e && !firstError) firstError = e.message }
  const lineRow = (item: ConsolidatedIngredient, skipped: boolean) => ({
    user_id: ctx.userId, list_id: ctx.listId, week_start: ctx.weekStart,
    ingredient_key: item.key, recipe_ids: item.fromRecipeIds, text: item.text, skipped,
  })
  const onConflict = { onConflict: 'list_id,week_start,ingredient_key', ignoreDuplicates: true }
  const newItem = async (text: string, sortOrder: number) => {
    const { data, error } = await db.from('list_items')
      .insert({ list_id: ctx.listId, user_id: ctx.userId, text, sort_order: sortOrder, completed: false })
      .select('id').single()
    note(error)
    return (data as { id: string } | null)?.id ?? null
  }
  for (const [index, step] of steps.entries()) {
    switch (step.kind) {
      case 'add': {
        let lineId = step.lineId ?? null
        if (!lineId) {
          const { data, error } = await db.from('meal_grocery_lines').upsert(lineRow(step.item, false), onConflict).select('id')
          note(error)
          lineId = (data as { id: string }[] | null)?.[0]?.id ?? null
          if (!lineId) break // the Meals page got there first
        }
        const itemId = await newItem(step.item.text, index)
        if (!itemId) break
        const { error } = await db.from('meal_grocery_lines')
          .update({ list_item_id: itemId, skipped: false, text: step.item.text, recipe_ids: step.item.fromRecipeIds }).eq('id', lineId)
        note(error)
        break
      }
      case 'link': {
        const { error } = await db.from('meal_grocery_lines').upsert({ ...lineRow(step.item, false), list_item_id: step.listItemId }, onConflict)
        note(error)
        break
      }
      case 'skip': {
        const { error } = await db.from('meal_grocery_lines').upsert(lineRow(step.item, true), onConflict)
        note(error)
        break
      }
      case 'drop': {
        if (step.checkOffItemId) {
          const at = now()
          const { error } = await db.from('list_items').update({ completed: true, completed_at: at }).eq('id', step.checkOffItemId).eq('completed', false)
          note(error)
        }
        const { error } = await db.from('meal_grocery_lines').delete().eq('id', step.line.id)
        note(error)
        break
      }
      case 'update': {
        if (step.rewriteItemId) {
          const { error } = await db.from('list_items').update({ text: step.item.text })
            .eq('id', step.rewriteItemId).eq('text', step.line.text).eq('completed', false)
          note(error)
        }
        const { error } = await db.from('meal_grocery_lines').update({ text: step.item.text, recipe_ids: step.item.fromRecipeIds }).eq('id', step.line.id)
        note(error)
        break
      }
    }
  }
  return firstError
}

export interface GrocerySync {
  /** False when nothing was synced; `reason` says why. */
  synced: boolean
  reason?: string
  /** Window first days that were brought in step. */
  windows: string[]
  added: string[]
  checked_off: string[]
  rewritten: string[]
  error?: string
}

/**
 * After a meal on `date` changes (symphony_set_meal), do what the Meals page
 * does when its plan changes: bring every built shopping window holding that
 * date in step with its meals (new ingredients on, ones no meal needs checked
 * off if unbought, changed amounts rewritten unless edited by hand). A window
 * never built ("Build shopping list" not run) is left alone, as in the app.
 * Never throws: a grocery failure must not undo or hide the meal change.
 */
export async function syncGroceriesForDate(db: Db, userId: string, date: string, now?: () => string): Promise<GrocerySync> {
  const out: GrocerySync = { synced: false, windows: [], added: [], checked_off: [], rewritten: [] }
  try {
    const listId = await groceriesList(db)
    if (!listId) return { ...out, reason: NO_GROCERIES_LIST }
    const windows = await builtWindowsHolding(db, listId, date)
    if (!windows.length) return { ...out, reason: 'shopping list not built for this week' }
    for (const windowStart of windows) {
      const { needed, resolved } = await windowNeeds(db, windowStart)
      if (!resolved) { out.reason = 'a meal\'s recipe could not be read; groceries left as they were'; continue }
      const week = await loadWeek(db, listId, windowStart)
      if (!week.lines.length) continue
      const steps = syncSteps(needed, week.lines, week.items)
      const err = await applySteps(db, steps, { listId, weekStart: windowStart, userId }, now)
      out.windows.push(windowStart)
      for (const s of steps) {
        if (s.kind === 'add') out.added.push(s.item.text)
        else if (s.kind === 'drop' && s.checkOffItemId) out.checked_off.push(s.line.text)
        else if (s.kind === 'update' && s.rewriteItemId) out.rewritten.push(s.item.text)
      }
      if (err && !out.error) out.error = err
    }
    out.synced = out.windows.length > 0
    return out
  } catch (e) {
    return { ...out, error: errText(e) }
  }
}

export const READ_GROCERIES_TOOL = {
  name: 'symphony_read_groceries',
  description: "What's on the Groceries list to buy, and which recipe in the meal plan each line came from. Lines with no recipe were added by hand. 'Not added' are ingredients the week's meals need that were left off (staples to check, or already covered). date picks the week (YYYY-MM-DD, \"today\" or \"tomorrow\"; default today).",
  input_schema: {
    type: 'object',
    properties: { date: { type: 'string', description: 'Any day in the week; default today' } },
  },
}

export async function readGroceries(db: Db, input: Record<string, unknown>, ctx: HouseholdCtx): Promise<string> {
  try {
    const date = resolveDate(input.date, ctx.today)
    if (!date) return 'Error: date must be YYYY-MM-DD, "today" or "tomorrow"'
    const listId = await groceriesList(db)
    if (!listId) return JSON.stringify({ list: null, note: `No Groceries list yet: ${NO_GROCERIES_LIST}` })
    const windowStart = (await builtWindowsHolding(db, listId, date))[0] ?? null
    const { data: items, error } = await db.from('list_items').select('id, text, sort_order')
      .eq('list_id', listId).eq('completed', false).order('sort_order', { ascending: true, nullsFirst: false }).limit(300)
    if (error) throw error
    let lineRows: LineRow[] = []
    if (windowStart) {
      const res = await db.from('meal_grocery_lines').select('id,ingredient_key,recipe_ids,text,list_item_id,skipped')
        .eq('list_id', listId).eq('week_start', windowStart)
      if (res.error) throw res.error
      lineRows = (res.data ?? []) as LineRow[]
    }
    const recipeIds = [...new Set(lineRows.flatMap((l) => l.recipe_ids ?? []))]
    const titles = new Map<string, string>()
    if (recipeIds.length) {
      const res = await db.from('recipes').select('id, title').in('id', recipeIds)
      if (res.error) throw res.error
      for (const r of (res.data ?? []) as { id: string; title: string }[]) titles.set(r.id, r.title)
    }
    const names = (ids: string[] | null) => (ids ?? []).map((id) => titles.get(id) ?? 'a recipe no longer on the shelf')
    const byItem = new Map(lineRows.filter((l) => l.list_item_id).map((l) => [l.list_item_id as string, l]))
    return JSON.stringify({
      list_id: listId,
      week_start: windowStart,
      ...(windowStart ? {} : { note: 'The shopping list has not been built from this week\'s meals, so lines have no recipe.' }),
      to_buy: ((items ?? []) as { id: string; text: string }[]).map((i) => {
        const line = byItem.get(i.id)
        return { id: i.id, text: i.text, from_recipes: line ? names(line.recipe_ids) : [] }
      }),
      not_added: lineRows.filter((l) => l.skipped || !l.list_item_id)
        .map((l) => ({ text: l.text, from_recipes: names(l.recipe_ids) })),
    }, null, 2)
  } catch (e) { return fail(e) }
}

// ═══════════════════════════════ School ═══════════════════════════════
// Kept digests are readable by an adult who may review school mail (the
// school_digests_read policy); the rest get none, and this says so. Papers and
// homework are family tasks, read as the kitchen wall reads them.

export const READ_SCHOOL_DIGEST_TOOL = {
  name: 'symphony_read_school_digest',
  description: "The latest school digest (the 5pm email of school and parent-group messages, as kept in Symphony: per source, what to do, good to know, and the rest), plus the open school papers (forms and slips to send back, and who has each) and open homework. Use for \"what did school send\", \"any forms to sign\", \"what homework is open\". Read-only. days: how many of the latest days' digests (default 1, at most 7).",
  input_schema: {
    type: 'object',
    properties: { days: { type: 'number', description: '1 to 7; default 1' } },
  },
}

interface SchoolTaskRow {
  id: string; title: string; category: string; assigned_to: string | null; assigned_to_all: string[] | null
  held_by: string | null; needed_on: string | null; scheduled_for: string | null; notes: string | null; created_at: string
}

const SCHOOL_TASK_COLUMNS = 'id, title, category, assigned_to, assigned_to_all, held_by, needed_on, scheduled_for, notes, created_at'

export async function readSchoolDigest(db: Db, input: Record<string, unknown>, _ctx?: HouseholdCtx): Promise<string> {
  try {
    const days = Math.min(7, Math.max(1, Math.round(Number(input.days)) || 1))
    const [digestRes, papersRes, homeworkRes, membersRes] = await Promise.all([
      // useSchoolDigests: newest first, then one a day.
      db.from('school_digests').select('id, digest_date, date_label, sections, to_do_count, created_at')
        .order('created_at', { ascending: false }).limit(45),
      // useWallData query 17, open ones only: "not ours" (dismissed_at) never comes back.
      db.from('tasks').select(SCHOOL_TASK_COLUMNS)
        .eq('context', 'family').eq('category', 'paper').eq('completed', false).is('dismissed_at', null)
        .order('created_at', { ascending: true }),
      // useWallData query 15: open homework, any date.
      db.from('tasks').select(SCHOOL_TASK_COLUMNS)
        .eq('context', 'family').eq('category', 'homework').eq('completed', false).is('dismissed_at', null)
        .order('created_at', { ascending: true }),
      db.from('family_members').select('id, name'),
    ])
    if (digestRes.error) throw digestRes.error
    if (papersRes.error) throw papersRes.error
    if (homeworkRes.error) throw homeworkRes.error
    const memberName = new Map(((membersRes.data ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name]))
    const who = (id: string | null) => (id ? memberName.get(id) ?? null : null)

    const seen = new Set<string>()
    const digests = ((digestRes.data ?? []) as { id: string; digest_date: string; date_label: string; sections: unknown; to_do_count: number | null }[])
      .filter((d) => (seen.has(d.digest_date) ? false : (seen.add(d.digest_date), true)))
      .slice(0, days)
      .map((d) => {
        const { sections } = parseDigestResponse(JSON.stringify({ sections: d.sections }))
        return {
          date: d.digest_date, label: d.date_label,
          to_do_count: d.to_do_count ?? sections.reduce((n: number, s: DigestSection) => n + s.toDo.length, 0),
          sections,
        }
      })
    const task = (t: SchoolTaskRow) => ({
      id: t.id, title: t.title,
      for: [...new Set([t.assigned_to, ...(t.assigned_to_all ?? [])].flatMap((id) => (who(id) ? [who(id)!] : [])))],
      ...(t.needed_on ? { needed_on: t.needed_on } : {}),
      ...(t.scheduled_for ? { scheduled_for: t.scheduled_for } : {}),
      ...(t.notes ? { notes: t.notes.slice(0, 500) } : {}),
    })
    return JSON.stringify({
      digests,
      ...(digests.length ? {} : { note: 'No kept school digest this person can read.' }),
      papers: ((papersRes.data ?? []) as SchoolTaskRow[]).map((t) => ({ ...task(t), held_by: who(t.held_by) })),
      homework: ((homeworkRes.data ?? []) as SchoolTaskRow[]).map(task),
    }, null, 2)
  } catch (e) { return fail(e) }
}

// ═════════════════════════════ Life areas ═════════════════════════════
// goal_areas, as useLifeAreas (Guide → Areas) reads and writes them: your own
// areas plus a partner's Family areas (read-only, `mine: false`). Writes are
// owner-only; there is no delete here.

const AREA_CONTEXTS = ['work', 'family', 'personal'] as const

export const LIST_LIFE_AREAS_TOOL = {
  name: 'symphony_list_life_areas',
  description: "The person's life areas (Health, Money, Fun…), each in a space (work, family or personal), in their order. mine false: a partner's Family area, which only its owner can change.",
  input_schema: { type: 'object', properties: {} },
}

export const SAVE_LIFE_AREA_TOOL = {
  name: 'symphony_save_life_area',
  description: "Create a life area, or rename one or move it to another space. Without id: creates (name required; context defaults to personal, which stays private). With id: changes the name and/or context of one of the person's own areas. Areas are never deleted here.",
  input_schema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'An existing area to change; omit to create' },
      name: { type: 'string' },
      context: { type: 'string', enum: [...AREA_CONTEXTS] },
    },
  },
}

interface AreaRow { id: string; user_id: string; name: string; context: string | null; sort_order: number | null }
const AREA_COLUMNS = 'id, user_id, name, context, sort_order'
const toArea = (r: AreaRow, userId: string) => ({
  id: r.id, name: r.name,
  context: r.context && (AREA_CONTEXTS as readonly string[]).includes(r.context) ? r.context : null,
  mine: r.user_id === userId,
  sort_order: r.sort_order ?? 0,
})

export async function listLifeAreas(db: Db, _input: Record<string, unknown>, ctx: HouseholdCtx): Promise<string> {
  try {
    const { data, error } = await db.from('goal_areas').select(AREA_COLUMNS).order('sort_order')
    if (error) throw error
    return JSON.stringify(((data ?? []) as AreaRow[]).map((r) => toArea(r, ctx.userId)), null, 2)
  } catch (e) { return fail(e) }
}

export async function saveLifeArea(db: Db, input: Record<string, unknown>, ctx: HouseholdCtx): Promise<string> {
  try {
    const id = str(input.id, 64)
    const name = str(input.name, 100)
    const rawContext = input.context
    if (rawContext !== undefined && rawContext !== null && !(AREA_CONTEXTS as readonly unknown[]).includes(rawContext)) {
      return 'Error: context must be work, family or personal'
    }
    const context = (rawContext ?? null) as string | null

    if (id) {
      const fields: Record<string, string> = {}
      if (name) fields.name = name
      if (context) fields.context = context
      if (!Object.keys(fields).length) return 'Error: give a new name or context'
      // useLifeAreas.patch: only the owner's row (a partner's Family area is read-only).
      const { data, error } = await db.from('goal_areas').update(fields).eq('id', id).eq('user_id', ctx.userId).select(AREA_COLUMNS)
      if (error) throw error
      const row = (data ?? [])[0] as AreaRow | undefined
      if (!row) return 'Error: no area of yours with that id (a partner\'s Family area can only be changed by its owner)'
      return JSON.stringify(toArea(row, ctx.userId), null, 2)
    }

    if (!name) return 'Error: name is required to create an area'
    const { data: own, error: ownErr } = await db.from('goal_areas').select(AREA_COLUMNS).eq('user_id', ctx.userId)
    if (ownErr) throw ownErr
    const mine = (own ?? []) as AreaRow[]
    const same = mine.find((a) => a.name.trim().toLowerCase() === name.toLowerCase())
    if (same) return JSON.stringify({ ...toArea(same, ctx.userId), already_exists: true }, null, 2)
    // useLifeAreas.add: after the last of your own.
    const sortOrder = mine.reduce((m, a) => Math.max(m, (a.sort_order ?? 0) + 1), 0)
    const row = { user_id: ctx.userId, name, context: context ?? 'personal', sort_order: sortOrder, ...(ctx.stableId ? { id: ctx.stableId } : {}) }
    const { data, error } = await db.from('goal_areas').insert(row).select(AREA_COLUMNS).single()
    if (error?.code === '23505' && ctx.stableId) {
      const again = await db.from('goal_areas').select(AREA_COLUMNS).eq('id', ctx.stableId).maybeSingle()
      if (again.data) return JSON.stringify({ ...toArea(again.data as AreaRow, ctx.userId), already_saved: true }, null, 2)
    }
    if (error) throw error
    return JSON.stringify(toArea(data as AreaRow, ctx.userId), null, 2)
  } catch (e) { return fail(e) }
}

// ═════════════════════════════ Wiring ═════════════════════════════

export const HOUSEHOLD_TOOLS = [
  LIST_RECIPES_TOOL, GET_RECIPE_TOOL, CREATE_RECIPE_TOOL,
  READ_GROCERIES_TOOL, READ_SCHOOL_DIGEST_TOOL,
  LIST_LIFE_AREAS_TOOL, SAVE_LIFE_AREA_TOOL,
]

/** For canvasEvents.CANVAS_WRITE_TOOLS. */
export const HOUSEHOLD_WRITE_TOOLS = ['symphony_create_recipe', 'symphony_save_life_area'] as const
/** For canvasEvents.IDEMPOTENT_CREATES (both take ctx.stableId on insert). */
export const HOUSEHOLD_IDEMPOTENT_CREATES = ['symphony_create_recipe', 'symphony_save_life_area'] as const

const EXECUTORS: Record<string, (db: Db, input: Record<string, unknown>, ctx: HouseholdCtx) => Promise<string>> = {
  symphony_list_recipes: listRecipes,
  symphony_get_recipe: getRecipe,
  symphony_create_recipe: createRecipe,
  symphony_read_groceries: readGroceries,
  symphony_read_school_digest: readSchoolDigest,
  symphony_list_life_areas: listLifeAreas,
  symphony_save_life_area: saveLifeArea,
}

/** The result of a household tool, or null when `name` is not one. */
export function runHouseholdTool(name: string, db: Db, input: Record<string, unknown>, ctx: HouseholdCtx): Promise<string> | null {
  const run = EXECUTORS[name]
  return run ? run(db, input ?? {}, ctx) : null
}
