//
// Finding a recipe from across the kitchen.
//
// Scott, 2026-09-07: recipes should be searchable from the wall, and picking
// one opens the big cooking view. 143 recipes is far past what browsing a grid
// can answer, so the wall needs real matching — but typing on a wall is
// expensive (every letter is a reach), so matching has to pay off in about
// three letters and never punish a near miss.
//
// Pure on purpose: the sheet renders, this decides.

export interface WallRecipe {
  id: string
  title: string
  tags: string[]
  lastCookedAt: Date | null
  prepMinutes: number | null
}

/** Lowercase, drop everything that isn't a letter or digit. "Sheet-pan" and
 *  "sheet pan" and "sheetpan" are the same reach at a wall. */
function squash(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '')
}

function words(s: string): string[] {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(Boolean)
}

/** Lower is better. null = no match at all. */
function rank(recipe: WallRecipe, q: string): number | null {
  const squashedQuery = squash(q)
  if (!squashedQuery) return 0
  const title = squash(recipe.title)
  if (title.startsWith(squashedQuery)) return 0
  if (words(recipe.title).some((w) => w.startsWith(squashedQuery))) return 1
  if (title.includes(squashedQuery)) return 2
  if (recipe.tags.some((t) => squash(t).startsWith(squashedQuery))) return 3
  return null
}

/**
 * The shelf, narrowed and ordered for the picker.
 *
 * With nothing typed the order is what you cook: most recently cooked first,
 * then everything else alphabetically — a stable shelf you can learn the shape
 * of, rather than one that reshuffles itself every night.
 */
export function searchRecipes(recipes: readonly WallRecipe[], query: string): WallRecipe[] {
  const scored: { r: WallRecipe; rank: number }[] = []
  for (const r of recipes) {
    const score = rank(r, query)
    if (score !== null) scored.push({ r, rank: score })
  }
  const byTitle = (a: WallRecipe, b: WallRecipe) => a.title.localeCompare(b.title)
  if (!squash(query)) {
    const cooked = scored.map((s) => s.r).filter((r) => r.lastCookedAt)
    const rest = scored.map((s) => s.r).filter((r) => !r.lastCookedAt)
    cooked.sort((a, b) => (b.lastCookedAt!.getTime() - a.lastCookedAt!.getTime()) || byTitle(a, b))
    rest.sort(byTitle)
    return [...cooked, ...rest]
  }
  return scored.sort((a, b) => a.rank - b.rank || byTitle(a.r, b.r)).map((s) => s.r)
}

export interface RecipePage<T> {
  items: T[]
  /** The page actually shown — clamped, so a stale page never blanks the grid. */
  page: number
  pages: number
}

/** One screenful. A wall pages; it does not scroll. */
export function pageOf<T>(items: readonly T[], page: number, perPage: number): RecipePage<T> {
  const pages = Math.max(1, Math.ceil(items.length / perPage))
  const clamped = Math.min(Math.max(0, page), pages - 1)
  return { items: items.slice(clamped * perPage, clamped * perPage + perPage), page: clamped, pages }
}
