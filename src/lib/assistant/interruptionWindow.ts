// When the assistant is allowed to interrupt unasked.
//
// DELIBERATELY SEPARATE from lib/quietHours.ts. That module is a Supabase-egress
// cost guard (its own header explains it stopped ~540 REST req/hour at 3am);
// its consumers are pollers, and widening it into a do-not-disturb policy would
// change wall refresh behavior as a side effect and risk re-opening the egress
// problem. They may share a similar window; they are not the same concept.

export const INTERRUPT_START_HOUR = 7 // 07:00, inclusive
export const INTERRUPT_END_HOUR = 21 // 21:00, exclusive

/** True when unprompted delivery is permitted for surfaces that respect the window. */
export function inInterruptionWindow(now: Date = new Date()): boolean {
  const h = now.getHours()
  return h >= INTERRUPT_START_HOUR && h < INTERRUPT_END_HOUR
}
