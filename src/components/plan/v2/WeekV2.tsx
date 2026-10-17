// src/components/plan/v2/WeekV2.tsx
//
// Week (docs/superpowers/specs/2026-10-04-planning-model-design.md). The page
// is the week's canvas (WeekViewV2) under the plan's status. Planning the week
// is a conversation, started from "Help me plan the rest of my week";
// the eight-step session this file once ran is retired (2026-10-14).
// The page offers that same entry on every screen size (`walk`).
//
// It is chrome AROUND the existing week: the canvas, drag and drop and
// add-to-day are WeekViewV2's, unchanged. "Review week N" (?review=1) swaps
// the canvas for the review by hand (PeriodReview) over WeekViewV2's lines.

import { useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { usePlanningSession, weekToken } from '@/hooks/usePlanningSession'
import { usePeriodReview } from '@/hooks/usePeriodReview'
import { PeriodReview, type ReviewLine } from '@/components/plan/review/PeriodReview'
import { weekPhrase } from '@/lib/planning/periodReview'
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

export function WeekV2({ weekStart, isCurrent, tools, canvas, walk, reviewLines }: {
  weekStart: Date
  isCurrent: boolean
  /** The week's display toggles (Routines), drawn in this toolbar. */
  tools?: ReactNode
  /** The week at rest: WeekViewV2's canvas. */
  canvas?: ReactNode | (() => ReactNode)
  /** The page's entry to the same conversation on every screen size. */
  walk?: { label: string; onStart: () => void }
  /** The week's lines for the review by hand, with their verbs (WeekViewV2). */
  reviewLines?: ReviewLine[]
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { members } = useFamilyMembers()
  const session = usePlanningSession('weekly', weekToken(weekStart))
  const review = usePeriodReview('weekly', weekToken(weekStart))
  const [params, setParams] = useSearchParams()
  const reviewing = !!reviewLines && params.get('review') === '1'
  const setReviewing = (on: boolean, week?: Date) => setParams((prev) => {
    const p = new URLSearchParams(prev)
    if (on) p.set('review', '1'); else p.delete('review')
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
    : 'Review your activities and decide what needs attention this week.'
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
  const toolbar: PlanToolbarProps = {
    period: `week ${weekNo}`, saved: session.saved, loading: session.loading, error: !!session.error, agreedBy,
    planningAction: walk && { label: walk.label, onClick: walk.onStart },
    reviewAction: reviewLines && !reviewing ? { label: `Review ${reviewWord}`, onClick: () => setReviewing(true) } : undefined,
    markLabel: 'I’m happy with this week',
    markDisabled: confirmationBlocked,
    unplannedHint: reviewHint,
    reviewDue: !session.saved, onPlan: () => undefined, onRetry: session.reload,
    // On its last day the week is not marked planned; the line under the
    // masthead points at planning the next one.
    onMark: endsToday ? undefined : () => void markPlanned(),
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
      {reviewing
        ? <PeriodReview key={localYmd(weekStart)} periodWord={reviewWord} lines={reviewLines!} loading={review.loading}
            reviewed={review.reviewed} mine={review.mine} onFinish={review.finish} onClose={() => setReviewing(false)}
            next={{ label: `Go to ${weekPhrase(nextWeek)} →`, onClick: () => setReviewing(false, nextWeek) }}
            byWhom={(id) => id === user?.id ? 'you' : members.find((m) => m.auth_user_id === id)?.name ?? 'your household'} />
        : <div className="wk-canvas">{typeof canvas === 'function' ? canvas() : canvas}</div>}
    </div>
  )
}
