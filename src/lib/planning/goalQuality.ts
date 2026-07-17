// Deterministic goal-quality heuristic (no network, no model). Mirrors the
// guided flow's coaching: a sharp goal reads as a past-tense outcome with a
// finish line. We only surface a gentle, dismissible hint on goals that read
// clearly vague — see docs/superpowers/specs/2026-07-17-goal-quality-coaching-design.md.

// A handful of common irregular past-tense / outcome verbs. Regular past tense
// (-ed) is caught by the suffix test below, so this list is only the irregulars
// that plausibly end a goal ("Ran a marathon", "Wrote the book").
const IRREGULAR_PAST = new Set([
  'ran', 'wrote', 'sold', 'lost', 'built', 'made', 'won', 'took', 'kept',
  'held', 'met', 'felt', 'left', 'sent', 'became', 'grew', 'ran', 'read',
  'paid', 'quit', 'hit', 'set', 'put', 'cut', 'led', 'got',
])

function hasPastTenseVerb(words: string[]): boolean {
  return words.some((w) => {
    const lower = w.toLowerCase().replace(/[^a-z]/g, '')
    if (lower.length < 3) return false
    if (/[a-z]{2,}ed$/.test(lower)) return true // regular past tense (shipped, renovated)
    return IRREGULAR_PAST.has(lower)
  })
}

/**
 * True when a goal name reads clearly vague — no past-tense outcome verb, no
 * number, and short enough that we're confident (a longer, considered goal is
 * never nagged). Conservative by design: past-tense detection errs toward NOT
 * flagging.
 */
export function looksVague(name: string): boolean {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return false
  if (words.length > 6) return false
  if (/\d/.test(name)) return false
  if (hasPastTenseVerb(words)) return false
  return true
}
