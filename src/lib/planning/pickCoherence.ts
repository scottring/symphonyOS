// Deterministic, no-network coherence signal for the goal-anchored picker.
// A pick "fits" its goal when their meaningful words overlap. This is a Phase-1
// stand-in for an AI coherence read; it only ever NUDGES, never blocks.

const STOP = new Set([
  'the','a','an','and','or','of','to','for','in','on','with','we','our','my','i',
  'set','up','get','make','do','have','been','followed','agreed','both','us','by',
  'that','this','into','how','actually','live','plan','plans','regular','regularly',
])

function words(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  )
}

export function pickFitsGoal(pickTitle: string, goalName: string): boolean {
  const p = words(pickTitle)
  const g = words(goalName)
  if (p.size === 0 || g.size === 0) return true // nothing to judge → don't nag
  for (const w of p) if (g.has(w)) return true
  return false
}

// Phase-1 limitation: keyword overlap is a coarse signal. Because semantic fit
// isn't lexical, this can nudge some correctly-placed picks (e.g. "Fix the back
// door" genuinely belongs to "Every room set up" but shares no words). The nudge
// is non-blocking by design; a real AI coherence read is the deferred version.
export function coherenceHint(pickTitle: string, goalName: string): string | null {
  if (pickFitsGoal(pickTitle, goalName)) return null
  return 'reads like it belongs elsewhere — re-parent?'
}

export function goalsInFocusNudge(goalIdsWithPicks: string[], threshold = 6): string | null {
  const n = new Set(goalIdsWithPicks).size
  if (n <= threshold) return null
  return `You're advancing ${n} goals this season — a full plate for a quarter. Anything that's really next season?`
}
