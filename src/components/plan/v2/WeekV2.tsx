// src/components/plan/v2/WeekV2.tsx
//
// Week (docs/superpowers/specs/2026-10-04-planning-model-design.md). The page
// is the week's canvas (WeekViewV2) under the plan's status. Planning the week
// is a conversation, started from "Help me plan the rest of my week";
// the eight-step session this file once ran is retired (2026-10-14).
// The page offers that same entry on every screen size (`walk`).
//
// It is chrome AROUND the existing week: the canvas, drag and drop and
// add-to-day are WeekViewV2's, unchanged. Review (?review=1) and Plan
// (?plan=1) swap the canvas for the deck (Friday session, Stage 1): everything
// without a home this week, one card at a time. "Place them" (?place=1) opens
// the same deck with only this week's cards. Month, Season and Year keep
// PeriodReview and PeriodPlan (ConstellationPage).

import { useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { usePlanningSession, weekToken } from '@/hooks/usePlanningSession'
import { usePeriodReview } from '@/hooks/usePeriodReview'
import { Deck } from '@/components/plan/deck/Deck'
import type { StripDay } from '@/components/plan/deck/WeekStrip'
import { deckModeOf, type DeckCard } from '@/lib/planning/deck'
import type { DeckActions } from '@/components/home/week/useDeckActions'
import { REVIEW_WINDOW_DAYS, reviewTarget, weekPhrase } from '@/lib/planning/periodReview'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useAuth } from '@/hooks/useAuth'
import { showToast } from '@/hooks/useToast'
import { PlanMastheadSlotsContext } from './planMastheadSlots'
import { PlanSavedLine, PlanToolbar, PlanToolbarControls, PlanToolbarStatus, type PlanToolbarProps } from './PlanStatus'
import { readCadenceConfig, localYmd } from '@/lib/cadence/config'
import { weekOfYear } from '@/lib/planning/horizonNumerals'
import { writePlanView } from '@/lib/planning/v2/planV2'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'

const DAY = 86_400_000

/** What WeekViewV2 knows for the deck, read off the page's own scoped tasks. */
export interface WeekDeck {
  cards: DeckCard[]
  doneLastWeek: number
  aged: number
  actions: DeckActions
  stripDays: StripDay[]
  /** The page's tasks are still loading: the deck waits rather than open empty. */
  loading?: boolean
  /** The deck's own closing writes (the full deck's end-of-deck drain). The
   *  review is recorded and the deck left here, in WeekV2. */
  onFinish: (decided: ReadonlySet<string>) => void | Promise<unknown>
  onSeeAged: () => void
}

export function WeekV2({ weekStart, isCurrent, tools, canvas, walk, deck }: {
  weekStart: Date
  isCurrent: boolean
  /** The week's display toggles (Routines), drawn in this toolbar. */
  tools?: ReactNode
  /** The week at rest: WeekViewV2's canvas. */
  canvas?: ReactNode | (() => ReactNode)
  /** The page's entry to the same conversation on every screen size. */
  walk?: { label: string; onStart: () => void }
  /** The deck for Review, Plan and Place them (WeekViewV2). */
  deck?: WeekDeck
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { members } = useFamilyMembers()
  const session = usePlanningSession('weekly', weekToken(weekStart))
  // Early in a week, the review on offer is last week's, until it is done.
  const lastWeek = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7)
  const lastReview = usePeriodReview('weekly', weekToken(lastWeek))
  const [params, setParams] = useSearchParams()
  const deckMode = deck ? deckModeOf(params) : null
  const setMode = (mode: 'review' | 'plan' | 'place' | null, week?: Date) => setParams((prev) => {
    const p = new URLSearchParams(prev)
    p.delete('review'); p.delete('plan'); p.delete('place')
    if (mode) p.set(mode, '1')
    if (week) { p.set('date', localYmd(week)); p.set('start', localYmd(week)) }
    return p
  })
  const reviewWord = weekPhrase(weekStart)
  const nextWeek = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)
  const [justSaved, setJustSaved] = useState<null | { detail: string }>(null)
  const [confirming, setConfirming] = useState(false)
  const { changeSet, receipt } = useCanvasActivity()
  const working = receipt?.state === 'working' || receipt?.state === 'saving'
  const unresolved = !!changeSet || receipt?.state === 'partial' || receipt?.state === 'unverified'
  const confirmationBlocked = working || unresolved || confirming
  const reviewHint = working ? 'Finish the current conversation or save before confirming the week.'
    : changeSet ? 'Save or discard the draft in Chat before confirming this week.'
    : unresolved ? 'Check the last change in Chat before confirming this week.'
    : receipt?.state === 'saved' ? 'Your changes are saved. Review the week, then choose “I’m happy with this week.”'
    // At rest the header says nothing of its own (Scott, 2026-10-17: "quite
    // cluttered"); Review and the planning verbs speak for themselves.
    : ''
  const toToday = () => navigate(new URLSearchParams(location.search).get('view') === 'alongside' ? '/today?view=alongside' : '/today')

  // Marking planned is one tap; the conversation does the planning.
  const markPlanned = async () => {
    if (confirmationBlocked) return
    setConfirming(true)
    try {
      if (!(await session.save({ wentWell: session.mine?.wentWell ?? '', didnt: session.mine?.didnt ?? '', focus: session.mine?.focus ?? session.saved?.notes?.focus }))) throw new Error('Not confirmed')
      setJustSaved({ detail: 'You can still adjust your activities as things change.' })
    } catch {
      showToast('Couldn’t save the plan — try again.', 'error', 5000)
    } finally {
      setConfirming(false)
    }
  }

  const agreedBy = session.saved
    ? (session.saved.authorId === user?.id ? 'you' : members.find((m) => m.auth_user_id === session.saved!.authorId)?.name ?? 'your household')
    : null
  const weekNo = weekOfYear(weekStart, readCadenceConfig().weekStartsOn)
  const endsToday = isCurrent && localYmd(new Date(weekStart.getTime() + 6 * DAY)) === localYmd(new Date())
  // A week that is over, or ends today, is reviewed, not planned.
  const plannable = !!deck && !endsToday && weekStart.getTime() + 7 * DAY > Date.now()
  // The deck on week W looks back at the week before it (its "Last week"
  // cards) and records that week's review. So reviewing this week opens the
  // deck on the week after it, and last week's review opens it here.
  const target = reviewTarget({ start: weekStart, end: nextWeek }, new Date(), REVIEW_WINDOW_DAYS.week)
  const reviewOffer = target === 'this' ? { label: `Review ${reviewWord}`, onClick: () => setMode('review', nextWeek) }
    : target === 'previous' && !lastReview.loading && !lastReview.error && !lastReview.reviewed
      ? { label: `Review ${weekPhrase(lastWeek)}`, onClick: () => setMode('review') }
      : undefined
  // Full deck: the undealt last-week cards go to Later (WeekViewV2's drain),
  // then last week is recorded reviewed. "Place them" does neither. Either
  // way the deck gives way to the week.
  const finishDeck = async (decided: ReadonlySet<string>) => {
    if (deckMode === 'full' && deck) {
      try { await deck.onFinish(decided) } catch { /* the activity strip reports it */ }
      if (!(await lastReview.finish({ wentWell: '', didnt: '' }))) showToast('Couldn’t mark last week reviewed — try again.', 'error', 5000)
    }
    setMode(null)
  }
  const toolbar: PlanToolbarProps = {
    period: `week ${weekNo}`, saved: session.saved, loading: session.loading, error: !!session.error, agreedBy,
    planningAction: walk && { label: walk.label, onClick: walk.onStart },
    reviewAction: deck && !deckMode ? reviewOffer : undefined,
    handPlanAction: plannable && !deckMode ? { label: `Plan ${reviewWord}`, onClick: () => setMode('plan') } : undefined,
    markLabel: 'I’m happy with this week',
    markDisabled: confirmationBlocked,
    unplannedHint: reviewHint,
    reviewDue: !session.saved, onPlan: () => undefined, onRetry: session.reload,
    // On its last day the week is not marked planned; the line under the
    // masthead points at planning the next one.
    // While the deck is open, the bar offers no mark.
    onMark: endsToday || deckMode ? undefined : () => void markPlanned(),
    tools: tools && <div className="pv2-wtools">{tools}</div>,
    justSaved: justSaved && {
      detail: justSaved.detail,
      next: isCurrent
        ? { label: 'Pick something for today', onClick: () => { writePlanView('today', 'ref'); toToday() } }
        : { label: 'Back to Today', onClick: toToday },
      onDone: () => setJustSaved(null),
    },
  }
  // HomeHeader's masthead, when it offers a place for the folded row
  // (desktop only; HomeView decides).
  const slots = useContext(PlanMastheadSlotsContext)

  return (
    <div className="pv2-week" data-week={localYmd(weekStart)}>
      {slots?.subline && slots.controls ? (
        // Desktop: the control row folds into the week's masthead (HomeHeader
        // draws it; layout system 2026-10-01).
        <>
          {createPortal(<PlanToolbarStatus {...toolbar} />, slots.subline)}
          {createPortal(<PlanToolbarControls {...toolbar} />, slots.controls)}
          <PlanSavedLine period={`week ${weekNo}`} justSaved={toolbar.justSaved} />
        </>
      ) : <PlanToolbar {...toolbar} />}

      {session.saved?.notes?.focus && (
        // What the week is for, as agreed when it was planned.
        <p className="wk-focus-line"><span>This week is for</span> <em>{session.saved.notes?.focus}</em></p>
      )}
      {endsToday && (
        // The week's last day: nothing left in it to plan, so say so and
        // point at planning the next one by talking.
        <div className="pv2-saved pv2-endsweek" role="note">
          <span className="pv2-saved-text"><b>Week {weekNo} ends today.</b> {walk ? <>Use “{walk.label}” to look ahead.</> : <>Open Chat to talk through the week ahead.</>}</span>
        </div>
      )}
      {deckMode && deck
        // Dealt only once the tasks are in: no flash of "Nothing left".
        ? (deck.loading ? null : <Deck key={`${localYmd(weekStart)}-${deckMode}`} mode={deckMode} cards={deck.cards}
            doneLastWeek={deck.doneLastWeek} aged={deck.aged} onSeeAged={deck.onSeeAged} actions={deck.actions}
            stripDays={deck.stripDays} onFinish={finishDeck} onExit={() => setMode(null)} />)
        : <div className="wk-canvas">{typeof canvas === 'function' ? canvas() : canvas}</div>}
    </div>
  )
}
