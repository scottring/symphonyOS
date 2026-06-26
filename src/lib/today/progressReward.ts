/**
 * progressReward — turns raw today counts into rewarding, momentum-aware
 * microcopy for the Today progress band. Pure + testable; the component just
 * renders what this returns.
 *
 * The point: a list tells you what's left; a *rewarding* view tells you how
 * far you've come and names the finish. Copy is calm and earned (no hype,
 * no emoji — icons live in the component).
 */

export interface ProgressReward {
  /** Short headline, e.g. "Almost there" or "All done". */
  headline: string
  /** Supporting line, e.g. "3 of 5 done" or "2 to go". */
  detail: string
  /** 0–100 integer for the progress bar. */
  pct: number
  /** True only when every actionable item is complete (the reward moment). */
  complete: boolean
  /** True when there is genuinely nothing actionable today (vs. all-finished). */
  empty: boolean
}

export function progressReward(completedCount: number, actionableCount: number): ProgressReward {
  // Nothing on the plate today — a clear day, not a finished one.
  if (actionableCount <= 0) {
    return { headline: 'Nothing scheduled', detail: 'A clear day — capture or plan when you want.', pct: 0, complete: false, empty: true }
  }

  const completed = Math.max(0, Math.min(completedCount, actionableCount))
  const remaining = actionableCount - completed
  const pct = Math.round((completed / actionableCount) * 100)

  // The reward: everything actionable is done.
  if (remaining === 0) {
    return {
      headline: 'All done',
      detail: actionableCount === 1 ? 'You cleared the one thing today.' : `You cleared all ${actionableCount} today.`,
      pct: 100,
      complete: true,
      empty: false,
    }
  }

  let headline: string
  if (completed === 0) headline = 'Here’s today'
  else if (pct < 34) headline = 'Just getting started'
  else if (pct < 67) headline = 'Building momentum'
  else headline = 'Almost there'

  // Consistent, practical count — the unified header owns the numbers.
  const detail = `${completed} of ${actionableCount} done`

  return { headline, detail, pct, complete: false, empty: false }
}
