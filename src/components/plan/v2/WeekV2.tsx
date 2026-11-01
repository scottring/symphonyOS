// src/components/plan/v2/WeekV2.tsx
//
// Week (docs/superpowers/specs/2026-10-04-planning-model-design.md). The page
// is the week's canvas (WeekViewV2) under its header. The eight-step session
// this file once ran is retired (2026-10-14).
//
// The header (calm pass 2, mockup approved 2026-10-18): one quiet fact line
// ("4 of 16 done", a bar, "planned Sunday · Today: {first item}" — this week's
// count, as Month counts October; last week's lives in Looking back), at most
// one button, only the one that's due (reviewed design, 2026-10-20), and a ⋯
// menu (WeekMenu). On the desk they fold into HomeHeader's masthead; on a phone
// they are the page's own row. "Help me plan the rest of my week" lives in the
// Chat bar (WeekViewV2 still hands it the walk); a phone, which has no bar,
// gets "Talk it through" in the ⋯ menu instead. There is no "I’m happy with
// this week": finishing the full deck marks the week planned.
//
// It is chrome AROUND the existing week: the canvas, drag and drop and
// add-to-day are WeekViewV2's, unchanged. Review (?review=1) and Plan
// (?plan=1) open the guided session on this same page (spec 2026-11-01): the
// steps rail where the strip stands, the week beside it, the step's header
// in the conversation. "Place them" (?place=1) opens Give them a day.

import { useContext, type ReactNode } from 'react'
import type { Task } from '@/types/task'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { usePlanningSession, weekToken } from '@/hooks/usePlanningSession'
import { usePeriodReview } from '@/hooks/usePeriodReview'
import type { WeekChoose } from '@/components/plan/choose/PlanWeekFlow'
import { GiveThemADay } from '@/components/plan/choose/GiveThemADay'
import { GuidedWeek } from '@/components/plan/guided/GuidedWeek'
import { useGuidedWeek } from '@/components/plan/guided/useGuidedWeek'
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
  /** This week's count for the fact line: done, out of everything on it. */
  doneThisWeek?: number
  onThisWeek?: number
  /** Everything that was on last week, done or not (Looking back's "of"). */
  plannedLastWeek?: number
  /** Finished last week but not on it (Looking back's "Also done"). */
  alsoDoneLastWeek?: readonly { id: string; title: string }[]
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
  /** Plan this week (spec 2026-10-19): Choose from the month, then Give them a day. */
  choose: WeekChoose
  /** The page's scoped tasks (the deck's list): the guided session counts
   *  the week from these, exactly what the page shows. */
  tasks?: readonly Task[]
}

export function WeekV2({ weekStart, isCurrent, canvas, today, talk, deck }: {
  weekStart: Date
  isCurrent: boolean
  /** The week at rest: WeekViewV2's canvas. A guided session asks for it
   *  without its strip (its steps stand there). */
  canvas?: ReactNode | ((opts?: { hideStrip?: boolean }) => ReactNode)
  /** Today's first item, for the fact line ("Today: …"); null when there is
   *  none, the week is not this one, or it has not loaded. */
  today?: string | null
  /** Starts the planning conversation (the walk the Chat bar carries). Offered
   *  in the ⋯ menu on phones only, which have no Chat bar. */
  talk?: () => void
  /** The deck for Review, Plan and Place them (WeekViewV2). */
  deck?: WeekDeck
}) {
  const session = usePlanningSession('weekly', weekToken(weekStart))
  const phoneTalk = useMediaQuery('(max-width: 767px)') ? talk : undefined
  // Early in a week, the review on offer is last week's, until it is done.
  const lastWeek = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7)
  // One record of it: the page's when it passes one (an empty token reads
  // nothing), so finishing the deck updates the page's line too.
  const ownReview = usePeriodReview('weekly', deck?.lastReview ? '' : weekToken(lastWeek))
  const lastReview = deck?.lastReview ?? ownReview
  // This week's own review (due on its last day) and next week's plan record.
  const thisReview = usePeriodReview('weekly', weekToken(weekStart))
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
  // Done planning the week (the guided session's last step): the undealt
  // last-week leftovers go to Later or back to the month (WeekViewV2's drain),
  // then last week is recorded reviewed (what its look back said), then this
  // week is marked planned — unless it ends today: a week on its last day is
  // not marked planned. A drain that failed records nothing and keeps the
  // session open: the activity strip says why, and Done tries again.
  const closeWeek = async (): Promise<boolean> => {
    if (!deck) return true
    let drained = false
    try { drained = await deck.onFinish(new Set()) } catch { drained = false }
    if (!drained) return false
    if (!(await lastReview.finish(lastReview.mine ?? { wentWell: '', didnt: '' }))) showToast('Couldn’t mark last week reviewed — try again.', 'error', 5000)
    else if (!endsToday && !(await markPlanned())) showToast('Couldn’t mark this week planned — try again.', 'error', 5000)
    return true
  }

  // ── The header ─────────────────────────────────────────────────────────
  // One button at most, and only the one that's due — the rule every horizon
  // follows (reviewed design, 2026-10-20). Not planned yet: "Plan this week",
  // which opens on Looking back at last week. Planned: no button. Its last
  // day, until reviewed: "Review this week" — the deck on next week, which
  // looks back at this one and records its review. Reviewed: no button. The
  // rest waits in ⋯ ("Plan this week again"); nothing while the deck is open.
  // ⋯ once also offered "Review last week" and "Plan next week early"
  // (removed 2026-10-31): the first opened the same deck as Plan this week,
  // and the second could never open (deckWeekAllowed lets next week's deck
  // open only on this week's last day, when "Review this week" is it).
  type Offer = { id: string; label: string; due: boolean; run: () => void }
  const settled = !session.loading && !thisReview.loading && !lastReview.loading
  const planned = !session.error && !!session.saved
  const offers: Offer[] = deckMode || !deck || !settled ? [] : [
    ...(target === 'this' && isCurrent && !thisReview.error && !thisReview.reviewed
      ? [{ id: 'review', label: `Review ${reviewWord}`, due: true, run: () => setMode('plan', nextWeek) }] : []),
    ...(plannable ? [{ id: 'plan', label: planned ? `Plan ${reviewWord} again` : `Plan ${reviewWord}`, due: !planned, run: () => setMode('plan') }] : []),
  ]
  const primary = offers.find((o) => o.due) ?? null
  // The fact line: this week's count and bar, when it was planned, and
  // today's first item.
  const on = deck?.onThisWeek ?? 0, doneHere = deck?.doneThisWeek ?? 0
  const countText = `${doneHere} of ${on} done`
  const plannedOn = !session.loading && !session.error && session.saved
    ? `planned ${session.saved.at.toLocaleDateString('en-US', { weekday: 'long' })}` : null
  const progress = on > 0 || plannedOn ? <>
    {on > 0 && <><span className="wk-facts-count"><b>{doneHere}</b> of {on} done</span>
      <span className="wk-facts-bar" role="img" aria-label={countText}><span style={{ width: `${Math.round(doneHere / on * 1000) / 10}%` }} /></span></>}
    {plannedOn && <>{on > 0 && ' · '}<b className="wk-facts-reviewed">{plannedOn}</b></>}
  </> : null
  const facts = !deckMode && (progress || today) ? (
    <p className="wk-facts" data-explain="week-facts" data-explain-label="This week’s facts">
      {progress}{progress && today && ' · '}{today && <>Today: {today}</>}
    </p>
  ) : null
  const controls = (
    <>
      {primary && <button type="button" className="pv2-btn wk-plan" onClick={primary.run} data-explain="plan-deck" data-explain-label={primary.label}>{primary.label}</button>}
      <WeekMenu talk={phoneTalk} offers={offers.filter((o) => o !== primary).map((o) => ({ id: o.id, label: o.label, onSelect: o.run }))} />
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
      {endsToday && !primary && (
        // The week's last day: nothing left in it to plan, so say so and
        // point at planning the next one by talking.
        <div className="pv2-saved pv2-endsweek" role="note">
          <span className="pv2-saved-text"><b>Week {weekNo} ends today.</b> {phoneTalk
            ? <>Use “Talk it through” under ⋯ to talk through the week ahead.</>
            : <>Open Chat to talk through the week ahead.</>}</span>
        </div>
      )}
      {deckMode && deck
        // Drawn only once the tasks are in: no flash of an empty October.
        ? (deck.loading ? null : deckMode === 'full'
          ? <WeekSession key={localYmd(weekStart)} weekStart={weekStart} isCurrent={isCurrent} deck={deck}
              canvas={typeof canvas === 'function' ? canvas({ hideStrip: true }) : canvas}
              onFinish={closeWeek} onClose={() => setMode(null)} onPlanned={session.reload} />
          : <section className="deck choose-flow" aria-label="Plan this week">
              <GiveThemADay days={deck.stripDays} items={deck.choose.placeItems} placedCount={deck.choose.placedCount}
                onLeave={() => setMode(null)} primary={{ label: 'Done', run: () => setMode(null) }} />
            </section>)
        : <div className="wk-canvas">{typeof canvas === 'function' ? canvas() : canvas}</div>}
    </div>
  )
}

const NO_TASKS: readonly Task[] = []

/** Planning the week (spec 2026-11-01): the guided session on this page.
 *  Mounted only while it runs, so its notes are read only then. */
function WeekSession({ weekStart, isCurrent, deck, canvas, onFinish, onClose, onPlanned }: {
  weekStart: Date
  isCurrent: boolean
  deck: WeekDeck
  canvas: ReactNode
  onFinish: () => Promise<boolean>
  onClose: () => void
  onPlanned: () => void
}) {
  const guided = useGuidedWeek({ weekStart, isCurrent, tasks: deck.tasks ?? NO_TASKS, choose: deck.choose, onFinish, onClose, onPlanned })
  // Where the session is comes first: no flash of step one before a resume.
  if (guided.loading) return null
  return <GuidedWeek canvas={canvas} bodies={{}} count={guided.count} monthWord={guided.monthWord}
    progress={guided.progress} saveError={guided.saveError} onJump={(id) => { void guided.jump(id) }} onLeave={onClose} />
}
