/**
 * What needs attention, and why — Today's one bounded signal.
 *
 * Expiry (see `taskPools.ts`) gave DATED work a lifecycle: today, carried over,
 * slipped. Placed-but-undated work never had one. A task placed on a week that
 * passed, or captured to the inbox and forgotten, sat in a legitimate home that
 * no daily surface rendered — which is how three real tasks were believed lost
 * on 2026-08-04.
 *
 * This is the read-side answer, and it never writes. `week_start` is not
 * rolled forward and `scheduled_for` is not cleared: the stale value IS the age
 * signal, and a wrong filter is a one-line fix where a wrong migration against
 * the only copy of someone's life is not.
 *
 * Composed from the existing predicates rather than reimplementing them, so the
 * definitions cannot drift.
 */

import type { Task } from '@/types/task'
import { selectSlipped, daysBetween, type Match } from './taskPools'
import { isStaleWeekPlacement } from './weekPlacement'

export type AttentionReason = 'slipped' | 'stranded-week' | 'aging-month' | 'aging-inbox'

/**
 * How long capture may sit before it counts as rotting. Two weeks is long
 * enough that ordinary weekly triage never trips it, short enough that a
 * forgotten item surfaces while its context is still recoverable.
 */
export const AGING_INBOX_DAYS = 14

/**
 * The month bucket has no month.
 *
 * `tasks` carries exactly one period anchor, `week_start`, so a month-bucket
 * task cannot be "placed on a month that passed" — there is nothing to compare.
 * Rather than invent an anchor, this measures the honest thing: how long the
 * item has sat in the bucket. 45 days covers a full month plus slack, so a
 * genuine this-month placement never trips it.
 */
export const AGING_MONTH_DAYS = 45

export interface AttentionItem {
  task: Task
  reason: AttentionReason
  /**
   * Age in whole days — but measured from a DIFFERENT origin per reason:
   *
   *  - `slipped`      → days past `scheduledFor` (the date it missed)
   *  - `stranded-week`,
   *    `aging-month`,
   *    `aging-inbox`  → days since `createdAt` (how long it has existed)
   *
   * This is deliberate: a slipped task's own date is the sharper signal, and
   * the other three have no date to be late against. The unifying question
   * every value answers is "how long has this been wrong", not "how old is
   * this row".
   *
   * The consequence is load-bearing for callers. `AttentionLine` reduces to a
   * max across the whole mixed set and renders "oldest N days", so that one
   * number can be a due-date age on one render and a creation age on the
   * next, and the set it summarises can mix both. That is acceptable for a
   * signal ("something here is 38 days wrong") and NOT acceptable for
   * arithmetic — never sum, average, or compare these across reasons, and
   * never present one as an age-since-capture without checking `reason`.
   */
  ageDays: number
}

/**
 * Age from `createdAt`, never `updatedAt`.
 *
 * `tasks` has no `updated_at` trigger (unlike contacts, projects, event_notes),
 * so that column is written only when app code happens to set it. Measuring
 * from it would under-report age on exactly the oldest items — the ones this
 * signal exists to catch.
 */
function ageDays(task: Task, now: Date): number {
  return daysBetween(task.createdAt, now)
}

export function selectNeedsAttention(
  tasks: Task[],
  match: Match,
  now: Date,
  weekStart: Date,
): AttentionItem[] {
  const out: AttentionItem[] = []
  const claimed = new Set<string>()

  const push = (task: Task, reason: AttentionReason, age: number) => {
    if (claimed.has(task.id)) return
    claimed.add(task.id)
    out.push({ task, reason, ageDays: age })
  }

  // Dated work past its grace window. `isToday` is true because attention is
  // only ever computed for the live day.
  for (const task of selectSlipped(tasks, true, match, now)) {
    if (task.completed) continue
    push(task, 'slipped', daysBetween(task.scheduledFor as Date, now))
  }

  for (const task of tasks) {
    if (task.completed) continue
    if (!match(task.assignedTo, task.assignedToAll)) continue

    if (task.bucket === 'week') {
      // NULL weekStart means "the current week" — not late. Future weeks are
      // deliberate. Only a week already passed is stranded.
      if (isStaleWeekPlacement(task, weekStart)) {
        push(task, 'stranded-week', ageDays(task, now))
      }
      continue
    }

    if (task.bucket === 'month') {
      const age = ageDays(task, now)
      if (age > AGING_MONTH_DAYS) push(task, 'aging-month', age)
      continue
    }

    if (task.bucket === 'inbox') {
      const age = ageDays(task, now)
      if (age > AGING_INBOX_DAYS) push(task, 'aging-inbox', age)
      continue
    }

    // 'someday' is deliberately absent. Someday means "no timeline"; aging it
    // would make the count un-drainable, which is the exact failure this
    // design exists to avoid.
    //
    // 'quarter' is deliberately absent too — decided, not forgotten. It is
    // excluded for the same reason as 'someday' plus one of its own:
    //
    //  1. Like someday, it has no anchor that can go stale. `tasks` carries
    //     exactly one period anchor, `week_start`, so a quarter-bucket task
    //     can no more be "placed on a quarter that passed" than a month one
    //     can — there is nothing to compare it against.
    //  2. Unlike someday, it is not invisible: quarter items always render on
    //     the season horizon via selectHorizonPool(tasks, 'season', …). They
    //     have a page that lists them, so they are not the podiatrist case
    //     this signal exists to catch.
    //
    // A time-in-bucket rule like aging-month would therefore be noise: a
    // quarter is three months, so any honest threshold is long enough that
    // the season page has surfaced the item many times first.
  }

  return out
}

/**
 * Where "Review" should actually go.
 *
 * It used to go unconditionally to `/week`, on the reasoning that the week's
 * planning shelf already draws carried-over work so no new surface was needed.
 * That reasoning held for exactly one of the four reasons. Nothing on `/week`
 * reads this set — it computes its own, from THIS week's `week_start` — so a
 * count built mostly from aging inbox capture sent you to a page that said
 * "Everything is placed on a day." Told six things were wrong, then shown a
 * page asserting nothing was.
 *
 * Each reason goes to the rung that actually draws its unit:
 *   slipped / stranded-week -> /week   (the planning shelf's carried-over pills)
 *   aging-month             -> /month
 *   aging-inbox             -> /inbox
 */
const REASON_ROUTE: Record<AttentionReason, string> = {
  slipped: '/week',
  'stranded-week': '/week',
  'aging-month': '/month',
  'aging-inbox': '/inbox',
}

export function reviewDestination(items: AttentionItem[]): string {
  if (items.length === 0) return '/week'

  // Route to where the most work is, so one trip clears the most of it. Ties
  // break toward whichever group holds the oldest item — the line advertises
  // "oldest N days", so that item should be somewhere you can see it.
  const byRoute = new Map<string, { count: number; oldest: number }>()
  for (const item of items) {
    const route = REASON_ROUTE[item.reason]
    const seen = byRoute.get(route)
    if (seen) {
      seen.count += 1
      if (item.ageDays > seen.oldest) seen.oldest = item.ageDays
    } else {
      byRoute.set(route, { count: 1, oldest: item.ageDays })
    }
  }

  let best = '/week'
  let bestCount = -1
  let bestOldest = -1
  for (const [route, { count, oldest }] of byRoute) {
    if (count > bestCount || (count === bestCount && oldest > bestOldest)) {
      best = route
      bestCount = count
      bestOldest = oldest
    }
  }
  return best
}
