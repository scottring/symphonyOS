// src/lib/planDuplicates.ts
//
// "Is this line already on a list?" A page photographed a week after the last
// one repeats itself — the same errand written twice is one errand, and the
// review sheet offers to LINK the new row to the old task instead of adding a
// second copy. Pure and conservative: a near-match must be obvious, because a
// wrong link silently swallows a real line.

export interface ExistingTask {
  id: string
  title: string
  bucket?: string | null
  seasonStart?: Date | null
  monthStart?: Date | null
}

/** Words that carry no identity — "get the gutters" and "gutters" are one line. */
const STOP = new Set([
  'a', 'an', 'the', 'to', 'for', 'of', 'on', 'in', 'at', 'and', 'with',
  'get', 'go', 'do', 'up', 'out', 'my', 'our', 'some',
])

function words(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)),
  )
}

const norm = (s: string) => [...words(s)].join(' ')

/**
 * The open task a page line most likely repeats: Jaccard ≥ 0.6 over the
 * content words, or one normalised title contained in the other (only once
 * the shorter one is long enough that containment means something).
 * Null when nothing is close enough — the row is then simply added.
 */
export function findLikelyDuplicate(title: string, existing: ExistingTask[]): ExistingTask | null {
  const a = words(title)
  if (a.size === 0) return null
  const na = norm(title)

  let best: { task: ExistingTask; score: number } | null = null
  for (const task of existing) {
    const b = words(task.title)
    if (b.size === 0) continue
    const nb = norm(task.title)
    const contained = na.length >= 8 && nb.length >= 8 && (na.includes(nb) || nb.includes(na))
    let inter = 0
    for (const w of a) if (b.has(w)) inter++
    const jaccard = inter / (a.size + b.size - inter)
    const score = contained ? 1 : jaccard
    if (score >= 0.6 && (!best || score > best.score)) best = { task, score }
  }
  return best?.task ?? null
}
