// src/components/plan/v2/WeekV2.tsx
//
// Week (docs/superpowers/specs/2026-10-04-planning-model-design.md). The page
// is the week's canvas (WeekViewV2) under its header. The eight-step session
// this file once ran is retired (2026-10-14).
//
// The header (calm pass 2, mockup approved 2026-10-18): one quiet fact line
// ("4 of 16 done", a bar, "Today: {first item}" — this week's
// count, as Month counts October; last week's lives in Looking back), at most
// one button, only the one that's due (reviewed design, 2026-10-20), and a ⋯
// menu (WeekMenu). On the desk they fold into HomeHeader's masthead; on a phone
// they are the page's own row. "Help me plan the rest of my week" lives in the
// Chat bar (WeekViewV2 still hands it the walk). There is no "I’m happy with
// this week": finishing the full deck marks the week planned.
//
// It is chrome AROUND the existing week: the canvas, drag and drop and
// add-to-day are WeekViewV2's, unchanged. Review (?review=1) and Plan
// (?plan=1) open the guided session on this same page: the plan chip in the
// header and one tooltip per step (2026-11-04), each step driving the month's
// fold beside the week. "Place them" (?place=1) opens Give them a day.

import { useContext, useEffect, useState, type ReactNode } from 'react'
import type { Task } from '@/types/task'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { usePlanningSession, weekToken } from '@/hooks/usePlanningSession'
import { usePeriodReview, type ReviewNotes } from '@/hooks/usePeriodReview'
import { usePlanningNotes } from '@/hooks/usePlanningNotes'
import { PeriodSummaryLine } from '@/components/guide/PeriodSummaryLine'
import type { WeekChoose } from '@/components/home/week/useChooseWeek'
import { GiveThemADay } from '@/components/plan/choose/GiveThemADay'
import { GuidedWeek } from '@/components/plan/guided/GuidedWeek'
import { useGuidedWeek } from '@/components/plan/guided/useGuidedWeek'
import { WeekLookBack } from '@/components/plan/guided/week/WeekLookBack'
import type { AllDayEvent } from '@/components/plan/guided/week/CalendarCheck'
import { PlanChip, usePlanSessionLoading } from '@/components/guide/GuideCoach'
import type { SessionFold } from '@/components/plan/guided/GuidedPeriod'
import type { Routine } from '@/types/actionable'
import type { ClashEvent } from '@/lib/guide/clashes'
import type { StripDay } from '@/components/plan/deck/WeekStrip'
import type { DeckCard, DeckMode } from '@/lib/planning/deck'
import type { DeckActions } from '@/components/home/week/useDeckActions'
import { REVIEW_WINDOW_DAYS, reviewTarget, weekPhrase } from '@/lib/planning/periodReview'
import { showToast } from '@/hooks/useToast'
import { PlanMastheadSlotsContext } from './planMastheadSlots'
import { WeekMenu } from './WeekMenu'
import { FamilyWeekLine } from './FamilyWeekLine'
import { rememberFolded } from '@/components/plan/fold/PaperFold'
import { localYmd } from '@/lib/cadence/config'

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
  onSeeAged: () => void
  /** Plan this week (spec 2026-10-19): Choose from the month, then Give them a day. */
  choose: WeekChoose
  /** The page's scoped tasks (the deck's list): the guided session counts
   *  the week from these, exactly what the page shows. */
  tasks?: readonly Task[]
  /** The week's timed events as the page draws them (the calendar check). */
  events?: readonly ClashEvent[]
  /** The week's all-day events, each with the days it covers (YYYY-MM-DD,
   *  inclusive): the calendar check lists them on each of those days. */
  allDayEvents?: readonly AllDayEvent[]
  /** The routines the page shows under its filters (Weekly ops lists them by day). */
  routines?: readonly Routine[]
  /** Hear of each write the week canvas saves (a drag onto a day, an add):
   *  on the choosing step it marks the week planned, as a Choose verb does.
   *  Returns the way to stop listening. */
  listenCanvasWrites?: (listener: () => void) => () => void
  /** Opens a task or goal in its panel (the page's selection). */
  openTask?: (id: string) => void
}

export function WeekV2({ weekStart, isCurrent, canvas, today, deck }: {
  weekStart: Date
  isCurrent: boolean
  /** The week at rest: WeekViewV2's canvas. A guided session asks for the
   *  same week, strip and all (the page never changes shape in a session;
   *  final review, 2026-11-04), with the month's fold driven by the
   *  session's step (`fold`: on the look back, last week with its choices). */
  canvas?: ReactNode | ((opts?: { fold?: SessionFold }) => ReactNode)
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
  // This week's own review (due on its last day) and next week's plan record.
  const thisReview = usePeriodReview('weekly', weekToken(weekStart))
  // What this week's planning left behind, for the everyday line. "Looked
  // back": this week's session did its Look back step, or last week's review
  // is recorded (what that step writes).
  const planNotes = usePlanningNotes('weekly', weekToken(weekStart))
  const [, setParams] = useSearchParams()
  const deckMode = deck?.mode ?? null
  const setMode = (mode: 'review' | 'plan' | 'place' | null, week?: Date, step?: string) => setParams((prev) => {
    const p = new URLSearchParams(prev)
    p.delete('review'); p.delete('plan'); p.delete('place'); p.delete('step')
    if (mode) p.set(mode, '1')
    if (mode && step) p.set('step', step)
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

  const endsToday = isCurrent && localYmd(new Date(weekStart.getTime() + 6 * DAY)) === localYmd(new Date())
  // A week that is over, or ends today, is reviewed, not planned.
  const plannable = !!deck?.available && !endsToday && weekStart.getTime() + 7 * DAY > new Date().getTime()
  // The deck on week W looks back at the week before it (its "Last week"
  // cards) and records that week's review. So reviewing this week opens the
  // deck on the week after it, and last week's review opens it here.
  const target = reviewTarget({ start: weekStart, end: nextWeek }, new Date(), REVIEW_WINDOW_DAYS.week)
  // Done planning the week (the guided session's last step) moves no leftover
  // (2026-11-04: nothing moves up; it keeps its week until the look back
  // answers it). Last week is recorded reviewed (what its look back said),
  // then this week is marked planned — unless it ends today: a week on its
  // last day is not marked planned.
  const closeWeek = async (lookDraft?: ReviewNotes | null): Promise<boolean> => {
    if (!deck) return true
    // Done is an explicit tap: Look back notes typed and not yet saved are
    // saved as the review, not dropped.
    const draft = lookDraft ? { wentWell: lookDraft.wentWell.trim(), didnt: lookDraft.didnt.trim() } : null
    if (!(await lastReview.finish(draft ?? lastReview.mine ?? { wentWell: '', didnt: '' }))) showToast('Couldn’t mark last week reviewed — try again.', 'error', 5000)
    else if (!endsToday && !(await markPlanned())) showToast('Couldn’t mark this week planned — try again.', 'error', 5000)
    // Done planning folds the month beside the week, and it stays folded.
    rememberFolded('week')
    return true
  }

  // ── The header ─────────────────────────────────────────────────────────
  // Planning is the plan chip ("Plan the week"; while a session runs,
  // "Planning the week · 2 of 7" with ✕), always there on a week that can be
  // planned (planning as tooltips, 2026-11-04). Besides it, one button at
  // most, only when due: on the week's last day, until reviewed, "Review this
  // week" — the deck on next week, which looks back at this one and records
  // its review. Nothing more while the deck is open.
  // ⋯ once also offered "Review last week" and "Plan next week early"
  // (removed 2026-10-31): the first opened the same deck as Plan this week,
  // and the second could never open (deckWeekAllowed lets next week's deck
  // open only on this week's last day, when "Review this week" is it).
  type Offer = { id: string; label: string; due: boolean; run: () => void }
  const settled = !session.loading && !thisReview.loading && !lastReview.loading
  const offers: Offer[] = deckMode || !deck || !settled ? [] : [
    ...(target === 'this' && isCurrent && !thisReview.error && !thisReview.reviewed
      ? [{ id: 'review', label: `Review ${reviewWord}`, due: true, run: () => setMode('plan', nextWeek, 'look-back') }] : []),
  ]
  const primary = offers.find((o) => o.due) ?? null
  // The fact line: this week's count and bar, and today's first item.
  const on = deck?.onThisWeek ?? 0, doneHere = deck?.doneThisWeek ?? 0
  const countText = `${doneHere} of ${on} done`
  // When it was planned is the summary line's now (one place, below).
  const progress = on > 0 ? <>
    <span className="wk-facts-count"><b>{doneHere}</b> of {on} done</span>
    <span className="wk-facts-bar" role="img" aria-label={countText}><span style={{ width: `${Math.round(doneHere / on * 1000) / 10}%` }} /></span>
  </> : null
  // Kept through a planning session (fix round 1): the week's facts and
  // its planned line stay in the header; only Give them a day hides them.
  const facts = deckMode !== 'place' && (progress || today) ? (
    <p className="wk-facts" data-explain="week-facts" data-explain-label="This week’s facts">
      {progress}{progress && today && ' · '}{today && <>Today: {today}</>}
    </p>
  ) : null
  const guide = planNotes.notes.guide
  const line = deckMode !== 'place' && !planNotes.error ? (
    <PeriodSummaryLine plannedAt={guide?.plannedAt ?? (!session.loading && !session.error ? session.saved?.at.toISOString() : undefined)} energy={planNotes.notes.energy}
      reviewed={!!guide?.done?.includes('look-back') || !!lastReview.reviewed} level="week" />
  ) : null
  const controls = (
    <>
      {(plannable || deckMode === 'full') && <PlanChip level="week" word="the week" onStart={() => setMode('plan')} />}
      {primary && <button type="button" className="pv2-btn wk-plan" onClick={primary.run} data-explain="plan-deck" data-explain-label={primary.label}>{primary.label}</button>}
      <WeekMenu offers={offers.filter((o) => o !== primary).map((o) => ({ id: o.id, label: o.label, onSelect: o.run }))} />
    </>
  )
  // A week gone by has nothing left to tell the family (its line is hidden).
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const weekGone = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7) <= todayStart
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
          {line && createPortal(line, slots.subline)}
          {createPortal(controls, slots.controls)}
        </>
      ) : (
        // Phone: the same reduction, as the page's own row under the masthead.
        <div className="wk-head">
          {facts ?? <span />}
          <div className="wk-head-actions">{controls}</div>
        </div>
      )}
      {!(slots?.subline && slots.controls) && line}

      {session.saved?.notes?.focus && (
        // What the week is for, as agreed when it was planned.
        <p className="wk-focus-line"><span>This week is for</span> <em>{session.saved.notes?.focus}</em></p>
      )}
      {endsToday && !primary && (
        // The week's last day: nothing left in it to plan, so say so and
        // point at the next week's Plan button.
        <div className="pv2-saved pv2-endsweek" role="note">
          <span className="pv2-saved-text"><b>This week ends today.</b> Use Plan on next week to plan the week ahead.</span>
        </div>
      )}
      {deckMode && deck
        // Drawn only once the tasks are in: no flash of an empty October.
        ? (deck.loading ? null : deckMode === 'full'
          ? <WeekSession key={localYmd(weekStart)} weekStart={weekStart} deck={deck} lastReview={lastReview}
              canvas={(fold) => typeof canvas === 'function' ? canvas({ fold }) : canvas}
              onFinish={closeWeek} onClose={() => { setMode(null); planNotes.reload() }}
              onPlanned={() => { session.reload(); planNotes.reload() }} />
          : <section className="deck choose-flow" aria-label="Plan this week">
              <GiveThemADay days={deck.stripDays} items={deck.choose.placeItems} placedCount={deck.choose.placedCount}
                onLeave={() => setMode(null)} primary={{ label: 'Done', run: () => setMode(null) }} />
            </section>)
        : <div className="wk-canvas">{typeof canvas === 'function' ? canvas() : canvas}</div>}
      {/* Tell the family's home (planning as tooltips, Task 2): a quiet line
          under the week, every day and through the session. */}
      {deckMode !== 'place' && !weekGone && <FamilyWeekLine key={`family:${localYmd(weekStart)}`} weekStart={weekStart} />}
    </div>
  )
}

/** Planning the week (spec 2026-11-01): the guided session on this page.
 *  Mounted only while it runs, so its notes are read only then. */
function WeekSession({ weekStart, deck, lastReview, canvas, onFinish, onClose, onPlanned }: {
  weekStart: Date
  deck: WeekDeck
  /** Last week's review: Look back's notes save through it. */
  lastReview: ReturnType<typeof usePeriodReview>
  /** The week as the page draws it, its month fold driven by the step. */
  canvas: (fold: SessionFold) => ReactNode
  onFinish: (lookDraft: ReviewNotes | null) => Promise<boolean>
  onClose: () => void
  onPlanned: () => void
}) {
  // Look back's notes as typed, kept here so they outlive its step's body
  // (only the current step's body is drawn): nothing is lost on Next. Done
  // planning the week saves what is still unsaved.
  const [lookDraft, setLookDraft] = useState<ReviewNotes | null>(null)
  const guided = useGuidedWeek({ weekStart, count: deck.onThisWeek ?? 0, choose: deck.choose, onFinish: () => onFinish(lookDraft), onClose, onPlanned })
  // A write saved on the page itself (a task dragged onto a day) counts as
  // applied too: on the choosing step it marks the week planned, once.
  const { markPlannedOnce } = guided
  const listen = deck.listenCanvasWrites
  useEffect(() => listen?.(() => { void markPlannedOnce() }), [listen, markPlannedOnce])
  usePlanSessionLoading('week', guided.loading)
  const choose = deck.choose
  // The look back is on the sheet beside the week (last week, with its
  // choices). Every other step is the week's own page, pointed at by its
  // tooltip; the steps' old editors (calendar check, inbox, weekly ops, tell
  // the family) are not drawn in a session (2026-11-04: their place is the
  // week itself).
  const look = <WeekLookBack review={lastReview} draft={lookDraft} onDraft={setLookDraft} done={deck.doneLastWeek} outOf={deck.plannedLastWeek} alsoDone={deck.alsoDoneLastWeek}
    notDone={choose.notDoneLastWeek} looseEnds={choose.looseEnds ?? []} aged={deck.aged} onSeeAged={deck.onSeeAged} />
  // Where the session is comes first: no flash of step one before a resume.
  // The week stays drawn, as it is, while that loads (final review: the page
  // never changes shape in a session).
  return <GuidedWeek canvas={canvas} look={look} monthWord={guided.monthWord}
    progress={guided.loading ? null : guided.progress} saveError={guided.saveError} onJump={(id) => { void guided.jump(id) }}
    onNext={() => { void guided.next() }} onFinish={() => { void guided.done() }} onLeave={onClose} />
}
