// src/components/plan/v2/WeekV2.tsx
//
// Week (docs/superpowers/specs/2026-10-04-planning-model-design.md). Lists
// above the week are for looking; the week and the day are for doing (Scott,
// 2026-10-04). The page is the week's list beside its days. The month's list
// is one click away, plain, for reference — nothing on it has to come down.
// "Plan the week" opens the session, one kind of thing per step.
//
// It is chrome AROUND the existing week: the journal, the list, drag and drop,
// add-to-day and the week's planning session are WeekViewV2's, unchanged.

import { useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useGatedTaskActions } from '@/hooks/useGatedTaskActions'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { usePlanningSession, weekToken } from '@/hooks/usePlanningSession'
import { useAuth } from '@/hooks/useAuth'
import { showToast } from '@/hooks/useToast'
import { weekListTasks } from '@/lib/planning/weekList'
import { selectPeriodTasks } from '@/lib/planning/periodPage'
import { monthStartOf, monthsOfWeek } from '@/lib/planning/periodPlacement'
import { PlanMastheadSlotsContext } from './planMastheadSlots'
import { PlanMeetingBar, PlanSavedLine, PlanToolbar, PlanToolbarControls, PlanToolbarStatus, type PlanToolbarProps } from './PlanStatus'
import { GuideAnchor } from '@/components/guide/GuideBar'
import { EMPTY_TALLY, addToTally, decidedSentence, lookBackWhy, type Tally } from '@/lib/planning/v2/planTally'
import { lowerPlacement } from '@/lib/placement/model'
import { readSeasons } from '@/lib/cadence/seasons'
import { readCadenceConfig, localYmd } from '@/lib/cadence/config'
import { weekOfYear } from '@/lib/planning/horizonNumerals'
import { writePlanView, lineDropUpdates, lookBackOpen, dayNamedIn } from '@/lib/planning/v2/planV2'
import type { Task } from '@/types/task'
import type { LineActions, LineVM } from './PlanLine'
import { CloseOut, type CloseDecision } from './FocusDeck'
import { FromPaper } from './FromPaper'
import { WeekListV2 } from './WeekListV2'
import { WeekRow } from './WeekRow'
import { useAddArea } from './AddArea'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { planPeopleLens } from '@/lib/planning/peopleLens'
import { makePlanActions, timingRemoval } from '@/lib/planning/planActions'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { useDayPlan } from '@/hooks/useDayPlan'
import { committedTo } from '@/lib/placement/model'
import type { TaskContext } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { WeekStepMain, type PanelStep } from './WeekStepScreen'

const DAY = 86_400_000

/** What the days are asked to show at each planning step (WeekJournal). */
export interface DaysOptions {
  show?: 'all' | 'fixed'; routinesOpen?: boolean; readOnly?: boolean
  variant?: 'strip' | 'shape'; person?: string; members?: FamilyMember[]
}
/** The week's planning session, in steps (Scott, 2026-10-03: "more
 *  obviously sequential"): look back, the fixed points, fill the week, the
 *  finished plan. */
type WeekStep = 'lookback' | 'inbox' | 'between' | 'fixed' | 'ahead' | 'routines' | 'write' | 'plan'
/** Scott, 2026-10-03: "present it stepwise, in an organized way" — one kind
 *  of thing at a time. Last week · Inbox · Between us · What can't move ·
 *  Look ahead · Routines · Write the week (the month beside it, for
 *  reference — 2026-10-04) · The week. */
const WEEK_STEPS: { key: WeekStep; label: string }[] = [
  { key: 'lookback', label: 'Last week' }, { key: 'inbox', label: 'Inbox' }, { key: 'between', label: 'Between us' },
  { key: 'fixed', label: 'Can’t move' }, { key: 'ahead', label: 'Look ahead' }, { key: 'routines', label: 'Routines' },
  { key: 'write', label: 'Write the week' }, { key: 'plan', label: 'The week' },
]
/** Whether the month's list stands beside the week, remembered per device. */
const REF_KEY = 'symphony-week-ref'
const readRefOpen = () => { try { return localStorage.getItem(REF_KEY) === 'open' } catch { return false } }

export function WeekV2({ tasks, weekStart, meId, isCurrent, days, renderDays, onSelectTask, timingControl, dragEnabled = true, tools }: {
  /** Layer-filtered tasks, as the week receives them. */
  tasks: Task[]
  weekStart: Date
  meId: string | null
  isCurrent: boolean
  /** v1's session (WeekPlanHost) — v2 runs its own meeting instead. */
  onPlan?: () => void
  /** v1's list, no longer drawn in v2 (WeekListV2 carries the triage). */
  list?: ReactNode
  /** The week's own "when" control, as WeekViewV2 builds it. */
  timingControl?: (task: Task) => ReactNode
  /** Cards on the list drag onto the days (off on touch-width layouts). */
  dragEnabled?: boolean
  /** The week's display toggles (Routines), drawn in this toolbar. */
  tools?: ReactNode
  /** The journal of days, as WeekViewV2 builds it (a fixed node — tests). */
  days?: ReactNode
  /** The days, asked for what a planning step needs. Preferred over `days`. */
  renderDays?: (opts: DaysOptions) => ReactNode
  onSelectTask: (id: string) => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  // Arriving from the month's "Choose what week N takes on": ready to write.
  const arrivedToWrite = !!(location.state as { write?: boolean } | null)?.write
  const { user } = useAuth()
  const { toggleTask, updateTask, pushTask, updateTasksBulk, keepForward, dropCommitment, addTask, loading: tasksLoading } = useSupabaseTasks()
  const gated = useGatedTaskActions({ updateTask, pushTask, updateTasksBulk }, (id) => tasks.find((t) => t.id === id))
  const { members } = useFamilyMembers()
  const addArea = useAddArea()
  const { setPlanned, reschedule: rescheduleInstance } = useActionableInstances()
  const planActions = useMemo(() => makePlanActions({
    findTask: (id) => tasks.find((t) => t.id === id),
    updateTask: (id, u) => gated.updateTask(id, u),
    pushTask: (id, target) => gated.pushTask(id, target),
    setRoutinePlanned: (id, day, planned) => setPlanned('routine', id, day, planned),
    rescheduleRoutine: (id, from, when) => rescheduleInstance('routine', id, from, when),
    notify: (m) => showToast(m, 'warning'),
  }), [tasks, gated, setPlanned, rescheduleInstance])
  const session = usePlanningSession('weekly', weekToken(weekStart))
  const [refOpen, setRefOpenState] = useState(readRefOpen)
  const setRefOpen = (open: boolean) => { setRefOpenState(open); try { localStorage.setItem(REF_KEY, open ? 'open' : 'shut') } catch { /* this visit only */ } }

  // The week's own month (its middle day) names it; the reference shows every
  // month the week touches, so a week across a month end shows both plans.
  const monthStart = useMemo(() => monthStartOf(new Date(weekStart.getTime() + 3 * DAY)), [weekStart])
  const refMonths = useMemo(() => monthsOfWeek(weekStart).map((start) => {
    const name = start.toLocaleDateString('en-US', { month: 'long' })
    // Legacy undated rows answer to the current period: the week's own month.
    const current = isCurrent && start.getTime() === monthStart.getTime()
    // The whole list, kept intact for its own review (look, don't link):
    // what has come into a week says so; what is done stays, struck.
    const rows = selectPeriodTasks(tasks, 'month', start, current, meId, readSeasons())
      .sort((a, b) => Number(a.completed) - Number(b.completed))
    return { start, name, rows }
  }), [tasks, weekStart, monthStart, isCurrent, meId])
  const monthName = refMonths.map((m) => m.name).join(' and ')
  // The people filter (in the top bar) narrows the week's list; the
  // month beside it and last week's look-back keep their own scope.
  const [people] = useAssigneeFilter()
  const lens = useMemo(() => planPeopleLens(people, meId), [people, meId])
  // A task planned for this week's weekend with no day of its own stands in
  // the days' "Sometime this weekend", not on the list (spec §5).
  const weekTasks = useMemo(() => {
    const end = weekStart.getTime() + 7 * DAY
    const inWeekend = (t: Task) => !!t.weekendStart && !t.scheduledFor && t.weekendStart.getTime() >= weekStart.getTime() && t.weekendStart.getTime() < end
    return weekListTasks(tasks, weekStart, lens.scopeId, { isCurrent }).filter(lens.keep).filter((t) => !inWeekend(t))
  }, [tasks, weekStart, lens, isCurrent])
  const nextWeek = useMemo(() => new Date(weekStart.getTime() + 7 * DAY), [weekStart])
  const prevWeek = useMemo(() => new Date(weekStart.getTime() - 7 * DAY), [weekStart])
  const prevTasks = useMemo(() => weekListTasks(tasks, prevWeek, meId, { isCurrent: false }), [tasks, prevWeek, meId])
  const [meeting, setMeeting] = useState<null | { step: WeekStep; candidateIds: string[] }>(null)
  const daysFor = (opts: DaysOptions) => (renderDays ? renderDays(opts) : days)
  // The steps' own material, read only while a session is open.
  const [focus, setFocus] = useState('')
  const [person, setPerson] = useState('all')

  const toVM = (t: Task, anyDay: string): LineVM => ({
    task: t, fate: t.completed ? 'done' : 'open', partOf: null,
    where: t.scheduledFor ? t.scheduledFor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : anyDay,
  })
  const lines: LineVM[] = weekTasks.map((t) => toVM(t, 'Any day this week'))
  const prevLines: LineVM[] = prevTasks.map((t) => toVM(t, 'Any day last week'))
  // Unfinished work from earlier — days missed inside the 14-day window, lists
  // older weeks left behind — is decided in the look-back, after last week's
  // own lines (Scott, 2026-10-03: "move earlier into look back"). Listed under
  // the month it buried the plan the column is there to show.
  const now = useMemo(() => new Date(), [])
  const { plan: dayPlan } = useDayPlan(now, weekStart)
  const onLastWeek = new Set(prevTasks.map((t) => t.id))
  const earlierLines: LineVM[] = (dayPlan?.unfinished ?? []).flatMap((e) =>
    e.task && !e.completed && !onLastWeek.has(e.task.id) && !committedTo(e.task, 'week', weekStart, { isCurrent })
      ? [{ ...toVM(e.task, 'Not in a week yet'), origin: e.context ?? 'Unfinished' }]
      : [])
  const actions: LineActions = {
    done: async (t) => { if ((await toggleTask(t.id)) !== false) showToast(t.completed ? `Reopened “${t.title}”.` : `Done — “${t.title}”.`, 'success', 5000, { label: 'Undo', onClick: () => { void toggleTask(t.id) } }) },
    carry: async (t) => { if (await keepForward(t.id, { weekStart: nextWeek }, weekStart)) showToast(`“${t.title}” moved to next week.`, 'success', 5000) },
    someday: async (t) => { await gated.updateTask(t.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined }); showToast(`“${t.title}” → Someday.`, 'success', 5000) },
    drop: async (t) => { if (await dropCommitment(t.id, 'week', weekStart)) showToast(`Dropped “${t.title}” from this week. It’s in the Inbox if you want it back.`, 'success', 6000) },
    assign: (t, ids) => { void gated.updateTask(t.id, { assignedToAll: ids, assignedTo: ids[0] ?? undefined }) },
    details: (t) => onSelectTask(t.id),
    rename: (t, title) => { void updateTask(t.id, { title }) },
    openPartOf: (link) => navigate(`/task/${link.id}`),
    today: async (t) => { if (await planActions.chooseTaskDay(t.id, new Date())) showToast(`“${t.title}” is on today — any time.`, 'success', 5000) },
  }

  const [tally, setTally] = useState<Tally>(EMPTY_TALLY)
  const [justSaved, setJustSaved] = useState<null | { detail: string }>(null)
  const decide = async (vm: LineVM, d: CloseDecision) => {
    const t = vm.task
    setTally((x) => addToTally(x, d))
    if (vm.origin && (d === 'carried' || d === 'dropped')) {
      // Earlier work isn't on last week's list: it comes in as this week's,
      // any day, or lets go of its old day and week (to the Inbox, or the
      // month it still belongs to).
      await gated.updateTask(t.id, d === 'carried' ? lineDropUpdates(t, { kind: 'week', at: weekStart }) : timingRemoval(t, 'all').updates)
    }
    else if (d === 'carried') {
      await keepForward(t.id, { weekStart }, prevWeek)
      // A row that had a day last week comes into this week as "any day",
      // not still pinned to a past Monday.
      if (t.scheduledFor) await gated.updateTask(t.id, timingRemoval(t, 'day').updates)
    }
    else if (d === 'done') { if (!t.completed) await toggleTask(t.id) }
    else if (d === 'someday') await gated.updateTask(t.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
    else if (d === 'dropped') await dropCommitment(t.id, 'week', prevWeek)
  }
  // "Plan this week" read as a gate you had to pass before adding anything
  // (Scott, 2026-09-29). It is the REVIEW: close out what the last period
  // left, write this one with the level above beside it, agree it. It asks
  // for attention only while there is a review to do — the period not yet
  // agreed, or the last one leaving undecided lines — and is quiet after.
  // Last week's open work, dated rows included: the work given a day was
  // the most firmly meant, and the review skipped it — "Talk to Tim on
  // Monday" surfaced only as a footnote (walkthrough 2026-10-02 #33). Open
  // only from that week's last day on (#34).
  const reviewIds = lookBackOpen('week', weekStart, new Date())
    ? [...prevTasks.filter((t) => !t.completed && (!t.scheduledFor || t.scheduledFor < weekStart)).map((t) => t.id), ...earlierLines.map((l) => l.task.id)]
    : []
  const reviewDue = !session.saved || reviewIds.length > 0
  const startMeeting = () => {
    const candidateIds = reviewIds
    setTally(EMPTY_TALLY)
    setJustSaved(null)
    setMeeting({ step: candidateIds.length ? 'lookback' : 'inbox', candidateIds })
    setFocus(session.mine?.focus ?? session.saved?.notes?.focus ?? '')
    setPerson('all')
    window.scrollTo({ top: 0 })
  }
  const endMeeting = async (keep: boolean) => {
    if (keep) {
      if (!(await session.save({ wentWell: session.mine?.wentWell ?? '', didnt: session.mine?.didnt ?? '', focus: focus.trim() || undefined }))) { showToast('Couldn’t save the plan — try again.', 'error', 5000); return }
      setJustSaved({ detail: decidedSentence(tally, 'Last week') })
    }
    setMeeting(null)
  }
  useEffect(() => {
    const open = () => startMeeting()
    window.addEventListener('pv2:plan-week', open)
    return () => window.removeEventListener('pv2:plan-week', open)
  })
  // Rare and quiet (Scott, 2026-10-04): a month line can come into the week
  // as it is. It stays on the month's list, which keeps its own review.
  const takeIn = async (t: Task, month: string) => {
    await gated.updateTask(t.id, { bucket: 'week', weekStart })
    showToast(`“${t.title}” → this week · still on ${month}’s list.`, 'success', 4000)
  }
  const agreedBy = session.saved
    ? (session.saved.authorId === user?.id ? 'you' : members.find((m) => m.auth_user_id === session.saved!.authorId)?.name ?? 'your household')
    : null
  const weekNo = weekOfYear(weekStart, readCadenceConfig().weekStartsOn)
  const endsToday = isCurrent && localYmd(new Date(weekStart.getTime() + 6 * DAY)) === localYmd(new Date())
  const toolbar: PlanToolbarProps = {
    period: `week ${weekNo}`, saved: session.saved, loading: session.loading, error: !!session.error, agreedBy,
    reviewDue, onPlan: startMeeting, onRetry: session.reload,
    // On its last day the week offers the next one instead (one primary).
    planLabel: endsToday ? undefined : 'Plan the week',
    // On its last day the week offers the next one instead (the line under
    // the masthead); marking a finished week planned would be a second
    // primary beside it.
    lookBack: reviewIds.length ? 'last week' : null, onMark: endsToday ? undefined : () => void endMeeting(true), hasLines: lines.length > 0,
    tools: tools && <div className="pv2-wtools">{tools}</div>,
    justSaved: justSaved && {
      detail: justSaved.detail,
      // Today opens with the week beside it — the thing to choose from. A
      // week planned ahead hands back to Today too, rather than leave only
      // "Done for now" (walkthrough 2026-10-02 #23).
      next: isCurrent
        ? { label: 'Pick something for today', onClick: () => { writePlanView('today', 'ref'); navigate('/today') } }
        : { label: 'Back to Today', onClick: () => navigate('/today') },
      onDone: () => setJustSaved(null),
    },
  }
  // HomeHeader's masthead, when it offers a place for the folded row
  // (desktop only; HomeView decides).
  const slots = useContext(PlanMastheadSlotsContext)

  const weekList = ({ focus }: { focus: boolean }) => (
    <WeekListV2 title={isCurrent ? 'This week' : `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
      hint="What we mean to get done. Give it a day only if it needs one."
      lines={lines} weekStart={weekStart} members={members} actions={actions} timingControl={timingControl}
      onContext={(t, c: TaskContext | undefined) => { void gated.updateTask(t.id, { context: c }) }}
      onAdd={async (title) => {
        // "Talk to Tim on Monday" lands on Monday, in one write.
        const day = dayNamedIn(title, weekStart, new Date())
        const id = await addTask(title, undefined, undefined, day ?? undefined, { bucket: 'week', weekStart, assignedTo: meId ?? undefined, context: addArea.area, ...(day ? { isAllDay: true } : {}) })
        if (id && day) showToast(`“${title}” → ${day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}, any time.`, 'success', 5000)
      }}
      focusAdd={focus}
      addPicker={addArea.picker}
      dragEnabled={dragEnabled} headerAction={<FromPaper altitude="week" periodStart={weekStart} tasks={tasks} />}
      emptyHint="Nothing on this week yet. Add the first thing below." />
  )
  // The month's list, plain, for reference (Scott, 2026-10-04: "they're just
  // lists"). No goals, no steps: a line can come into the week, quietly, and
  // stays on the month either way.
  const monthRef = (onHide?: () => void) => (
    <aside className="pv2-ref wk-ref" aria-label={`${monthName}, for reference`}>
      {refMonths.map((m) => (
        <div key={m.name} className="pv2-refmonth">
          <div className="pv2-colh">{m.name} <small>for reference</small>
            {onHide && <button type="button" className="pv2-link pv2-quiet wk-refhide" onClick={onHide}>Hide</button>}
          </div>
          {m.rows.length ? (
            <ul className="pv2-list">{m.rows.map((t) => {
              const lower = t.completed ? null : lowerPlacement(t, 'month', m.start)
              return (
                <WeekRow key={t.id} mark="line" title={t.title} completed={t.completed} onOpen={() => onSelectTask(t.id)}
                  drag={dragEnabled && !t.completed && !lower ? { id: `ref:${t.id}`, data: { kind: 'refLine', taskId: t.id } } : null}
                  meta={lower ? <span className="pv2-stepcount">{lower.kind === 'week' && localYmd(lower.weekStart) === localYmd(weekStart) ? 'On this week'
                    : lower.kind === 'carried' ? lower.label.replace(/^./, (c) => c.toUpperCase()) : `On ${lower.label}`}</span> : undefined}
                  trailing={!t.completed && !lower ? <span className="pv2-refacts">
                    <button type="button" className="pv2-addbtn" onClick={() => void takeIn(t, m.name)} aria-label={`Add ${t.title} to this week`}>Add to this week</button>
                  </span> : undefined} />
              )
            })}</ul>
          ) : <p className={`pv2-hint${tasksLoading ? '' : ' ds-empty-body'}`}>{tasksLoading ? 'Loading…' : `Nothing written for ${m.name}. That’s fine.`}</p>}
          <button type="button" className="pv2-link" style={{ marginTop: 8 }} onClick={() => navigate(`/month?start=${localYmd(m.start)}`)}>Open {m.name} →</button>
        </div>
      ))}
    </aside>
  )

  return (
    <div className="pv2-week" data-week={localYmd(weekStart)}>
      {meeting ? (
        <PlanMeetingBar period={`week ${weekNo}`} prevName="last week" step={meeting.step === 'lookback' ? 1 : 2} lookBack={meeting.candidateIds.length > 0}
          steps={WEEK_STEPS.filter((st) => st.key !== 'lookback' || meeting.candidateIds.length > 0)}
          stepKey={meeting.step} onStepKey={(step) => setMeeting({ ...meeting, step: step as WeekStep })}
          why={meeting.step === 'lookback' ? lookBackWhy(earlierLines.length ? 'Earlier weeks' : 'Last week', 'this week', meeting.candidateIds.length - (tally.carried + tally.done + tally.someday + tally.dropped + tally.left))
            : meeting.step === 'inbox' ? 'Sort what was captured: into this week, kept for someday, or done.'
            : meeting.step === 'between' ? 'What you’re waiting on, and what to talk through together.'
            : meeting.step === 'fixed' ? 'These can’t move: appointments, events and timed work. Add anything that’s missing, then plan around them.'
            : meeting.step === 'ahead' ? 'The next three weeks: anything coming that needs a start this week?'
            : meeting.step === 'routines' ? 'Routines, one kind at a time. Each group asks only what it needs.'
            : meeting.step === 'write' ? `Write what you mean to get done this week; give a day only to what needs one. ${monthName} is beside you for reference — nothing on it has to come down.`
            : 'This is your week: what it’s for, what’s free, and who carries what. Mark it planned when it looks right.'}
          onStep={(step) => setMeeting({ ...meeting, step: step === 1 ? 'lookback' : 'inbox' })}
          onLeave={() => void endMeeting(false)} onSave={() => void endMeeting(true)} saveLabel={`Mark week ${weekNo} planned`} />
      ) : slots?.subline && slots.controls ? (
        // Desktop: the control row folds into the week's masthead (HomeHeader
        // draws it; layout system 2026-10-01). The guide still opens here.
        <>
          <GuideAnchor />
          {createPortal(<PlanToolbarStatus {...toolbar} />, slots.subline)}
          {createPortal(<PlanToolbarControls {...toolbar} />, slots.controls)}
          <PlanSavedLine period={`week ${weekNo}`} justSaved={toolbar.justSaved} />
        </>
      ) : <PlanToolbar {...toolbar} />}

      {!meeting && session.saved?.notes?.focus && (
        // What the week is for, as agreed when it was planned.
        <p className="wk-focus-line"><span>This week is for</span> {session.saved.notes?.focus}</p>
      )}
      {endsToday && !meeting && (
        // The week's last day: nothing left in it to plan, so say so and
        // offer the next one (walkthrough 2026-10-02 #18).
        <div className="pv2-saved pv2-endsweek" role="note">
          <span className="pv2-saved-text"><b>Week {weekNo} ends today.</b> Plan the week ahead while it’s fresh.</span>
          <button type="button" className="pv2-btn" onClick={() => navigate(`/week?start=${localYmd(nextWeek)}`, { state: { write: true } })}>Plan week {weekOfYear(nextWeek, readCadenceConfig().weekStartsOn)} →</button>
        </div>
      )}
      {meeting?.step === 'lookback' ? (
        <CloseOut lines={[...prevLines, ...earlierLines]} candidateIds={meeting.candidateIds} members={members} actions={actions} prevName="last week" nextName="this week"
          onDecide={decide} onFinish={() => setMeeting({ ...meeting, step: 'inbox' })} />
      ) : meeting && (meeting.step === 'inbox' || meeting.step === 'between' || meeting.step === 'ahead' || meeting.step === 'routines') ? (
        // One kind of thing at the left, the week filling up at the right.
        <div className="wk-step">
          <div className="wk-step-main">
            <WeekStepMain step={meeting.step as PanelStep} tasks={tasks} weekStart={weekStart} onSelectTask={onSelectTask}
              onDone={(t) => void actions.done(t)} onSomeday={(t) => void actions.someday?.(t)}
              onThisWeek={(t) => { void gated.updateTask(t.id, { bucket: 'week', weekStart }); showToast(`“${t.title}” → this week.`, 'success', 4000) }} />
          </div>
          <aside className="wk-step-side" aria-label="Your week so far">
            <div className="pv2-colh">Your week so far</div>
            {daysFor({ variant: 'strip' })}
          </aside>
        </div>
      ) : meeting?.step === 'fixed' ? (
        // The fixed points: the days alone, only what can't move.
        <div className="wk-page">
          <section className="pv2-days wk-days" aria-label="The days">
            <div className="pv2-colh">What can’t move this week</div>
            {daysFor({ show: 'fixed' })}
          </section>
        </div>
      ) : meeting?.step === 'plan' ? (
        // The week: what it's for, each day's shape, and who carries what.
        <div className="wk-page">
          <label className="wk-focus"><span>This week is for…</span>
            <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="One line: what would make this a good week?" />
          </label>
          <div className="wk-people-pick" role="group" aria-label="Show whose week">
            {[{ id: 'all', name: 'Everyone' }, ...members].map((m) => (
              <button key={m.id} type="button" className={`wk-chip${person === m.id ? ' is-on' : ''}`} aria-pressed={person === m.id} onClick={() => setPerson(m.id)}>{m.name}</button>
            ))}
          </div>
          <section className="pv2-days wk-days" aria-label="The days">
            {daysFor({ variant: 'shape', person, members })}
          </section>
        </div>
      ) : meeting?.step === 'write' ? (
        // Write the week, with the month beside it for reference.
        <div className="wk-write">
          {weekList({ focus: true })}
          {monthRef()}
        </div>
      ) : (
        // At rest: the week's list beside its days; the month one click away.
        <div className={`wk-page wk-clear${refOpen ? ' has-ref' : ''}`}>
          {refOpen && monthRef(() => setRefOpen(false))}
          <div className="wk-listcol">
            {weekList({ focus: arrivedToWrite })}
            {!refOpen && (
              <button type="button" className="wk-reflink" onClick={() => setRefOpen(true)}>
                <span>{monthName} list</span><small>for reference</small>
              </button>
            )}
          </div>
          <section className="pv2-days wk-days" aria-label="The days">{daysFor({})}</section>
        </div>
      )}
    </div>
  )
}
