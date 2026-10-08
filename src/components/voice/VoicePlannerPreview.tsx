// src/components/voice/VoicePlannerPreview.tsx
//
// /plan-aloud-preview — DEV builds only (main.tsx). A design preview of
// "Plan out loud" with no session and no data: an example account (generic
// goals, nobody's real plans), the simulation transport, a session kept in
// memory, and a save that writes nothing. Labelled as a preview on screen.
//
//   ?scene=<name>  opens at a prepared point (see SCENES) — for review and
//                  screenshots; the page is fully clickable from there.
//   ?fail=1        makes one write fail, to check the partial-save screen.
//   ?guide=1       shows the typed guide with a canned example reply (no AI).

import { useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { readSeasons } from '@/lib/cadence/seasons'
import { readCadenceConfig } from '@/lib/cadence/config'
import { reduce, type ReduceEnv, type Step, type VoicePlanDraft, draftPeriods } from '@/lib/voiceOnboarding/flow'
import { EXAMPLE_EXISTING, exampleSession } from '@/lib/voiceOnboarding/existingPlan'
import { newAddition, type Addition } from '@/lib/voiceOnboarding/addition'
import { labelsForPeriods, planPeriods } from '@/lib/voiceOnboarding/periods'
import { DemoTransport } from '@/lib/voiceOnboarding/transport'
import type { VoicePlanWriters } from '@/lib/voiceOnboarding/savePlan'
import type { AskGuide } from '@/lib/voiceOnboarding/guide'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import { VoicePlanner, type Phase } from './VoicePlanner'

/** `until`: the session as it arrives at that step. `back`: the step before
 *  it, with its answers in place (the question scenes). */
const SCENES: Record<string, { phase: Phase; until?: Step; back?: boolean; focus?: string; addition?: boolean }> = {
  home: { phase: 'home' },
  resume: { phase: 'home', until: 'month:check', back: true },
  build: { phase: 'build' },
  year: { phase: 'talk', until: 'year:check', back: true },
  'year-check': { phase: 'talk', until: 'year:check' },
  season: { phase: 'talk', until: 'season:check', back: true },
  'season-check': { phase: 'talk', until: 'season:check' },
  month: { phase: 'talk', until: 'month:check', back: true, focus: 'Spanish' },
  'month-check': { phase: 'talk', until: 'month:check' },
  week: { phase: 'talk', until: 'week:check', back: true },
  'week-check': { phase: 'talk', until: 'week:check' },
  today: { phase: 'talk', until: 'review', back: true },
  review: { phase: 'talk', until: 'review' },
  add: { phase: 'add', addition: true },
  'review-plan': { phase: 'review' },
}

export function VoicePlannerPreview() {
  const [params] = useSearchParams()
  const fail = params.get('fail') === '1'
  const sceneName = params.get('scene') ?? 'home'
  // A canned answer, so the panel can be reviewed without any AI call.
  const exampleGuide = useMemo<AskGuide | undefined>(() => (params.get('guide') === '1' ? async (r) => ({
    reply: 'Example reply (preview, not the real guide): that sounds like three separate priorities. Which one matters most this month?',
    proposals: [
      { level: r.horizon, goal: r.focus, text: 'Plan a week of meals' },
      { level: r.horizon, goal: r.focus, text: 'Buy dumbbells and a mat' },
    ],
  }) : undefined), [params])
  const held = useRef<VoicePlanDraft | null>(null)
  const periods = useMemo(() => planPeriods(new Date(), readSeasons(), readCadenceConfig().weekStartsOn), [])
  const periodsNow = useMemo(() => draftPeriods(periods), [periods])
  const newId = useMemo(() => { let n = 0; return () => `new-${++n}` }, [])
  const writers = useMemo<VoicePlanWriters>(() => ({
    addYearGoal: async () => true,
    // With ?fail=1 the first month line fails and what serves it waits — the
    // partial-save screen.
    addTask: async (_t, o) => !fail || o.level !== 'month',
    planForToday: async () => true,
  }), [fail])
  const persistDraft = useCallback((d: VoicePlanDraft | null) => { held.current = d; return true }, [])

  const start = useMemo(() => {
    const scene = SCENES[sceneName] ?? SCENES.home
    const env: ReduceEnv = { existing: EXAMPLE_EXISTING, newId }
    let session = scene.until ? exampleSession(scene.until, env, periodsNow) : undefined
    if (session && scene.back) session = reduce(session, { type: 'back' }, env)
    const focus = scene.focus && session?.goals.find((g) => g.title.includes(scene.focus!))?.id
    if (session && focus) session = reduce(session, { type: 'focus', goal: focus }, env)
    const addition: Addition | undefined = scene.addition
      ? { ...newAddition('month', 'ex-goal-office', newId), text: 'Choose a desk lamp', next: 'Measure the desk corner' }
      : undefined
    return { phase: scene.phase, ...(scene.phase === 'talk' ? { draft: session } : {}), ...(addition ? { addition } : {}), resume: sceneName === 'resume' ? session ?? null : null }
  }, [sceneName, newId, periodsNow])

  return (
    <div className="vo-preview-shell">
      <div className={PAGE_COLUMN}>
        <VoicePlanner key={sceneName} labels={periods.labels} periodsNow={periodsNow} labelsFor={(p) => labelsForPeriods(p, readSeasons())} existing={EXAMPLE_EXISTING} initialDraft={start.resume} persistDraft={persistDraft} writers={writers}
          makeTransport={() => new DemoTransport()} askGuide={exampleGuide} simulatedSave start={start} newId={newId} onReview={() => {}} />
      </div>
    </div>
  )
}
