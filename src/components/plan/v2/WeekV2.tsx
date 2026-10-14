// src/components/plan/v2/WeekV2.tsx
//
// Week (docs/superpowers/specs/2026-10-04-planning-model-design.md). The page
// is the week's canvas (WeekViewV2) under the plan's status. Planning the week
// is a conversation, started from the docked bar's "Plan the rest of my week";
// the eight-step session this file once ran is retired (2026-10-14). Where no
// bar exists (phones) the page offers the same walk in place (`walk`).
//
// It is chrome AROUND the existing week: the canvas, drag and drop and
// add-to-day are WeekViewV2's, unchanged.

import { useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { usePlanningSession, weekToken } from '@/hooks/usePlanningSession'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useAuth } from '@/hooks/useAuth'
import { showToast } from '@/hooks/useToast'
import { PlanMastheadSlotsContext } from './planMastheadSlots'
import { PlanSavedLine, PlanToolbar, PlanToolbarControls, PlanToolbarStatus, type PlanToolbarProps } from './PlanStatus'
import { GuideAnchor } from '@/components/guide/GuideBar'
import { readCadenceConfig, localYmd } from '@/lib/cadence/config'
import { weekOfYear } from '@/lib/planning/horizonNumerals'
import { writePlanView } from '@/lib/planning/v2/planV2'

const DAY = 86_400_000

export function WeekV2({ weekStart, isCurrent, tools, canvas, walk }: {
  weekStart: Date
  isCurrent: boolean
  /** The week's display toggles (Routines), drawn in this toolbar. */
  tools?: ReactNode
  /** The week at rest: WeekViewV2's canvas. */
  canvas?: ReactNode | (() => ReactNode)
  /** Phones have no conversation bar: the page's own entry to the same walk. */
  walk?: { label: string; onStart: () => void }
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { members } = useFamilyMembers()
  const session = usePlanningSession('weekly', weekToken(weekStart))
  const [justSaved, setJustSaved] = useState<null | { detail: string }>(null)
  const toToday = () => navigate(new URLSearchParams(location.search).get('view') === 'alongside' ? '/today?view=alongside' : '/today')

  // Marking planned is one tap; the conversation does the planning.
  const markPlanned = async () => {
    if (!(await session.save({ wentWell: session.mine?.wentWell ?? '', didnt: session.mine?.didnt ?? '', focus: session.mine?.focus ?? session.saved?.notes?.focus }))) {
      showToast('Couldn’t save the plan — try again.', 'error', 5000)
      return
    }
    setJustSaved({ detail: '' })
  }

  const agreedBy = session.saved
    ? (session.saved.authorId === user?.id ? 'you' : members.find((m) => m.auth_user_id === session.saved!.authorId)?.name ?? 'your household')
    : null
  const weekNo = weekOfYear(weekStart, readCadenceConfig().weekStartsOn)
  const endsToday = isCurrent && localYmd(new Date(weekStart.getTime() + 6 * DAY)) === localYmd(new Date())
  const toolbar: PlanToolbarProps = {
    period: `week ${weekNo}`, saved: session.saved, loading: session.loading, error: !!session.error, agreedBy,
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
        // draws it; layout system 2026-10-01). The guide still opens here.
        <>
          <GuideAnchor />
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
          <span className="pv2-saved-text"><b>Week {weekNo} ends today.</b> Plan the week ahead while it’s fresh{walk ? <>: tap “{walk.label}” below.</> : <>: talk it through in the bar below.</>}</span>
        </div>
      )}
      {walk && (
        <div className="pv2-walk">
          <button type="button" className="pv2-btn" data-explain="plan-walk" data-explain-label={walk.label} onClick={walk.onStart}>{walk.label}</button>
        </div>
      )}
      <div className="wk-canvas">{typeof canvas === 'function' ? canvas() : canvas}</div>
    </div>
  )
}
