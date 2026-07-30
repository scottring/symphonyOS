// TWIN of src/lib/assistant/urgency.ts. Edge functions are Deno and cannot
// import from src/. Keep identical below this header — urgencyTwin.test.ts
// fails if the two disagree on any fixture. Same pattern as _shared/facets.ts.

// Deterministic urgency for the unprompted delivery tier.
//
// Rules, never the model. The engine already runs an LLM tier and it would be
// easy to ask it for a priority number, but model-assigned urgency is
// uncalibrated, drifts between runs, and can't be debugged when a suggestion
// shouts on a Tuesday for no reason. This follows the precedent in
// lib/today/proposeOrder.ts, which refuses to rank without signal.
//
// `confidence` answers "is this suggestion correct". `urgency` answers "does it
// matter now". Never blend them into one score: blending lets a 0.99-confidence
// trivial item outrank a genuinely late one and makes "why is this at the top"
// unanswerable.

/** Urgency at or above this bypasses budget, cooldown, and the DND window. */
export const CRITICAL_URGENCY = 90

/** Only an event starting within this many minutes reaches the critical band. */
const IMMINENT_EVENT_MINUTES = 90

/** Absolute inputs, as stored. */
export interface UrgencyInput {
  eventStartAt?: string | null
  dueAt?: string | null
  waitingSince?: string | null
  deferCount?: number | null
  cadenceDue?: { weeksLate: number } | null
}

/** Relative facts — no clock needed to score these. */
export interface UrgencyFacts {
  eventStartsInMinutes?: number | null
  daysOverdue?: number | null
  dueToday?: boolean
  waitingDays?: number | null
  deferCount?: number | null
  cadenceWeeksLate?: number | null
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

function wholeDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000)
}

/** Convert stored timestamps into clock-free relative facts. */
export function deriveUrgencyFacts(input: UrgencyInput, now: Date): UrgencyFacts {
  const facts: UrgencyFacts = {
    deferCount: input.deferCount ?? null,
    cadenceWeeksLate: input.cadenceDue ? input.cadenceDue.weeksLate : null,
    eventStartsInMinutes: null,
    daysOverdue: null,
    dueToday: false,
    waitingDays: null,
  }

  if (input.eventStartAt) {
    const start = new Date(input.eventStartAt)
    if (!Number.isNaN(start.getTime())) {
      facts.eventStartsInMinutes = Math.round((start.getTime() - now.getTime()) / 60_000)
    }
  }

  if (input.dueAt) {
    const due = new Date(input.dueAt)
    if (!Number.isNaN(due.getTime())) {
      const days = wholeDaysBetween(due, now)
      if (days > 0) facts.daysOverdue = days
      else if (days === 0) facts.dueToday = true
    }
  }

  if (input.waitingSince) {
    const since = new Date(input.waitingSince)
    if (!Number.isNaN(since.getTime())) {
      facts.waitingDays = Math.max(0, wholeDaysBetween(since, now))
    }
  }

  return facts
}

/**
 * MAX of time-pressure signals plus one weak modifier — never a running sum, so
 * no combination of signals can produce a runaway score.
 */
export function computeUrgency(facts: UrgencyFacts): number {
  const mins = facts.eventStartsInMinutes
  const imminent = mins != null && mins >= 0 && mins <= IMMINENT_EVENT_MINUTES

  const timePressure = Math.max(
    imminent ? 90 : 0,
    facts.daysOverdue != null && facts.daysOverdue >= 0
      ? Math.min(60 + facts.daysOverdue * 3, 85)
      : 0,
    facts.cadenceWeeksLate != null && facts.cadenceWeeksLate >= 0
      ? Math.min(50 + facts.cadenceWeeksLate * 10, 80)
      : 0,
    facts.dueToday ? 55 : 0,
    (facts.waitingDays ?? 0) >= 7 ? 45 : 0,
  )

  // Deliberately weak. Repeated deferral is ambiguous — it can mean "this keeps
  // mattering" or "I keep avoiding it" — and an avoidance signal must never
  // become a shouting signal.
  const modifier = (facts.deferCount ?? 0) >= 3 ? 5 : 0

  return clamp(timePressure + modifier, 0, 100)
}
