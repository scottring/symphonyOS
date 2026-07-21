// src/lib/planning/outcomeCoach.ts
//
// Heuristic for season-bet phrasing: bets are outcomes ("Will drafted and
// signed"), not activities ("Start working on the will"). Activity phrasings
// stall — "start working on X" can be true for three quarters straight.
// Never blocks saving; callers show a quiet hint + optional AI rewrite.

const ACTIVITY_OPENERS = [
  /^start(\s+working)?(\s+on)?\b/i,
  /^continue\b/i,
  /^keep(\s+working)?(\s+on)?\b/i,
  /^work\s+on\b/i,
  /^make\s+progress\b/i,
  /^focus\s+on\b/i,
  /^plan\s+to\b/i,
  /^try\s+to\b/i,
  /^get\s+a\s+rough\b/i,
  /^look\s+into\b/i,
  /^think\s+about\b/i,
]

export function looksLikeActivity(title: string): boolean {
  const t = title.trim()
  if (!t) return false
  return ACTIVITY_OPENERS.some((re) => re.test(t))
}
