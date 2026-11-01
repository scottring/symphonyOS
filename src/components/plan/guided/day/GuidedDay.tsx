// Today while a Day session runs (spec 2026-11-01, "one page, two moments"):
// a one-line session bar with the day's count, the steps rail beside the day,
// and the day itself, the real page, unchanged. The step's header and the
// conversation are the shell's (useGuidedDay registers them).
//
// Morning: plans today and looks back on yesterday. From 4 pm: plans tomorrow
// and looks back on today (dayTarget). Mounted only while it runs, so its
// notes are read only then.

import { useEffect, useState, type ReactNode } from 'react'
import type { Task } from '@/types/task'
import type { TodayChoice, TodayReview } from '@/lib/planning/chooseToday'
import { DAY_COUNT_OF, dayCount, dayStepTitle } from '@/lib/guide/dayTarget'
import { stepsFor } from '@/lib/guide/steps'
import { dayToken } from '@/hooks/usePlanningSession'
import { usePlanningNotes, type GuideNotes } from '@/hooks/usePlanningNotes'
import { usePeriodReview } from '@/hooks/usePeriodReview'
import { showToast } from '@/hooks/useToast'
import { GuideRail } from '@/components/guide/GuideRail'
import { SessionBar } from '@/components/guide/SessionBar'
import { GuidePhoneHeader } from '@/components/guide/GuidePhoneHeader'
import { EnergyNote } from '@/components/guide/EnergyNote'
import { useGuidedDay } from '../useGuidedDay'
import { DayLookBack } from './DayLookBack'
import { DayPick } from './DayPick'
import { DayPicture, type DayPictureItem } from './DayRows'
import type { DayActions } from '@/lib/planning/dayActions'
import '@/components/guide/guide.css'

export function GuidedDay({ target, lookBackOn, isTomorrow, canvas, dayItems, routinesHidden, lookBack, choice, actions, goalLabel, listenPlacements, onFinish, onClose, onPlanned }: {
  /** The day being planned (dayTarget). */
  target: Date
  lookBackOn: Date
  isTomorrow: boolean
  /** The day itself: the page as it is every day. */
  canvas: ReactNode
  /** The day being planned as the page shows it, under its filters: the
   *  calendar step's picture, Habits' routines and the count. */
  dayItems: readonly DayPictureItem[]
  /** The page's "hide routines" is on: Habits says so rather than "none". */
  routinesHidden?: boolean
  /** What the day looked back on held (buildTodayReview). */
  lookBack: TodayReview
  /** This week → the day being planned (buildTodayChoice). */
  choice: TodayChoice
  /** The page's writers, each taking the day it acts on. */
  actions: DayActions
  goalLabel: (t: Task) => string | undefined
  /** Placements saved on the page itself (a task dragged onto the day):
   *  on the pick step they mark the day planned, as a pick does. Returns the
   *  unsubscribe. */
  listenPlacements?: (listener: () => void) => () => void
  /** The page's closing write (the day stamped planned); false keeps the
   *  session open. */
  onFinish: () => Promise<boolean>
  onClose: () => void
  onPlanned?: () => void
}) {
  // The look back's win as typed, kept here so it outlives its step's body
  // (only the current step's body is drawn). Done planning saves it.
  const [winDraft, setWinDraft] = useState<string | null>(null)
  const review = usePeriodReview('daily', dayToken(lookBackOn))
  const notes = usePlanningNotes('daily', dayToken(target))
  const count = dayCount(dayItems)
  const closeDay = async () => {
    const win = winDraft?.trim()
    if (winDraft !== null && win !== (review.mine?.wentWell ?? '')
      && !(await review.finish({ wentWell: win ?? '', didnt: review.mine?.didnt ?? '' }).catch(() => false))) {
      showToast(`Couldn’t save the win for ${isTomorrow ? 'today' : 'yesterday'} — try again.`, 'error', 5000)
    }
    return onFinish()
  }
  const guided = useGuidedDay({ target, isTomorrow, count, actions, onFinish: closeDay, onClose, onPlanned })
  const { markPlannedOnce } = guided
  useEffect(() => listenPlacements?.(() => { void markPlannedOnce() }), [listenPlacements, markPlannedOnce])

  const dayWord = isTomorrow ? 'tomorrow' : 'today'
  const dayLabel = target.toLocaleDateString('en-US', { weekday: 'long' })
  const steps = stepsFor('day')
  const index = Math.max(0, steps.findIndex((s) => s.id === guided.progress.current))
  const routines = dayItems.filter((i) => i.kind === 'routine')
  const bodies = {
    'look-back': <DayLookBack isTomorrow={isTomorrow} target={target} lookBackOn={lookBackOn} lookBack={lookBack}
      actions={guided.actions} goalLabel={goalLabel} review={review} draft={winDraft} onDraft={setWinDraft} />,
    calendar: <div className="gw-body"><DayPicture dayLabel={dayLabel} items={dayItems} /></div>,
    energy: <DayEnergy value={notes.notes.energy} save={(energy) => notes.patch({ energy })} />,
    pick: <DayPick count={count} isTomorrow={isTomorrow} target={target} choice={choice}
      skip={new Set(lookBack.open.map((t) => t.id))} actions={guided.actions} />,
    habits: <div className="gw-body">
      {routinesHidden ? <p className="choose-empty">Routines are hidden on this page.</p>
        : routines.length === 0 ? <p className="choose-empty">No routines on {dayWord}.</p>
        : <ul className="gw-days" aria-label={`Routines ${dayWord}`}>
          {routines.map((r) => <li key={r.key}><b>{r.time ?? ''}</b><span>{r.title}</span></li>)}
        </ul>}
      <p className="gw-row-note">Tick them off on the day as you go.</p>
    </div>,
  }

  return (
    <section className="guide-session" aria-label={`Planning ${dayWord}`}>
      <p className="guide-session-line">
        <SessionBar label={`Planning ${dayWord}`} index={index} total={steps.length} onLeave={onClose} />
        <span className="guide-session-count">{count} of {DAY_COUNT_OF} on {dayWord}</span>
      </p>
      {guided.saveError && <p className="guide-session-error" role="alert">{guided.saveError}</p>}
      <GuidePhoneHeader />
      <div className="guide-session-layout gd-layout">
        {/* Where the session is comes first: no flash of step one before a
            resume. The day beside it stays put while it loads. */}
        {guided.loading ? <div className="guide-rail" aria-busy="true" />
          : <GuideRail level="day" progress={guided.progress} titleFor={(s) => dayStepTitle(s, isTomorrow)} bodies={bodies} onJump={(id) => { void guided.jump(id) }} />}
        <div className="guide-session-page">{canvas}</div>
      </div>
    </section>
  )
}

/** Energy: high, medium or low, with a word or two, beside the day. */
function DayEnergy({ value, save }: { value?: GuideNotes['energy']; save: (v: NonNullable<GuideNotes['energy']>) => Promise<boolean> }) {
  const [failed, setFailed] = useState(false)
  return <div className="gw-body">
    <EnergyNote value={value} onChange={(v) => { setFailed(false); void save(v).catch(() => false).then((ok) => { if (!ok) setFailed(true) }) }} />
    {failed && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}
  </div>
}
