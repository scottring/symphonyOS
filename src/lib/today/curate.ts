/**
 * Curation: choosing WHICH rows survive a cap, rather than just how many.
 *
 * `pageCap.capUnits` folds by position — it keeps the caller's first N units and
 * only sorts completed ones to the back. That's honest but blind: on a 24-row
 * day the item you most needed can be the one hidden behind "+9 more", purely
 * because of where it landed in the sort.
 *
 * This adds the missing step the audit called for: a relevance score feeding a
 * capUnits-shaped output. Two rules carried over deliberately:
 *
 *   - The cap never lies. `hiddenCount` is always exact and always shown.
 *   - Scoring decides only WHAT survives, never the order it reads in. The
 *     caller's ordering is preserved among survivors, so curation can't also
 *     silently reshuffle the day.
 *
 * Deterministic, like lib/assistant/urgency.ts — no model, and `now` is injected
 * so the whole table is fixture-testable. `proposeOrder.ts` sets the precedent
 * for refusing to rank without signal: an item with no signal scores 0 and keeps
 * its positional fate.
 */

export interface CuratableItem {
  completed: boolean
  startTime?: Date | null
  isSubtask?: boolean
  isWaiting?: boolean
  skipped?: boolean
}

export interface CuratedSection<T> {
  visible: T[]
  hiddenCount: number
}

/** A timed item within this many minutes is the most urgent thing on the page. */
const IMMINENT_MINUTES = 90

/**
 * Relevance for surviving a cap. Higher wins. Completed and skipped rows score
 * below zero so they're always the first to fold, matching pageCap's rule that
 * burying a to-do behind a done item inverts the point of the page.
 */
export function scoreCuratedItem(item: CuratableItem, now: Date): number {
  if (item.completed) return -20
  if (item.skipped) return -10

  let score = 0

  if (item.startTime) {
    const minutes = (item.startTime.getTime() - now.getTime()) / 60_000
    if (minutes < 0) score += 40 // already due and still open
    else if (minutes <= IMMINENT_MINUTES) score += 50
    else score += 10 // timed later today still beats an untimed pile
  }

  // A blocked item is real but not actionable right now, so it yields to
  // anything you could actually do. Deliberately a penalty, not a boost.
  if (item.isWaiting) score -= 5

  // Subtasks read as detail under their parent; a parent is the better survivor
  // when only one of them fits.
  if (item.isSubtask) score -= 3

  return score
}

/**
 * Cap a list containing GROUPS by relevance, never splitting a group.
 *
 * Mirrors `capUnits`' unit model exactly — Today renders a group as a parent row
 * plus its children, drawn as one card from adjacency, so the unit of folding is
 * the whole run. A unit scores as its best member: a group is worth keeping if
 * anything in it is.
 */
export function curateUnits<T extends CuratableItem>(
  items: T[],
  cap: number,
  expanded: boolean,
  startsUnit: (item: T, index: number) => boolean,
  now: Date = new Date(),
): CuratedSection<T> {
  if (expanded || cap <= 0 || items.length <= cap) {
    return { visible: items, hiddenCount: 0 }
  }

  const units: T[][] = []
  items.forEach((item, i) => {
    if (i === 0 || startsUnit(item, i)) units.push([item])
    else units[units.length - 1].push(item)
  })

  const scored = units.map((unit, i) => ({
    unit,
    i,
    score: Math.max(...unit.map((item) => scoreCuratedItem(item, now))),
  }))

  // Highest score first; original position breaks ties so the choice stays
  // stable and predictable rather than depending on sort implementation.
  scored.sort((a, b) => b.score - a.score || a.i - b.i)

  const kept = new Set<T[]>()
  let budget = cap
  for (const { unit } of scored) {
    if (unit.length > budget) continue
    kept.add(unit)
    budget -= unit.length
  }

  // Filter the ORIGINAL unit order, so scoring picked the survivors but the day
  // still reads top to bottom the way the caller built it.
  const visible = units.filter((u) => kept.has(u)).flat()
  return { visible, hiddenCount: items.length - visible.length }
}
