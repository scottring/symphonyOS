// src/components/plan/constellation/useYearSession.ts
//
// Year (Scott, 2026-10-12): "What do I want to accomplish this year?" The
// year's goals are the page; last year is optional review material beside
// them, never a parent. This holds what the Year board needs beyond the
// shared page: last year's goals and what became of each, each year goal's
// season goals across the whole year, whether last year is shown, and the
// optional look-back-and-plan session.
//
// The session is two steps (look back at last year, shape this year). Where it
// stands — the step, unfinished wording, "let it go" verdicts — is kept by
// useSessionProgress per person and year, in this browser only. What a
// session decides is written to goals as it happens; "planned" and the
// reflection notes are the planning_sessions row (usePlanningSession), saved
// only when the person marks the year planned. Nothing carries on its own.

import { useState } from 'react'
import { useSessionProgress } from '@/hooks/useSessionProgress'
import { usePlanningSession, yearToken } from '@/hooks/usePlanningSession'
import { periodBounds, selectPeriodTasks, isCurrentPeriod, type PeriodBounds } from '@/lib/planning/periodPage'
import type { Seasons } from '@/lib/cadence/seasons'
import type { Goal } from '@/types/goal'
import type { Task } from '@/types/task'

export type YearStep = 'lookback' | 'shape'

/** One of last year's goals, and what has become of it. */
export interface LookBackItem {
  goal: Goal
  /** Completed (in its own year). */
  done: boolean
  /** This year's goal renewed from it (carriedFrom), if any. */
  renewedAs: Goal | null
  /** Let go in this year's look-back: a record only, nothing is written. */
  left: boolean
  decided: boolean
}

export interface YearInputs {
  year: number
  /** Every goal the page has (GoalsContext); filtered here with `keep`. */
  goals: Goal[]
  /** Tasks already filtered for privacy, life area and people. */
  visible: Task[]
  /** The page's own goal filter: life area and people. */
  keep: (g: Goal) => boolean
  yearBounds: PeriodBounds
  seasons: Seasons
  now: Date
  scopeId: string | null
}

const SHOWN_KEY = 'symphony.year.lastYearShown'
function readShown(): boolean {
  try { return localStorage.getItem(SHOWN_KEY) !== '0' } catch { return true }
}
function writeShown(shown: boolean) {
  try { localStorage.setItem(SHOWN_KEY, shown ? '1' : '0') } catch { /* private window */ }
}

/**
 * Season goals that belong to the year's goals, across every season touching
 * the year, read with the Season page's own selector under the same filters
 * (one record each, never copied). Keyed by year goal id.
 */
export function seasonGoalsOfYear(visible: Task[], year: PeriodBounds, seasons: Seasons, now: Date, scopeId: string | null, yearGoalIds: ReadonlySet<string>): Map<string, Task[]> {
  const out = new Map<string, Task[]>()
  const seen = new Set<string>()
  let b = periodBounds('season', year.start, seasons)
  for (let guard = 0; b.start < year.end && guard < 8; guard++) {
    for (const t of selectPeriodTasks(visible, 'season', b.start, isCurrentPeriod(b, now), scopeId, seasons)) {
      if (seen.has(t.id) || !t.goalId || !yearGoalIds.has(t.goalId)) continue
      seen.add(t.id)
      out.set(t.goalId, [...(out.get(t.goalId) ?? []), t])
    }
    b = periodBounds('season', b.next, seasons)
  }
  return out
}

/** Last year's goals and what became of each. Renewed and done are read from
 *  the goals themselves; "let go" is the session's record. */
export function lookBackItems(prev: Goal[], thisYear: Goal[], decisions: Record<string, string>): LookBackItem[] {
  return prev.map((goal) => {
    const done = goal.status === 'completed'
    const renewedAs = thisYear.find((g) => g.carriedFrom === goal.id) ?? null
    const left = decisions[goal.id] === 'left'
    return { goal, done, renewedAs, left, decided: done || !!renewedAs || left }
  })
}

export function useYearSession(inputs: YearInputs | null) {
  const token = inputs ? yearToken(inputs.year) : ''
  const progress = useSessionProgress('annual', token)
  const planned = usePlanningSession('annual', token)
  // The session on screen, for this year only: another year never shows it.
  const [activeFor, setActiveFor] = useState<string | null>(null)
  const [sourceShown, setSourceShown] = useState(readShown)
  // The last-year goal whose renewal is being written.
  const [renewing, setRenewing] = useState<string | null>(null)
  // Remounts the writing line after a goal lands, so it is empty for the next.
  const [writeKey, setWriteKey] = useState(0)

  const p = progress.progress
  const active = !!token && activeFor === token && !!p
  const step: YearStep | null = active ? (p!.step === 'shape' ? 'shape' : 'lookback') : null
  const drafts = p?.drafts ?? {}
  const decisions = p?.decisions ?? {}

  const showSource = (shown: boolean) => { writeShown(shown); setSourceShown(shown) }
  const toggleSource = () => showSource(!sourceShown)

  /** Open the session, or resume it at its saved step with its unfinished
   *  input. Returns the step it opens at. */
  const start = (): YearStep => {
    const at: YearStep = p?.step === 'shape' ? 'shape' : 'lookback'
    progress.open('lookback')
    // A fresh session starts from the notes already saved for this year, so
    // clearing one later really clears it.
    if (!p && planned.mine) {
      if (planned.mine.wentWell) progress.setDraft('wentWell', planned.mine.wentWell)
      if (planned.mine.didnt) progress.setDraft('didnt', planned.mine.didnt)
    }
    const renewDraft = Object.keys(p?.drafts ?? {}).find((k) => k.startsWith('renew:'))
    if (renewDraft) setRenewing(renewDraft.slice('renew:'.length))
    if (at === 'lookback') showSource(true)
    setActiveFor(token)
    return at
  }
  const setStep = (s: YearStep) => {
    progress.setStep(s)
    if (s === 'lookback') showSource(true)
  }
  /** Leave for now: the progress stays, ready to continue. */
  const leave = () => setActiveFor(null)
  /** Marked planned: the session closes and its progress is forgotten. */
  const finish = () => { progress.finish(); setActiveFor(null) }

  let derived: { lookBack: LookBackItem[]; seasonGoals: Map<string, Task[]> } = { lookBack: [], seasonGoals: new Map() }
  if (inputs) {
    const { year, goals, keep } = inputs
    const kept = (y: number) => goals.filter((g) => g.year === y && g.status !== 'archived' && keep(g))
    const thisYear = kept(year)
    derived = {
      lookBack: lookBackItems(kept(year - 1), thisYear, decisions),
      seasonGoals: seasonGoalsOfYear(inputs.visible, inputs.yearBounds, inputs.seasons, inputs.now, inputs.scopeId, new Set(thisYear.map((g) => g.id))),
    }
  }

  return {
    ...derived,
    planned,
    /** A session for this year was started and not finished (open or paused). */
    inProgress: !!p,
    active,
    step,
    drafts,
    notes: { wentWell: drafts.wentWell ?? '', didnt: drafts.didnt ?? '' },
    sourceShown,
    toggleSource,
    renewing,
    setRenewing,
    writeKey,
    nextWrite: () => setWriteKey((k) => k + 1),
    start,
    setStep,
    leave,
    finish,
    setDraft: progress.setDraft,
    decide: progress.decide,
  }
}

export type YearSession = ReturnType<typeof useYearSession>
