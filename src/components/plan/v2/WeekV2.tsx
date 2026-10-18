// src/components/plan/v2/WeekV2.tsx
//
// Week (docs/superpowers/specs/2026-10-04-planning-model-design.md). The page
// is the week's canvas (WeekViewV2) under its header. The eight-step session
// this file once ran is retired (2026-10-14).
//
// The header (calm pass 2, mockup approved 2026-10-18): one quiet fact line
// ("{n} done last week · reviewed {Weekday} · Today: {first item}"), one
// primary button, "Plan this week", where the deck may open, and a ⋯ menu
// (WeekMenu). On the desk they fold into HomeHeader's masthead; on a phone
// they are the page's own row. "Help me plan the rest of my week" lives in the
// Chat bar only (WeekViewV2 still hands it the walk), and there is no "I’m
// happy with this week": finishing the full deck marks the week planned.
//
// It is chrome AROUND the existing week: the canvas, drag and drop and
// add-to-day are WeekViewV2's, unchanged. Review (?review=1) and Plan
// (?plan=1) swap the canvas for the deck (Friday session, Stage 1): everything
// without a home this week, one card at a time. "Place them" (?place=1) opens
// the same deck with only this week's cards. Month, Season and Year keep
// PeriodReview and PeriodPlan (ConstellationPage).

import { useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { usePlanningSession, weekToken } from '@/hooks/usePlanningSession'
import { usePeriodReview } from '@/hooks/usePeriodReview'
import { Deck } from '@/components/plan/deck/Deck'
import type { StripDay } from '@/components/plan/deck/WeekStrip'
import type { DeckCard, DeckMode } from '@/lib/planning/deck'
import type { DeckActions } from '@/components/home/week/useDeckActions'
import { REVIEW_WINDOW_DAYS, reviewTarget, weekPhrase } from '@/lib/planning/periodReview'
import { showToast } from '@/hooks/useToast'
import { PlanMastheadSlotsContext } from './planMastheadSlots'
import { WeekMenu } from './WeekMenu'
import { readCadenceConfig, localYmd } from '@/lib/cadence/config'
import { weekOfYear } from '@/lib/planning/horizonNumerals'

const DAY = 86_400_000

/** What WeekViewV2 knows for the deck, read off the page's own scoped tasks. */
export interface WeekDeck {
  /** The deck the URL opens on this week, or null (also null on a week the
   *  deck may not open on). */
  mode: DeckMode | null
  /** Whether this week may open the deck at all (deckWeekAllowed). */
  available: boolean
  cards: DeckCard[]
  doneLastWeek: number
  aged: number
  actions: DeckActions
  stripDays: StripDay[]
  /** The page's tasks are still loading: the deck waits rather than open empty. */
  loading?: boolean
  /** Last week's review, the page's own record (the header's fact line reads
   *  it): finishing the deck writes through it, so the line updates. */
  lastReview?: ReturnType<typeof usePeriodReview>
  /** The deck's own closing writes (the full deck's end-of-deck drain),
   *  resolving false when they failed. The review is recorded and the deck
   *  left here, in WeekV2. */
  onFinish: (decided: ReadonlySet<string>) => Promise<boolean>
  onSeeAged: () => void
}

export function WeekV2({ weekStart, isCurrent, canvas, today, deck }: {
  weekStart: Date
  isCurrent: boolean
  /** The week at rest: WeekViewV2's canvas. */
  canvas?: ReactNode | (() => ReactNode)
  /** Today's first item, for the fact line ("Today: …"); null when there is
   *  none, the week is not this one, or it has not loaded. */
  today?: string | null
  /** The deck for Review, Plan and Place them (WeekViewV2). */
  deck?: WeekDeck
}) {
  const session = usePlanningSession('weekly', weekToken(weekStart))
  // Early in a week, the review on offer is last week's, until it is done.
  const lastWeek = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7)
  // One record of it: the page's when it passes one (an empty token reads
  // nothing), so finishing the deck updates the page's line too.
  const ownReview = usePeriodReview('weekly', deck?.lastReview ? '' : weekToken(lastWeek))
  const lastReview = deck?.lastReview ?? ownReview
  const [, setParams] = useSearchParams()
  const deckMode = deck?.mode ?? null
  const setMode = (mode: 'review' | 'plan' | 'place' | null, week?: Date) => setParams((prev) => {
    const p = new URLSearchParams(prev)
    p.delete('review'); p.delete('plan'); p.delete('place')
    if (mode) p.set(mode, '1')
    if (week) { p.set('date', localYmd(week)); p.set('start', localYmd(week)) }
    return p
  })
  const reviewWord = weekPhrase(weekStart)
  const nextWeek = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)

  // The week's planned mark — the record "I’m happy with this week" wrote,
  // which Home's checklist reads. Written now by finishing the full deck.
  const markPlanned = async () => {
    try {
      return !!(await session.save({
        wentWell: session.mine?.wentWell ?? '', didnt: session.mine?.didnt ?? '',
        focus: session.mine?.focus ?? session.saved?.notes?.focus,
      }))
    } catch { return false }
  }

  const weekNo = weekOfYear(weekStart, readCadenceConfig().weekStartsOn)
  const endsToday = isCurrent && localYmd(new Date(weekStart.getTime() + 6 * DAY)) === localYmd(new Date())
  // A week that is over, or ends today, is reviewed, not planned.
  const plannable = !!deck?.available && !endsToday && weekStart.getTime() + 7 * DAY > new Date().getTime()
  // The deck on week W looks back at the week before it (its "Last week"
  // cards) and records that week's review. So reviewing this week opens the
  // deck on the week after it, and last week's review opens it here.
  const target = reviewTarget({ start: weekStart, end: nextWeek }, new Date(), REVIEW_WINDOW_DAYS.week)
  // On the week's own last day there is nothing left of it to plan: the one
  // button reviews it instead, opening the deck on the week after.
  const lastDayReview = target === 'this' && isCurrent && !!deck
  // Full deck: the undealt last-week cards go to Later (WeekViewV2's drain),
  // then last week is recorded reviewed, then this week is marked planned.
  // "Place them" does none of these. Either way the deck gives way to the week.
  // A drain that failed records nothing and keeps the deck open: the
  // activity strip says why, and "That's enough for this week" tries again.
  const finishDeck = async (decided: ReadonlySet<string>) => {
    if (deckMode === 'full' && deck) {
      let drained = false
      try { drained = await deck.onFinish(decided) } catch { drained = false }
      if (!drained) return
      if (!(await lastReview.finish({ wentWell: '', didnt: '' }))) showToast('Couldn’t mark last week reviewed — try again.', 'error', 5000)
      else if (!(await markPlanned())) showToast('Couldn’t mark this week planned — try again.', 'error', 5000)
    }
    setMode(null)
  }

  // ── The header ─────────────────────────────────────────────────────────
  // One primary button, where the deck may open; none while it is open.
  const primary = deckMode ? null
    : plannable ? { label: `Plan ${reviewWord}`, onClick: () => setMode('plan') }
      : lastDayReview ? { label: `Review ${reviewWord}`, onClick: () => setMode('review', nextWeek) }
        : null
  // The fact line: last week's progress where the deck may open (the deck on
  // this week reviews it), and today's first item.
  const reviewKnown = !lastReview.loading && !lastReview.error
  const progress = deck?.available ? (
    <>{deck.doneLastWeek} done last week{reviewKnown && <> · {lastReview.reviewed
      ? <b className="wk-facts-reviewed">reviewed {lastReview.reviewed.at.toLocaleDateString('en-US', { weekday: 'long' })}</b>
      : <button type="button" className="canvas-link wc-quiet-link" onClick={() => setMode('review')}>Review</button>}</>}</>
  ) : null
  const facts = !deckMode && (progress || today) ? (
    <p className="wk-facts" data-explain="week-facts" data-explain-label="This week’s facts">
      {progress}{progress && today && ' · '}{today && <>Today: {today}</>}
    </p>
  ) : null
  const controls = (
    <>
      {primary && <button type="button" className="pv2-btn wk-plan" onClick={primary.onClick} data-explain="plan-deck" data-explain-label={primary.label}>{primary.label}</button>}
      <WeekMenu />
    </>
  )
  // HomeHeader's masthead, when it offers a place for the header (desktop
  // only; HomeView decides).
  const slots = useContext(PlanMastheadSlotsContext)

  return (
    <div className="pv2-week" data-week={localYmd(weekStart)}>
      {slots?.subline && slots.controls ? (
        // Desktop: the header folds into the week's masthead (HomeHeader
        // draws it; layout system 2026-10-01).
        <>
          {facts && createPortal(facts, slots.subline)}
          {createPortal(controls, slots.controls)}
        </>
      ) : (
        // Phone: the same reduction, as the page's own row under the masthead.
        <div className="wk-head">
          {facts ?? <span />}
          <div className="wk-head-actions">{controls}</div>
        </div>
      )}

      {session.saved?.notes?.focus && (
        // What the week is for, as agreed when it was planned.
        <p className="wk-focus-line"><span>This week is for</span> <em>{session.saved.notes?.focus}</em></p>
      )}
      {endsToday && (
        // The week's last day: nothing left in it to plan, so say so and
        // point at planning the next one by talking.
        <div className="pv2-saved pv2-endsweek" role="note">
          <span className="pv2-saved-text"><b>Week {weekNo} ends today.</b> Open Chat to talk through the week ahead.</span>
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
