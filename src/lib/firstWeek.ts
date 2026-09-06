// src/lib/firstWeek.ts
//
// "Your first week" — a fresh household lands on an empty Today with no
// guidance. Four real steps, each a link into the flow that actually does
// the thing, each collapsing to a one-line result once done. The card hides
// itself the moment fewer than two steps remain, and stays hidden for a week
// after "Hide for now" — never a permanent dismiss, never a badge/count.

export type FirstWeekStepId = 'people' | 'page' | 'partner' | 'routine'

export interface FirstWeekSignals {
  /** family_members rows visible to this account. */
  memberCount: number
  /** A page has been committed at least once — an `attachments` row whose
   *  `storage_path` matches the page-capture path (`<uid>/page/<uuid>.ext`),
   *  written by `useCommitPage` for every committed page, sample or real. */
  pageCommitted: boolean
  /** A second active `household_members` row, or an unexpired invitation. */
  partnerInvited: boolean
  /** `routines` rows visible to this account. */
  routineCount: number
}

export interface FirstWeekStep {
  id: FirstWeekStepId
  title: string
  done: boolean
  doneLine: string | null
  to: string
}

export function firstWeekSteps(s: FirstWeekSignals): FirstWeekStep[] {
  return [
    {
      id: 'people',
      title: 'Name your people',
      done: s.memberCount > 1,
      doneLine: s.memberCount > 1 ? `${s.memberCount} people` : null,
      to: '/settings#household',
    },
    {
      id: 'page',
      title: "Snap this week's page",
      done: s.pageCommitted,
      doneLine: s.pageCommitted ? 'see This Week' : null,
      to: '/today?plan=paper',
    },
    {
      id: 'partner',
      title: 'Invite your partner',
      done: s.partnerInvited,
      doneLine: s.partnerInvited ? 'invited' : null,
      to: '/settings#invite',
    },
    {
      id: 'routine',
      title: 'Add one routine',
      done: s.routineCount > 0,
      doneLine: s.routineCount > 0 ? 'see Routines' : null,
      to: '/routines',
    },
  ]
}

const HIDE_DURATION_MS = 7 * 86_400_000

/**
 * The card shows only while genuine onboarding work remains (≥2 undone
 * steps — an account with real data never sees it) and outside a 7-day
 * "Hide for now" window.
 */
export function shouldShowFirstWeek(steps: FirstWeekStep[], hiddenAt: string | null, now: Date): boolean {
  const remaining = steps.filter((s) => !s.done).length
  if (remaining < 2) return false
  if (hiddenAt) {
    const t = Date.parse(hiddenAt)
    if (Number.isFinite(t) && now.getTime() - t < HIDE_DURATION_MS) return false
  }
  return true
}

export const FIRST_WEEK_HIDE_KEY = (uid: string) => `symphony.firstWeek.hidden.${uid}`
