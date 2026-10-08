// src/lib/voiceOnboarding/existingPlan.ts
//
// What the account already has, in the shape a planning session reads: this
// year's goals and the season, month and week lists, each line with the year
// goal it serves. Built from the SAME selections the planning pages use
// (selectPeriodTasks, weekListTasks), from tasks the caller has already put
// through the domain filter — so a session never shows what the page would
// not. Pure: no fetching here.

import type { Goal } from '@/types/goal'
import type { Task } from '@/types/task'
import { isFocused } from '@/lib/placement/model'
import { localYmd } from '@/lib/cadence/config'
import { newDraft, reduce, type DraftPeriods, type ExistingItem, type ExistingPlan, type FlowAction, type PlanDomain, type ReduceEnv, type Step, type VoicePlanDraft } from './flow'

const domainOf = (c: string | null | undefined): PlanDomain | null => (c === 'work' || c === 'family' || c === 'personal' ? c : null)

export interface ExistingLists {
  /** This year's goals, as the Year page lists them. */
  goals: readonly Goal[]
  /** The season, month and week lists, as their pages select them. */
  season: readonly Task[]
  month: readonly Task[]
  week: readonly Task[]
  today: Date
  userId?: string | null
  lookBack?: { month: number; season: number }
}

export function existingPlanFrom(l: ExistingLists): ExistingPlan {
  const goals = l.goals
    .filter((g) => g.status === 'active')
    .map((g) => ({ id: g.id, title: g.name, context: domainOf(g.context) }))
  const known = new Set(goals.map((g) => g.id))
  const item = (horizon: ExistingItem['horizon']) => (t: Task): ExistingItem => ({
    id: t.id, title: t.title, horizon,
    // A link to a goal outside this year's active list reads as unlinked here.
    goalId: t.goalId && known.has(t.goalId) ? t.goalId : null,
    context: domainOf(t.context),
    ...(horizon === 'week' && isFocused(t, l.userId, localYmd(l.today)) ? { today: true } : {}),
  })
  const open = (t: Task) => !t.completed && !t.isGoal
  return {
    goals,
    items: [
      ...l.season.filter(open).map(item('season')),
      ...l.month.filter(open).map(item('month')),
      ...l.week.filter((t) => !t.completed).map(item('week')),
    ],
    ...(l.lookBack ? { lookBack: l.lookBack } : {}),
  }
}

// ── The preview's example account (generic; no one's real plans) ──────────
//
// Two goals already on the year, a little already on the season, month and
// week lists — enough to show reuse. The session then adds two more goals.

export const EXAMPLE_EXISTING: ExistingPlan = {
  goals: [
    { id: 'ex-goal-garden', title: 'Grow food in the back garden', context: 'personal' },
    { id: 'ex-goal-office', title: 'Finish the home office', context: 'personal' },
  ],
  items: [
    { id: 'ex-season-beds', title: 'Two raised beds built', horizon: 'season', goalId: 'ex-goal-garden' },
    { id: 'ex-month-paint', title: 'Paint the office walls', horizon: 'month', goalId: 'ex-goal-office' },
    { id: 'ex-week-samples', title: 'Buy paint samples', horizon: 'week', goalId: 'ex-goal-office' },
    { id: 'ex-week-library', title: 'Return library books', horizon: 'week', goalId: null },
  ],
  lookBack: { month: 3, season: 0 },
}

/** What the simulated voice "says" for each question, in the example. */
export const EXAMPLE_SAYS = {
  year: ['Hold a simple conversation in Spanish', 'Launch the neighbourhood newsletter'],
  season: {
    'Grow food in the back garden': 'Beds planted with garlic for winter',
    'Finish the home office': 'Desk and shelves in place',
    'Hold a simple conversation in Spanish': 'Finish the beginner course',
    'Launch the neighbourhood newsletter': 'First issue out to twenty houses',
  } as Record<string, string>,
  month: {
    'Grow food in the back garden': 'Order garlic bulbs',
    'Hold a simple conversation in Spanish': 'Lessons one to eight',
    'Launch the neighbourhood newsletter': 'Draft the first issue',
  } as Record<string, string>,
  week: ['Paint a test patch on the wall', 'Two Spanish lessons', 'Ask three neighbours for a story'],
  today: 'Two Spanish lessons',
}

const G = { garden: 'ex-goal-garden', office: 'ex-goal-office' }
const LAST_MONTH_LINE = '__last-month-line__'

/** The example session from the year down, stopping at `until`. */
export function exampleSession(until: Step, env: ReduceEnv, periods?: DraftPeriods): VoicePlanDraft {
  const steps: FlowAction[] = [
    ...EXAMPLE_SAYS.year.map((text) => ({ type: 'addGoal', text }) as FlowAction),
    { type: 'continue' }, // → year:check
    { type: 'continue' }, // → season
    { type: 'answer', text: EXAMPLE_SAYS.season['Grow food in the back garden'], goal: G.garden },
    { type: 'answer', text: EXAMPLE_SAYS.season['Finish the home office'], goal: G.office },
    { type: 'answer', text: EXAMPLE_SAYS.season['Hold a simple conversation in Spanish'], goal: 'Spanish' },
    { type: 'focus', goal: 'newsletter' },
    { type: 'continue' }, // → season:check
    { type: 'continue' }, // → month
    { type: 'answer', text: EXAMPLE_SAYS.month['Grow food in the back garden'], goal: G.garden },
    { type: 'toWeek', id: LAST_MONTH_LINE }, // already doable: straight to this week
    { type: 'answer', text: EXAMPLE_SAYS.month['Hold a simple conversation in Spanish'], goal: 'Spanish' },
    { type: 'defer', goal: 'newsletter' },
    { type: 'continue' }, // → month:check
    { type: 'continue' }, // → week
    ...EXAMPLE_SAYS.week.map((text, i) => ({ type: 'addWeek', text, goal: [G.office, 'Spanish', 'newsletter'][i] }) as FlowAction),
    { type: 'continue' }, // → week:check
    { type: 'continue' }, // → today
    { type: 'answer', text: EXAMPLE_SAYS.today },
    { type: 'toggleToday', id: 'ex-week-samples' },
    { type: 'continue' }, // → review
  ]
  let d = newDraft('year', EXAMPLE_EXISTING, periods)
  for (const a of steps) {
    if (d.step === until) break
    // The example names its new goals by a word; find them by title.
    const goal = 'goal' in a && a.goal && !a.goal.startsWith('ex-')
      ? d.goals.find((g) => g.title.toLowerCase().includes(a.goal!.toLowerCase()))?.id ?? a.goal : undefined
    const act = a.type === 'toWeek' && a.id === LAST_MONTH_LINE ? { ...a, id: d.month[d.month.length - 1]?.id ?? '' }
      : goal ? ({ ...a, goal } as FlowAction) : a
    d = reduce(d, act, env)
  }
  return d
}
