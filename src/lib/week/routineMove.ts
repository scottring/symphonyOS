// What a routine occurrence's drag onto another day writes (spec 2026-10-03
// §4–5). The repeating rule is never touched by a drag:
//   plan        a "Sometime this weekend" routine is given the day it lands on
//   replan      a Weekend-rule routine moved between its weekend's days: it is
//               planned on the new day and off the old one (a one-day
//               reschedule would leave the new day reading "not planned", and
//               it fell back into Sometime — final review, 2026-10-03)
//   reschedule  anything else: that one occurrence moves (#115's Move)
export type RoutineMoveKind = 'plan' | 'replan' | 'reschedule'

export function routineMoveKind(args: {
  patternType: string | undefined
  fromIso: string
  toIso: string
  /** The weekend's day keys (YYYY-MM-DD) in this week. */
  weekendKeys: string[]
  inSometime: boolean
}): RoutineMoveKind {
  if (args.inSometime) return 'plan'
  if (args.patternType === 'weekend' && args.weekendKeys.includes(args.fromIso) && args.weekendKeys.includes(args.toIso)) return 'replan'
  return 'reschedule'
}
