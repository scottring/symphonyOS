// The cascade-runner: a session's step list stops being a constant and becomes a
// function of real state.
//
// `guided/sessions.ts` holds all five rituals as static literals, and the shell
// renders whatever config it is handed. So "the assistant runs the cascade" does
// not need a new shell, new steps, or a new host — it needs the config to be
// COMPUTED. Same registry, same zero-prop steps, same GuidedHost.
//
// Two rules this follows deliberately:
//
// 1. RULES, NOT A MODEL. Same reasoning as lib/assistant/urgency.ts: a model
//    deciding which steps you get would be uncalibrated, would drift between
//    runs, and would be undebuggable when the monthly ritual silently loses a
//    step. Every decision here is a stated condition with a stated reason.
//
// 2. NO SILENT SKIPS. A skipped step is reported with its reason, never just
//    absent. A wizard that quietly drops steps is indistinguishable from a
//    wizard that's broken — which is exactly the "less buggy" criterion this is
//    supposed to serve.
//
// The spine (narration / reflect / review / calendar) is never skipped: those
// steps are the ritual itself, not bookkeeping about it.

import type { PlanningHorizon } from '@/hooks/usePlanningSession'
import type { GuidedSessionConfig, GuidedStepConfig, StepType } from '@/components/planning/guided/types'

/** Step types that ARE the ritual — always present, whatever the state. */
const SPINE: ReadonlySet<StepType> = new Set<StepType>([
  'narration', 'reflect', 'review', 'calendar',
])

/** Step types that compose the period's actual choices, for the hoist rule. */
const COMPOSER: ReadonlySet<StepType> = new Set<StepType>([
  'pick-by-goal', 'move-by-pick', 'write-list', 'domains-goals',
])

export interface SessionState {
  /** Fraction of the period already elapsed, 0–1. Drives the hoist rule. */
  periodElapsed: number
  /** Items completed within this period — the wins step has nothing without them. */
  completedInPeriod: number
  /** Untriaged inbox items. */
  inboxCount: number
  /** Open items on the upkeep template list. */
  upkeepCount: number
  /** True when the next period's planning session is already on the calendar. */
  nextSessionBooked: boolean
  /** Items at this horizon still needing placement into the level below. */
  unplacedCount: number
  /** Items already chosen at this horizon (picks, moves, list entries). */
  chosenCount: number
}

export interface SkippedStep {
  id: string
  title: string
  reason: string
}

export interface ComposedSession {
  steps: GuidedStepConfig[]
  /** Why a step is here / why it moved, keyed by step id. Sparse. */
  why: Record<string, string>
  /** Steps removed, with the condition that removed them. Never silent. */
  skipped: SkippedStep[]
}

/** The period is "underway" past this much elapsed — late enough that arriving
 *  with nothing chosen is the thing to fix first. */
const UNDERWAY = 0.25

/** Minimal shape needed to derive state — deliberately not the whole GuidedHost,
 *  so this stays pure and fixture-testable. */
export interface SessionStateInput {
  tasks: {
    bucket?: string
    completed: boolean
    updatedAt?: Date
    pickedAt?: Date | null
    sourceId?: string
    weekStart?: Date
  }[]
  events: { title: string; startTime: Date }[]
  upkeepCount: number
  periodStart: Date
  periodEnd: Date
}

/** Which bucket each horizon composes into. */
const BUCKET_BY_HORIZON: Partial<Record<PlanningHorizon, string>> = {
  seasonal: 'quarter',
  monthly: 'month',
  weekly: 'week',
}

const PLAN_EVENT_RE = /\bplan\b.*\b(week|month|season|year)\b/i

export function deriveSessionState(
  input: SessionStateInput,
  horizon: PlanningHorizon,
  now: Date,
): SessionState {
  const { tasks, events, upkeepCount, periodStart, periodEnd } = input
  const span = periodEnd.getTime() - periodStart.getTime()
  const periodElapsed = span > 0
    ? Math.min(1, Math.max(0, (now.getTime() - periodStart.getTime()) / span))
    : 0

  const inPeriod = (d?: Date) =>
    !!d && d.getTime() >= periodStart.getTime() && d.getTime() <= periodEnd.getTime()

  // `updatedAt` is the closest available completion timestamp — tasks carry no
  // completed_at. It over-counts a completed task edited later in the period,
  // which is the safe direction: it can only KEEP the wins step, never hide it.
  const completedInPeriod = tasks.filter((t) => t.completed && inPeriod(t.updatedAt)).length

  const inboxCount = tasks.filter((t) => !t.completed && (!t.bucket || t.bucket === 'inbox')).length

  const bucket = BUCKET_BY_HORIZON[horizon]
  const atHorizon = bucket ? tasks.filter((t) => !t.completed && t.bucket === bucket) : []

  // "Chosen" means the explicit act this rung performs: seasons PICK
  // (pickedAt), months file a move under a pick (sourceId), weeks just list.
  const chosenCount = horizon === 'seasonal'
    ? atHorizon.filter((t) => !!t.pickedAt).length
    : horizon === 'monthly'
      ? atHorizon.filter((t) => !!t.sourceId).length
      : atHorizon.length

  // Month moves awaiting a week row.
  const unplacedCount = horizon === 'monthly'
    ? atHorizon.filter((t) => !t.weekStart).length
    : 0

  // Approximation, and worth naming as one: there's no marker distinguishing a
  // planning event from any other, so this matches on title. A false negative
  // just keeps the book-next step, which is the harmless direction.
  const nextSessionBooked = events.some(
    (e) => e.startTime.getTime() > now.getTime() && PLAN_EVENT_RE.test(e.title),
  )

  return {
    periodElapsed,
    completedInPeriod,
    inboxCount,
    upkeepCount,
    nextSessionBooked,
    unplacedCount,
    chosenCount,
  }
}

function skipReason(step: GuidedStepConfig, state: SessionState): string | null {
  switch (step.type) {
    case 'wins':
      // Renders a celebration of completed moves; with none it's an empty card
      // that reads as "you did nothing".
      return state.completedInPeriod === 0 ? 'nothing finished in this period yet' : null
    case 'inbox':
      return state.inboxCount === 0 ? 'inbox is already empty' : null
    case 'maintenance':
      return state.upkeepCount === 0 ? 'no upkeep items are open' : null
    case 'book-next':
      return state.nextSessionBooked ? 'next session is already on the calendar' : null
    case 'place-on-weeks':
      return state.unplacedCount === 0 ? 'everything is already placed' : null
    default:
      return null
  }
}

function weeksIn(elapsed: number, horizon: PlanningHorizon): number {
  const weeksInPeriod: Record<PlanningHorizon, number> = {
    daily: 0, weekly: 1, monthly: 4, seasonal: 13, annual: 52,
  }
  return Math.max(0, Math.round(elapsed * weeksInPeriod[horizon]))
}

/**
 * Compose the ritual for THIS period from the base config plus real state.
 *
 * Pure: no clock, no DB, no React. `state` is injected, so every rule is
 * fixture-testable.
 */
export function composeSession(
  base: GuidedSessionConfig,
  horizon: PlanningHorizon,
  state: SessionState,
): ComposedSession {
  const why: Record<string, string> = {}
  const skipped: SkippedStep[] = []

  const kept: GuidedStepConfig[] = []
  for (const step of base.steps) {
    if (SPINE.has(step.type)) {
      kept.push(step)
      continue
    }
    const reason = skipReason(step, state)
    if (reason) {
      skipped.push({ id: step.id, title: step.title, reason })
      continue
    }
    kept.push(step)
  }

  // Hoist rule: arriving at a period that's already underway with nothing chosen
  // means the choosing is the point of this sitting, not step nine of twelve.
  // Only ever moves ONE step, and never in front of an opening narration — the
  // ritual should still open by telling you where you are.
  let steps = kept
  if (state.periodElapsed >= UNDERWAY && state.chosenCount === 0) {
    const composerIndex = kept.findIndex((s) => COMPOSER.has(s.type))
    const anchor = kept.length > 0 && kept[0].type === 'narration' ? 1 : 0
    if (composerIndex > anchor) {
      const composer = kept[composerIndex]
      steps = [
        ...kept.slice(0, anchor),
        composer,
        ...kept.slice(anchor, composerIndex),
        ...kept.slice(composerIndex + 1),
      ]
      const w = weeksIn(state.periodElapsed, horizon)
      why[composer.id] = w > 0
        ? `moved first — ${w} week${w === 1 ? '' : 's'} in with nothing chosen yet`
        : 'moved first — nothing chosen yet'
    }
  }

  return { steps, why, skipped }
}
