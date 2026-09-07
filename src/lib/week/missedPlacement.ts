// A placement is spent when its day ends.
//
// Scott, 2026-09-07: "we also need to decide what happens with items that are
// not marked as completed on their assigned day." The decision: the day
// passes, the commitment doesn't. The card stops being a placement and comes
// back to this week's list (poolViews.unscheduledPool), while the grid keeps
// drawing it on the day it didn't happen — quietly, so a week you look back
// at tells the truth. Nothing is rewritten and nothing re-places itself:
// where the card goes next is a person's decision.
//
// This is deliberately stricter than Today's GRACE_DAYS window (taskPools.ts).
// They answer different questions: grace decides what still earns a slot on
// TODAY, this decides when a day stops holding a card you gave it.

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Was this card given a day that has since passed, and never ticked? */
export function isMissedPlacement(
  scheduledFor: Date | null | undefined,
  completed: boolean,
  now: Date,
): boolean {
  if (!scheduledFor || completed) return false
  return startOfDay(scheduledFor).getTime() < startOfDay(now).getTime()
}

/** The line the card carries in the list. Says the day, never a count. */
export function missedLabel(scheduledFor: Date, now: Date): string {
  const days = Math.round(
    (startOfDay(now).getTime() - startOfDay(scheduledFor).getTime()) / 86_400_000,
  )
  const when = days < 7
    ? scheduledFor.toLocaleDateString('en-US', { weekday: 'short' })
    : scheduledFor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `Didn't happen · ${when}`
}
