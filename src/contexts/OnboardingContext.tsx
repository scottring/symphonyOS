import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export interface Adult {
  name: string
  role?: string
}
export interface Kid {
  name: string
  age?: number
}

export type GoalKey =
  | 'eight_hundred_g'
  | 'waste_less'
  | 'eat_together'
  | 'kid_favorites'
  | 'batch_friendly'
  | 'low_effort_weeknights'
  | 'seasonal'
  | 'new_techniques'

export const GOAL_PRESETS: Array<{ key: GoalKey; label: string; brief: string }> = [
  { key: 'eight_hundred_g',       label: '800g challenge',         brief: '800g challenge' },
  { key: 'waste_less',            label: 'Waste less',             brief: 'Use what we already have' },
  { key: 'eat_together',          label: 'Eat together more',      brief: 'Family dinners > solo plates' },
  { key: 'kid_favorites',         label: 'Kid favorites',          brief: 'Lean on kid favorites' },
  { key: 'batch_friendly',        label: 'Batch-friendly',         brief: 'Cook once, eat thrice' },
  { key: 'low_effort_weeknights', label: 'Low-effort weeknights',  brief: 'Keep weeknights simple' },
  { key: 'seasonal',              label: 'Seasonal',               brief: 'Cook with what\'s in season' },
  { key: 'new_techniques',        label: 'Learn new techniques',   brief: 'One stretch dish this week' },
]

export type RhythmWhen = 'MORNINGS' | 'WEEKDAY LUNCH' | 'SNACK' | 'OFF-NIGHT' | 'BATCH-DAY' | 'EVENINGS'

export interface RhythmDraft {
  when: RhythmWhen
  what: string
  detail?: string
  contributesGrams?: number
}

export interface RhythmAnswers {
  breakfast: string
  lunch: string
  snack: string
  off_nights: string
}

export interface OnboardingState {
  step: 1 | 2 | 3 | 4
  household: { adults: Adult[]; kids: Kid[] }
  goals: { selected: GoalKey[]; custom: string }
  rhythms: {
    answers: RhythmAnswers
    parsed: RhythmDraft[]
    note: string
    parseStatus: 'idle' | 'thinking' | 'ok' | 'error'
  }
  brief: string
}

interface OnboardingContextValue extends OnboardingState {
  setStep: (s: OnboardingState['step']) => void
  setAdults: (adults: Adult[]) => void
  setKids: (kids: Kid[]) => void
  setSelectedGoals: (g: GoalKey[]) => void
  setCustomGoal: (v: string) => void
  setRhythmAnswers: (a: RhythmAnswers) => void
  setRhythmParsed: (h: RhythmDraft[], note: string) => void
  setRhythmStatus: (s: OnboardingState['rhythms']['parseStatus']) => void
  setBrief: (b: string) => void
  /** Build a starter brief body from selected goals + custom goal text. */
  buildPrefilledBrief: () => string
}

const Ctx = createContext<OnboardingContextValue | null>(null)

const initial: OnboardingState = {
  step: 1,
  household: { adults: [], kids: [] },
  goals: { selected: [], custom: '' },
  rhythms: {
    answers: { breakfast: '', lunch: '', snack: '', off_nights: '' },
    parsed: [],
    note: '',
    parseStatus: 'idle',
  },
  brief: '',
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(initial)

  const setStep = useCallback((step: OnboardingState['step']) => {
    setState(s => ({ ...s, step }))
  }, [])
  const setAdults = useCallback((adults: Adult[]) => {
    setState(s => ({ ...s, household: { ...s.household, adults } }))
  }, [])
  const setKids = useCallback((kids: Kid[]) => {
    setState(s => ({ ...s, household: { ...s.household, kids } }))
  }, [])
  const setSelectedGoals = useCallback((selected: GoalKey[]) => {
    setState(s => ({ ...s, goals: { ...s.goals, selected } }))
  }, [])
  const setCustomGoal = useCallback((custom: string) => {
    setState(s => ({ ...s, goals: { ...s.goals, custom } }))
  }, [])
  const setRhythmAnswers = useCallback((answers: RhythmAnswers) => {
    setState(s => ({ ...s, rhythms: { ...s.rhythms, answers } }))
  }, [])
  const setRhythmParsed = useCallback((parsed: RhythmDraft[], note: string) => {
    setState(s => ({ ...s, rhythms: { ...s.rhythms, parsed, note, parseStatus: 'ok' } }))
  }, [])
  const setRhythmStatus = useCallback((parseStatus: OnboardingState['rhythms']['parseStatus']) => {
    setState(s => ({ ...s, rhythms: { ...s.rhythms, parseStatus } }))
  }, [])
  const setBrief = useCallback((brief: string) => {
    setState(s => ({ ...s, brief }))
  }, [])

  const buildPrefilledBrief = useCallback(() => {
    const lines: string[] = []
    for (const k of state.goals.selected) {
      const preset = GOAL_PRESETS.find(p => p.key === k)
      if (preset) lines.push(preset.brief)
    }
    if (state.goals.custom.trim()) lines.push(state.goals.custom.trim())
    return lines.join(' · ')
  }, [state.goals])

  const value = useMemo<OnboardingContextValue>(() => ({
    ...state,
    setStep,
    setAdults,
    setKids,
    setSelectedGoals,
    setCustomGoal,
    setRhythmAnswers,
    setRhythmParsed,
    setRhythmStatus,
    setBrief,
    buildPrefilledBrief,
  }), [state, setStep, setAdults, setKids, setSelectedGoals, setCustomGoal,
       setRhythmAnswers, setRhythmParsed, setRhythmStatus, setBrief, buildPrefilledBrief])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useOnboarding(): OnboardingContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useOnboarding must be used inside <OnboardingProvider>')
  return v
}

/** Map a parsed rhythm `when` to the canonical meal slot used by the
 *  plan generator. OFF-NIGHT and BATCH-DAY collapse to dinner; the rhythm
 *  context survives in standing_habits.when_label. */
export function rhythmToSlot(when: RhythmWhen): 'breakfast' | 'lunch' | 'snack' | 'dinner' {
  switch (when) {
    case 'MORNINGS':       return 'breakfast'
    case 'WEEKDAY LUNCH':  return 'lunch'
    case 'SNACK':          return 'snack'
    case 'EVENINGS':       return 'dinner'
    case 'OFF-NIGHT':      return 'dinner'
    case 'BATCH-DAY':      return 'dinner'
  }
}

/** Human-readable label for the rhythms preview + standing-habits UI. */
export function rhythmToLabel(when: RhythmWhen): string {
  switch (when) {
    case 'MORNINGS':       return 'Mornings'
    case 'WEEKDAY LUNCH':  return 'Weekday lunch'
    case 'SNACK':          return 'Snack'
    case 'EVENINGS':       return 'Evenings'
    case 'OFF-NIGHT':      return 'Off-night'
    case 'BATCH-DAY':      return 'Batch-day'
  }
}
