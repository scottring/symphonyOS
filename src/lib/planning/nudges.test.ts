import { describe, it, expect } from 'vitest'
import { planningNudge, type PlanningNudgeResult } from '@/lib/planning/nudges'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'
import type { WeekStart } from '@/lib/cadence/config'

const WEEK_STARTS_ON: WeekStart = 0 // Sunday

function nudge(opts: {
  now: Date
  completed?: string[]
  neverPlanned?: boolean
  dismissedToken?: string | null
}): PlanningNudgeResult | null {
  return planningNudge({
    now: opts.now,
    seasons: DEFAULT_SEASONS,
    weekStartsOn: WEEK_STARTS_ON,
    completed: new Set(opts.completed ?? []),
    neverPlanned: opts.neverPlanned ?? false,
    dismissedToken: opts.dismissedToken ?? null,
  })
}

// Fixed dates, all local midnight-ish so the windows are unambiguous.
const SAT_SEP_26 = new Date(2026, 8, 26, 9, 0)
const TUE_AUG_25 = new Date(2026, 7, 25, 9, 0)
const TUE_DEC_1 = new Date(2026, 11, 1, 9, 0)
const TUE_JAN_5_2027 = new Date(2027, 0, 5, 9, 0)
const WED_SEP_16 = new Date(2026, 8, 16, 9, 0)

describe('planningNudge', () => {
  it('first use beats every window', () => {
    const r = nudge({ now: WED_SEP_16, neverPlanned: true })
    expect(r).toEqual({
      kind: 'first-use',
      token: 'first-use',
      text: 'Start with the year: plan 2026, then the season, the month and the week.',
      cta: 'Plan 2026 →',
      to: '/year',
    })
  })

  it('first use wins even inside a year window', () => {
    expect(nudge({ now: TUE_DEC_1, neverPlanned: true })?.kind).toBe('first-use')
  })

  const cases: Array<{
    name: string
    now: Date
    completed?: string[]
    dismissedToken?: string | null
    expected: PlanningNudgeResult | null
  }> = [
    {
      name: 'Saturday nudges NEXT week',
      now: SAT_SEP_26,
      // month + season + year silenced so the week is what is left
      completed: ['monthly:2026-10', 'seasonal:2026-fall', 'annual:2026'],
      expected: {
        kind: 'week',
        token: '2026-9-27',
        text: "The week of Sep 27 – Oct 3 isn't planned yet.",
        cta: 'Plan the week →',
        to: '/week?start=2026-09-27',
      },
    },
    {
      name: 'a planned week is silent',
      now: SAT_SEP_26,
      completed: ['monthly:2026-10', 'seasonal:2026-fall', 'annual:2026', 'weekly:2026-9-27'],
      expected: null,
    },
    {
      name: 'the month outranks the week',
      now: SAT_SEP_26,
      completed: ['seasonal:2026-fall', 'annual:2026'],
      expected: {
        kind: 'month',
        token: '2026-10',
        text: "October isn't planned yet.",
        cta: 'Plan October →',
        to: '/month',
      },
    },
    {
      name: 'a dismissed month falls through to the week',
      now: SAT_SEP_26,
      completed: ['seasonal:2026-fall', 'annual:2026'],
      dismissedToken: '2026-10',
      expected: {
        kind: 'week',
        token: '2026-9-27',
        text: "The week of Sep 27 – Oct 3 isn't planned yet.",
        cta: 'Plan the week →',
        to: '/week?start=2026-09-27',
      },
    },
    {
      name: 'seven days before the Fall boundary, the season',
      now: TUE_AUG_25,
      completed: ['annual:2026'],
      expected: {
        kind: 'season',
        token: '2026-fall',
        text: "Fall 2026 isn't planned yet.",
        cta: 'Plan Fall 2026 →',
        to: '/season',
      },
    },
    {
      name: 'December targets NEXT year',
      now: TUE_DEC_1,
      expected: {
        kind: 'year',
        token: '2027',
        text: "2027 isn't planned yet.",
        cta: 'Plan 2027 →',
        to: '/year?start=2027-01-01',
      },
    },
    {
      name: 'early January targets THIS year',
      now: TUE_JAN_5_2027,
      expected: {
        kind: 'year',
        token: '2027',
        text: "2027 isn't planned yet.",
        cta: 'Plan 2027 →',
        to: '/year?start=2027-01-01',
      },
    },
    {
      name: 'a planned next year falls through to the season',
      now: TUE_DEC_1,
      completed: ['annual:2027'],
      expected: {
        kind: 'season',
        token: '2026-winter',
        text: "Winter 2026 isn't planned yet.",
        cta: 'Plan Winter 2026 →',
        to: '/season',
      },
    },
    {
      name: 'mid-month Wednesday: no window, no nudge',
      now: WED_SEP_16,
      expected: null,
    },
  ]

  for (const c of cases) {
    it(c.name, () => {
      expect(
        nudge({ now: c.now, completed: c.completed, dismissedToken: c.dismissedToken }),
      ).toEqual(c.expected)
    })
  }

  it('accepts the kind-prefixed token set completedCadenceTokens builds', () => {
    const r = nudge({
      now: SAT_SEP_26,
      completed: ['month:2026-10', 'season:2026-fall', 'year:2026', 'week:2026-9-27'],
    })
    expect(r).toBeNull()
  })
})

describe('planningNudge — only one kind', () => {
  it('only: "week" skips first-use and the higher candidates, and returns the week when its window is open', () => {
    const base = { seasons: DEFAULT_SEASONS, weekStartsOn: 0 as const, completed: new Set<string>(), dismissedToken: null }
    // Monday Dec 21 2026: year (Nov 20+) and week (Mon/Tue) windows both open.
    const monday = new Date(2026, 11, 21, 9)
    expect(planningNudge({ ...base, now: monday, neverPlanned: false })?.kind).toBe('year')
    expect(planningNudge({ ...base, now: monday, neverPlanned: false, only: 'week' })?.kind).toBe('week')
    // Never planned: first-use would win; with only: 'week' it is the week.
    expect(planningNudge({ ...base, now: monday, neverPlanned: true, only: 'week' })?.kind).toBe('week')
    // Wednesday: no week window → nothing, even though the year is open.
    expect(planningNudge({ ...base, now: new Date(2026, 11, 23, 9), neverPlanned: false, only: 'week' })).toBeNull()
  })
})
