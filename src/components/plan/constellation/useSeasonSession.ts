// src/components/plan/constellation/useSeasonSession.ts
//
// Season's optional planning session (Scott, 2026-10-12): look back at the
// season before and decide what each unfinished goal becomes, consider the
// year's goals, then write the season freely. The season's collection stays
// on screen throughout; only the source beside it changes per step.
//
// Nothing here gates editing: the page works the same without a session.
// Where the session stands (step, a half-typed goal, look-back verdicts) is
// useSessionProgress — per person and season, in this browser only. "Planned"
// is the planning_sessions record (usePlanningSession).

import { useCallback, useState } from 'react'
import { useSessionProgress } from '@/hooks/useSessionProgress'
import { usePlanningSession, type SessionNotes } from '@/hooks/usePlanningSession'

export const SEASON_STEPS = ['lookback', 'year', 'write'] as const
export type SeasonStep = typeof SEASON_STEPS[number]

const isStep = (s: string | undefined): s is SeasonStep => !!s && (SEASON_STEPS as readonly string[]).includes(s)

/** What a finished session chose, for the line it leaves behind. */
export interface SeasonFinish { carried: number }

/**
 * `token` is the season's seasonToken, or '' when the page is not on Season
 * (no read, no progress). Changing the token closes the open session view;
 * the other season's progress is its own.
 */
export function useSeasonSession(token: string) {
  const progress = useSessionProgress('seasonal', token)
  const planning = usePlanningSession('seasonal', token)
  const [active, setActive] = useState(false)
  const [finished, setFinished] = useState<SeasonFinish | null>(null)
  const [seen, setSeen] = useState(token)
  if (seen !== token) { setSeen(token); setActive(false); setFinished(null) }

  const p = progress.progress
  const step: SeasonStep = isStep(p?.step) ? p.step : 'lookback'
  const stepIndex = SEASON_STEPS.indexOf(step)

  /** Start, or resume at the saved step with its drafts. */
  const start = useCallback(() => {
    progress.open('lookback')
    setFinished(null)
    setActive(true)
  }, [progress])
  /** Leave for now: the session's place is kept for the next visit. */
  const leave = useCallback(() => setActive(false), [])
  const setStep = useCallback((s: SeasonStep) => progress.setStep(s), [progress])

  /** Mark the season planned; on success the session closes and says what
   *  was chosen. False leaves everything as it was, to try again. */
  const finish = useCallback(async (): Promise<boolean> => {
    const mine = planning.mine
    const notes: SessionNotes = { wentWell: mine?.wentWell ?? '', didnt: mine?.didnt ?? '', ...(mine?.focus ? { focus: mine.focus } : {}) }
    const ok = await planning.save(notes)
    if (!ok) return false
    const carried = Object.values(p?.decisions ?? {}).filter((v) => v === 'carried').length
    progress.finish()
    setActive(false)
    setFinished({ carried })
    return true
  }, [planning, progress, p])

  return {
    /** The session bar is on screen. */
    active,
    /** A session was started and not finished (possibly left for now). */
    inProgress: !!p,
    step,
    stepIndex,
    drafts: p?.drafts ?? {},
    decisions: p?.decisions ?? {},
    saved: planning.saved,
    planLoading: planning.loading,
    planError: !!planning.error,
    finished,
    dismissFinished: () => setFinished(null),
    start,
    leave,
    setStep,
    setDraft: progress.setDraft,
    decide: progress.decide,
    finish,
  }
}

export type SeasonSession = ReturnType<typeof useSeasonSession>

// Whether the year's goals show beside the season (one viewer's preference;
// the page works the same without it). A session step that needs the source
// shows it for the visit without changing the preference.
const YEAR_SHOWN_KEY = 'symphony.season.yearGoalsShown'
function readYearGoalsShown(): boolean {
  try { return localStorage.getItem(YEAR_SHOWN_KEY) !== '0' } catch { return true }
}
export function useYearGoalsShown() {
  const [shown, setShown] = useState(readYearGoalsShown)
  const toggle = useCallback(() => setShown((s) => {
    try { localStorage.setItem(YEAR_SHOWN_KEY, s ? '0' : '1') } catch { /* private window */ }
    return !s
  }), [])
  const reveal = useCallback(() => setShown(true), [])
  return { shown, toggle, reveal }
}
