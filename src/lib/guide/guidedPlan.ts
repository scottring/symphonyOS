// src/lib/guide/guidedPlan.ts
//
// Guided planning (a path through the planning pages under a guide bar) is
// retired: planning is a conversation now (Horizons talk-first, 2026-10-14).
// What is left is the shape a run had, for the one reader that still asks
// whether a run is on Today's step (TodayView). Nothing starts a run.

export type GuideRoute = 'pickup' | 'bigger' | 'month' | 'week' | 'today'
export type ReviewStep = 'season-review' | 'month-review'
export type GuideStep = 'year' | 'season' | 'month' | 'week' | 'today' | ReviewStep

export interface GuideState {
  v: 1
  route: GuideRoute
  steps: GuideStep[]
  /** Each step's period, as its first day (YYYY-MM-DD). */
  periods: Partial<Record<GuideStep, string>>
  current: number
  done: GuideStep[]
  status: 'active' | 'paused' | 'finished'
  updatedAt: string
}

export const currentStep = (s: GuideState): GuideStep => s.steps[Math.min(s.current, s.steps.length - 1)]
