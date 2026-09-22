// src/lib/planning/hints.ts
//
// First-time hints — a short explanation of the two rules people trip on
// (guided planning, Phase 4). Shown once per person, dismissed for good; the
// same per-user localStorage pattern as `FIRST_WEEK_HIDE_KEY`
// (`src/lib/firstWeek.ts`), wrapped in try/catch so a private window or
// blocked site data degrades to "always shown", never a crash.

export const HINT_SEEN_KEY = (name: string, uid: string | null) => `symphony.hint.${name}.${uid ?? 'anon'}`

export function readHintSeen(name: string, uid: string | null): boolean {
  try {
    return localStorage.getItem(HINT_SEEN_KEY(name, uid)) === '1'
  } catch {
    return false
  }
}

export function markHintSeen(name: string, uid: string | null): void {
  try {
    localStorage.setItem(HINT_SEEN_KEY(name, uid), '1')
  } catch {
    // ignore — a hint that can't remember itself just keeps showing
  }
}
