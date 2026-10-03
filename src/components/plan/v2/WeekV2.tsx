// src/components/plan/v2/WeekV2.tsx
//
// Week, v2 (docs/planning/2026-09-28-planning-v2.md): the week's list and the
// day column — the part of the prototype Scott called "basically perfect" —
// under the same toolbar the month wears (plan status · List / With <month> /
// One at a time · Plan this week). Planning reads left to right (Scott,
// 2026-10-03: "source list first"): the month's plan, this week's list, then
// the days.
//
// It is chrome AROUND the existing week: the journal, the list, drag and drop,
// add-to-day and the week's planning session are WeekViewV2's, unchanged.

import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { goalOfTask } from '@/lib/planning/goalSupport'
import { readSeasons } from '@/lib/cadence/seasons'
import { readCadenceConfig, localYmd } from '@/lib/cadence/config'
import { weekOfYear } from '@/lib/planning/horizonNumerals'
import { readPlanView, writePlanView, lineDropUpdates, lookBackOpen, dayNamedIn, type PlanView } from '@/lib/planning/v2/planV2'
import type { Task } from '@/types/task'
import type { LineActions, LineVM } from './PlanLine'
import { FocusDeck, CloseOut, type CloseDecision } from './FocusDeck'
import { FromPaper } from './FromPaper'
import { ViewSwitch } from './ViewSwitch'
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

const DAY = 86_400_000

export function WeekV2({ tasks, weekStart, meId, isCurrent, days, onSelectTask, timingControl, dragEnabled = true, tools }: {
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
  /** The journal of days, as WeekViewV2 builds it. */
  days: ReactNode
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
  const [view, setViewState] = useState<PlanView>(() => readPlanView('week'))
  const setView = (v: PlanView) => { setViewState(v); writePlanView('week', v) }

  // The week's own month (its middle day) names it; the reference shows every
  // month the week touches, so a week across a month end shows both plans.
  const monthStart = useMemo(() => monthStartOf(new Date(weekStart.getTime() + 3 * DAY)), [weekStart])
  const refMonths = useMemo(() => monthsOfWeek(weekStart).map((start) => {
    const name = start.toLocaleDateString('en-US', { month: 'long' })
    // Legacy undated rows answer to the current period: the week's own month.
    const current = isCurrent && start.getTime() === monthStart.getTime()
    const rows = selectPeriodTasks(tasks, 'month', start, current, meId, readSeasons())
      .filter((t) => !t.completed && !lowerPlacement(t, 'month', start))
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
  const [meeting, setMeeting] = useState<null | { step: 1 | 2; candidateIds: string[] }>(null)

  const toVM = (t: Task, anyDay: string): LineVM => ({
    task: t, fate: t.completed ? 'done' : 'open', partOf: goalOfTask(t, tasks, readSeasons()),
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
    setMeeting({ step: candidateIds.length ? 1 : 2, candidateIds })
    // A meeting always opens with the month beside the week: choosing from it
    // is the meeting's job (it had opened in the last-used view, and "One at a
    // time" showed an empty week with nothing to choose from).
    setViewState('ref')
    window.scrollTo({ top: 0 })
  }
  const endMeeting = async (keep: boolean) => {
    if (keep) {
      if (!(await session.save({ wentWell: session.mine?.wentWell ?? '', didnt: session.mine?.didnt ?? '' }))) { showToast('Couldn’t save the plan — try again.', 'error', 5000); return }
      setJustSaved({ detail: decidedSentence(tally, 'Last week') })
    }
    setMeeting(null)
    setViewState(readPlanView('week'))
  }
  useEffect(() => {
    const open = () => startMeeting()
    window.addEventListener('pv2:plan-week', open)
    return () => window.removeEventListener('pv2:plan-week', open)
  })
  // A goal stays on its month; what goes into the week is its next step
  // (goal_task_id), the rule the week's own list and the month page follow.
  // "+ Next step" / "+ Step" open the new row ON THIS WEEK'S LIST, where it
  // will live, naming its month line — not a form under the month line
  // (Scott, 2026-09-28: "it should create it on this week's list and on
  // hover have a reference to the parent item in the month list").
  const [childOf, setChildOf] = useState<Task | null>(null)
  // The month line a hovered week row came from, lit in the month column.
  const [litParent, setLitParent] = useState<string | null>(null)
  const parentOf = useCallback((t: Task) => {
    const id = t.sourceId ?? t.goalTaskId
    const p = id ? tasks.find((x) => x.id === id) : undefined
    return p ? { id: p.id, title: p.title, isGoal: !!p.isGoal } : null
  }, [tasks])
  // Show the parent where it is: in the month column when it is on screen,
  // else its details.
  const showParent = (id: string) => {
    const el = document.querySelector<HTMLElement>(`[data-ref-id="${id}"]`)
    if (!el) { onSelectTask(id); return }
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash')
  }
  // A child of a month line, into this week (Scott, 2026-09-28: "spawn a child
  // task which then creates a new list item in this week's list"). Under a
  // goal it is the goal's next step (goal_task_id). Under a plain line it is a
  // new week task that remembers where it came from (source_id — "copied down
  // from", the cascade link) and serves the same goal; a subtask would not do,
  // because subtasks never appear on a week's list.
  const addStep = async (parent: Task, title: string) => {
    const link = parent.isGoal ? { goalTaskId: parent.id } : { sourceId: parent.id, goalTaskId: parent.goalTaskId }
    const id = await addTask(title, undefined, undefined, undefined, { bucket: 'week', weekStart, ...link, context: parent.context ?? undefined, assignedTo: meId ?? undefined })
    if (!id) return
    setChildOf(null)
    showToast(parent.isGoal ? `“${title}” → this week, as a step toward “${parent.title}”.` : `“${title}” → this week, from “${parent.title}”.`, 'success', 5000)
  }
  const takeIn = async (t: Task, month: string) => {
    await gated.updateTask(t.id, { bucket: 'week', weekStart })
    showToast(`“${t.title}” → this week · still on ${month}’s plan.`, 'success', 4000)
  }
  const agreedBy = session.saved
    ? (session.saved.authorId === user?.id ? 'you' : members.find((m) => m.auth_user_id === session.saved!.authorId)?.name ?? 'your household')
    : null
  const weekNo = weekOfYear(weekStart, readCadenceConfig().weekStartsOn)
  const endsToday = isCurrent && localYmd(new Date(weekStart.getTime() + 6 * DAY)) === localYmd(new Date())
  // A month line shows how many steps this week serve it (walkthrough
  // 2026-09-30: nothing said "Hang porch plants" had a step this week).
  const stepsThisWeek = (id: string) => weekTasks.filter((x) => x.goalTaskId === id || x.sourceId === id).length
  const viewSwitch = <ViewSwitch view={view} onChange={setView} aboveName={monthName} />
  const toolbar: PlanToolbarProps = {
    period: `week ${weekNo}`, saved: session.saved, loading: session.loading, error: !!session.error, agreedBy,
    reviewDue, onPlan: startMeeting, onRetry: session.reload, viewSwitch,
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

  return (
    <div className="pv2-week" data-week={localYmd(weekStart)}>
      {meeting ? (
        <PlanMeetingBar period={`week ${weekNo}`} prevName="last week" step={meeting.step} lookBack={meeting.candidateIds.length > 0}
          why={meeting.step === 1 ? lookBackWhy(earlierLines.length ? 'Earlier weeks' : 'Last week', 'this week', meeting.candidateIds.length - (tally.carried + tally.done + tally.someday + tally.dropped + tally.left))
            : lines.length
              ? `Check this week’s list against ${monthName}: keep what still matters, add what’s missing.`
              : `Choose next steps from ${monthName}’s plan beside the list, or write your own. Nothing needs a day yet.`}
          onStep={(step) => setMeeting({ ...meeting, step })} viewSwitch={meeting.step === 2 ? viewSwitch : undefined}
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

      {endsToday && !meeting && (
        // The week's last day: nothing left in it to plan, so say so and
        // offer the next one (walkthrough 2026-10-02 #18).
        <div className="pv2-saved pv2-endsweek" role="note">
          <span className="pv2-saved-text"><b>Week {weekNo} ends today.</b> Plan the week ahead while it’s fresh.</span>
          <button type="button" className="pv2-btn" onClick={() => { writePlanView('week', 'ref'); navigate(`/week?start=${localYmd(nextWeek)}`, { state: { write: true } }) }}>Plan week {weekOfYear(nextWeek, readCadenceConfig().weekStartsOn)} →</button>
        </div>
      )}
      {meeting?.step === 1 ? (
        <CloseOut lines={[...prevLines, ...earlierLines]} candidateIds={meeting.candidateIds} members={members} actions={actions} prevName="last week" nextName="this week"
          onDecide={decide} onFinish={() => setMeeting({ ...meeting, step: 2 })} />
      ) : view === 'focus' ? (
        <FocusDeck lines={lines} actions={actions} members={members} nextLabel="next week" context={`Week ${weekNo}`} label={`Week ${weekNo}`}
          empty={meeting
            ? `Nothing on this week yet. Choose next steps from ${monthName}’s plan, or add your own.`
            : `Nothing on this week yet. Switch to the list to add the first line.`} />
      ) : (
        <div className={`wk-page${view === 'ref' ? ' is-ref' : ''}`}>
          <div className="wk-sources">
          {/* The sources on top — the month's plan, this week's list — and the
              days across the full width below (Scott, 2026-10-03: "wasted
              space … maybe in a grid?"). Planning still moves source → list →
              day; the days are the biggest list, so they get the most room. */}
          {view === 'ref' && (
            <aside className="pv2-ref wk-sources-month" aria-label={`${monthName}, for reference`}>
              {refMonths.map((m) => (
                <div key={m.name} className="pv2-refmonth">
                  <div className="pv2-colh">{m.name} <small>(for reference)</small></div>
                  {m.rows.length ? (
                    <ul className="pv2-list">{m.rows.map((t) => (
                      // The same row every column draws; a month line drags onto
                      // the list or straight onto a day (one drag rule,
                      // 2026-10-03). A goal stays on its month: its next step
                      // is what comes into the week.
                      <WeekRow key={t.id} mark={t.isGoal ? 'goal' : 'line'} title={t.title} onOpen={() => onSelectTask(t.id)}
                        drag={dragEnabled && !t.isGoal ? { id: `ref:${t.id}`, data: { kind: 'refLine', taskId: t.id } } : null}
                        meta={stepsThisWeek(t.id) > 0 ? <span className="pv2-stepcount">In this week’s list</span> : undefined}
                        rowProps={{ 'data-ref-id': t.id, className: litParent === t.id || childOf?.id === t.id ? 'is-linked' : undefined }}
                        trailing={<span className="pv2-refacts">
                          {!t.isGoal && <button type="button" className="pv2-addbtn" onClick={() => void takeIn(t, m.name)} aria-label={`Add ${t.title} to this week`}>+ This week</button>}
                          {/* The same words the Month and Season pages use beside a
                              goal (walkthrough 2026-09-30: "+ Next step" here,
                              "+ Add" there). */}
                          <button type="button" className="pv2-addbtn" onClick={() => setChildOf(t)}
                            title={t.isGoal ? `Add week ${weekNo}’s next step for “${t.title}” — it stays linked to that goal` : `Add a step of “${t.title}” to week ${weekNo}`}
                            aria-label={`Add a ${t.isGoal ? 'next step' : 'step'} for ${t.title} to this week`}>{t.isGoal ? `+ Week ${weekNo}’s part` : '+ Step'}</button>
                        </span>} />
                    ))}</ul>
                  ) : <p className={`pv2-hint${tasksLoading ? '' : ' ds-empty-body'}`}>{tasksLoading ? 'Loading…' : `Nothing open on ${m.name}’s plan.`}</p>}
                  <button type="button" className="pv2-link" style={{ marginTop: 8 }} onClick={() => navigate(`/month?start=${localYmd(m.start)}`)}>Open {m.name} →</button>
                </div>
              ))}
            </aside>
          )}
          <div className="pv2-wside">
            <div>
              <WeekListV2 title={isCurrent ? 'This week’s list' : `List for the week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                lines={lines} weekStart={weekStart} members={members} actions={actions} timingControl={timingControl}
                onContext={(t, c: TaskContext | undefined) => { void gated.updateTask(t.id, { context: c }) }}
                onAdd={async (title) => {
                  // "Talk to Tim on Monday" lands on Monday, in one write.
                  const day = dayNamedIn(title, weekStart, new Date())
                  const id = await addTask(title, undefined, undefined, day ?? undefined, { bucket: 'week', weekStart, assignedTo: meId ?? undefined, context: addArea.area, ...(day ? { isAllDay: true } : {}) })
                  if (id && day) showToast(`“${title}” → ${day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}, any time.`, 'success', 5000)
                }}
                focusAdd={arrivedToWrite}
                addPicker={addArea.picker}
                parentOf={parentOf} onHoverParent={setLitParent} onShowParent={showParent}
                draftChild={childOf ? { id: childOf.id, title: childOf.title, isGoal: !!childOf.isGoal } : null}
                onDraftChild={(title) => { if (childOf) void addStep(childOf, title) }} onCancelChild={() => setChildOf(null)}
                dragEnabled={dragEnabled} headerAction={<FromPaper altitude="week" periodStart={weekStart} tasks={tasks} />}
                emptyHint={meeting
                  ? `Nothing on this week’s list yet. Choose next steps from ${monthName}’s plan beside it, or add your own below.`
                  : `Nothing on this week’s list yet. Add below, or take a step from ${monthName}’s plan beside it.`} />
            </div>
          </div>
          </div>
          <section className="pv2-days wk-days" aria-label="The days"><div className="pv2-colh">The days</div>{days}</section>
        </div>
      )}
    </div>
  )
}
