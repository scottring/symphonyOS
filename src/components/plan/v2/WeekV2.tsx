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
// (?plan=1) open the guided session on this same page (spec 2026-11-01): the
// steps rail where the strip stands, the week beside it, the step's header
// in the conversation. "Place them" (?place=1) opens Give them a day.

import { useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { ReadMonth } from '@/components/plan/guided/week/ReadMonth'
import { CalendarCheck } from '@/components/plan/guided/week/CalendarCheck'
import { InboxStep } from '@/components/plan/guided/week/InboxStep'
import { ChooseStep } from '@/components/plan/guided/week/ChooseStep'
import { WeeklyOps } from '@/components/plan/guided/week/WeeklyOps'
import { TellFamily } from '@/components/plan/guided/week/TellFamily'
import type { Routine } from '@/types/actionable'
import type { ClashEvent } from '@/lib/guide/clashes'
import type { FamilyMember } from '@/types/family'
import type { StripDay } from '@/components/plan/deck/WeekStrip'
import type { DeckCard, DeckMode } from '@/lib/planning/deck'
import type { DeckActions } from '@/components/home/week/useDeckActions'
import { REVIEW_WINDOW_DAYS, reviewTarget, weekPhrase, weekReviewState } from '@/lib/planning/periodReview'
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
  /** The week's timed events as the page draws them (the calendar check). */
  events?: readonly ClashEvent[]
  /** Who a loose end can be handed to: the household, but not the viewer. */
  handOffTo?: readonly FamilyMember[]
  /** The routines the page shows under its filters (Weekly ops lists them by day). */
  routines?: readonly Routine[]
  /** Hear of each write the week canvas saves (a drag onto a day, an add):
   *  on the choosing step it marks the week planned, as a Choose verb does.
   *  Returns the way to stop listening. */
  listenCanvasWrites?: (listener: () => void) => () => void
}

export function WeekV2({ weekStart, isCurrent, canvas, today, deck }: {
  weekStart: Date
  isCurrent: boolean
  /** The week at rest: WeekViewV2's canvas. A guided session asks for it
   *  without its strip (its steps stand there). */
  canvas?: ReactNode | ((opts?: { hideStrip?: boolean }) => ReactNode)
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
  const closeWeek = async (lookDraft?: ReviewNotes | null): Promise<boolean> => {
    if (!deck) return true
    let drained = false
    try { drained = await deck.onFinish(new Set()) } catch { drained = false }
    if (!drained) return false
    // Done is an explicit tap: Look back notes typed and not yet saved are
    // saved as the review, not dropped.
    const draft = lookDraft ? { wentWell: lookDraft.wentWell.trim(), didnt: lookDraft.didnt.trim() } : null
    if (!(await lastReview.finish(draft ?? lastReview.mine ?? { wentWell: '', didnt: '' }))) showToast('Couldn’t mark last week reviewed — try again.', 'error', 5000)
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
      ? [{ id: 'review', label: `Review ${reviewWord}`, due: true, run: () => setMode('plan', nextWeek, 'look-back') }] : []),
    ...(plannable ? [{ id: 'plan', label: planned ? `Plan ${reviewWord} again` : `Plan ${reviewWord}`, due: !planned, run: () => setMode('plan') }] : []),
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
  const facts = !deckMode && (progress || today) ? (
    <p className="wk-facts" data-explain="week-facts" data-explain-label="This week’s facts">
      {progress}{progress && today && ' · '}{today && <>Today: {today}</>}
    </p>
  ) : null
  const guide = planNotes.notes.guide
  const line = !deckMode && !planNotes.error ? (
    <PeriodSummaryLine plannedAt={guide?.plannedAt ?? (!session.loading && !session.error ? session.saved?.at.toISOString() : undefined)} energy={planNotes.notes.energy}
      reviewed={!!guide?.done?.includes('look-back') || !!lastReview.reviewed} />
  ) : null
  const controls = (
    <>
      {primary && <button type="button" className="pv2-btn wk-plan" onClick={primary.run} data-explain="plan-deck" data-explain-label={primary.label}>{primary.label}</button>}
      <WeekMenu offers={offers.filter((o) => o !== primary).map((o) => ({ id: o.id, label: o.label, onSelect: o.run }))} />
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
          <span className="pv2-saved-text"><b>Week {weekNo} ends today.</b> Use Plan on next week to plan the week ahead.</span>
        </div>
      )}
      {deckMode && deck
        // Drawn only once the tasks are in: no flash of an empty October.
        ? (deck.loading ? null : deckMode === 'full'
          ? <WeekSession key={localYmd(weekStart)} weekStart={weekStart} isCurrent={isCurrent} deck={deck} lastReview={lastReview}
              canvas={typeof canvas === 'function' ? canvas({ hideStrip: true }) : canvas}
              onFinish={closeWeek} onClose={() => { setMode(null); planNotes.reload() }}
              onPlanned={() => { session.reload(); planNotes.reload() }} />
          : <section className="deck choose-flow" aria-label="Plan this week">
              <GiveThemADay days={deck.stripDays} items={deck.choose.placeItems} placedCount={deck.choose.placedCount}
                onLeave={() => setMode(null)} primary={{ label: 'Done', run: () => setMode(null) }} />
            </section>)
        : <div className="wk-canvas">{typeof canvas === 'function' ? canvas() : canvas}</div>}
    </div>
  )
}

const NO_TASKS: readonly Task[] = []
const NOBODY: readonly FamilyMember[] = []
const NO_ROUTINES: readonly Routine[] = []

/** Planning the week (spec 2026-11-01): the guided session on this page.
 *  Mounted only while it runs, so its notes are read only then. */
function WeekSession({ weekStart, isCurrent, deck, lastReview, canvas, onFinish, onClose, onPlanned }: {
  weekStart: Date
  isCurrent: boolean
  deck: WeekDeck
  /** Last week's review: Look back's notes save through it. */
  lastReview: ReturnType<typeof usePeriodReview>
  canvas: ReactNode
  onFinish: (lookDraft: ReviewNotes | null) => Promise<boolean>
  onClose: () => void
  onPlanned: () => void
}) {
  // Look back's notes as typed, kept here so they outlive its step's body
  // (only the current step's body is drawn): nothing is lost on Next. Done
  // planning the week saves what is still unsaved.
  const [lookDraft, setLookDraft] = useState<ReviewNotes | null>(null)
  const guided = useGuidedWeek({ weekStart, isCurrent, tasks: deck.tasks ?? NO_TASKS, choose: deck.choose, onFinish: () => onFinish(lookDraft), onClose, onPlanned })
  const [weekendDraft, setWeekendDraft] = useState<string | null>(null)
  const [familyDraft, setFamilyDraft] = useState<string | null>(null)
  // A write saved on the page itself (a task dragged onto a day) counts as
  // applied too: on the choosing step it marks the week planned, once.
  const { markPlannedOnce } = guided
  const listen = deck.listenCanvasWrites
  useEffect(() => listen?.(() => { void markPlannedOnce() }), [listen, markPlannedOnce])
  // Tell the family's reference list: the week's open Family items, from the
  // page's own scoped list.
  const tasks = deck.tasks ?? NO_TASKS
  const familyItems = useMemo(() => tasks.filter((t) => t.context === 'family' && !t.completed
    && weekReviewState(t, weekStart, { isCurrent }) !== undefined), [tasks, weekStart, isCurrent])
  // Where the session is comes first: no flash of step one before a resume.
  if (guided.loading) return null
  const choose = deck.choose
  // What each step shows inside the rail. Choose binds the session's own
  // Choose (its verbs mark the week planned); the earlier steps the page's.
  const bodies = {
    'look-back': <WeekLookBack review={lastReview} draft={lookDraft} onDraft={setLookDraft} done={deck.doneLastWeek} outOf={deck.plannedLastWeek} alsoDone={deck.alsoDoneLastWeek}
      notDone={choose.notDoneLastWeek} looseEnds={choose.looseEnds ?? []} members={deck.handOffTo ?? NOBODY} aged={deck.aged} onSeeAged={deck.onSeeAged} />,
    'read-month': <ReadMonth monthWord={choose.monthWord} lines={choose.lines} doneLines={choose.doneLines} />,
    calendar: <CalendarCheck weekStart={weekStart} events={deck.events ?? []} />,
    inbox: <InboxStep cards={deck.cards.filter((c) => c.source === 'inbox')} actions={deck.actions} />,
    choose: <ChooseStep count={guided.count} choose={guided.choose} days={deck.stripDays} />,
    ops: <WeeklyOps weekStart={weekStart} routines={deck.routines ?? NO_ROUTINES} draft={weekendDraft} onDraft={setWeekendDraft} />,
    family: <TellFamily weekStart={weekStart} familyItems={familyItems} draft={familyDraft} onDraft={setFamilyDraft} />,
  }
  return <GuidedWeek canvas={canvas} bodies={bodies} count={guided.count} monthWord={guided.monthWord}
    progress={guided.progress} saveError={guided.saveError} onJump={(id) => { void guided.jump(id) }} onLeave={onClose} />
}
