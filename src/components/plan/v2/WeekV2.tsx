// src/components/plan/v2/WeekV2.tsx
//
// Week, v2 (docs/planning/2026-09-28-planning-v2.md): the day column on the
// left — the part of the prototype Scott called "basically perfect" — and the
// week's list on the right, under the same toolbar the month wears (plan
// status · List / With <month> / One at a time · Plan this week).
//
// It is chrome AROUND the existing week: the journal, the list, drag and drop,
// add-to-day and the week's planning session are WeekViewV2's, unchanged.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useGatedTaskActions } from '@/hooks/useGatedTaskActions'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { usePlanningSession, weekToken } from '@/hooks/usePlanningSession'
import { useAuth } from '@/hooks/useAuth'
import { showToast } from '@/hooks/useToast'
import { weekListTasks } from '@/lib/planning/weekList'
import { selectPeriodTasks } from '@/lib/planning/periodPage'
import { monthStartOf, monthsOfWeek } from '@/lib/planning/periodPlacement'
import { PlanMeetingBar, PlanToolbar } from './PlanStatus'
import { EMPTY_TALLY, addToTally, lookBackWhy, tallySentence, type Tally } from '@/lib/planning/v2/planTally'
import { lowerPlacement } from '@/lib/placement/model'
import { goalOfTask } from '@/lib/planning/goalSupport'
import { readSeasons } from '@/lib/cadence/seasons'
import { readCadenceConfig, localYmd } from '@/lib/cadence/config'
import { weekOfYear } from '@/lib/planning/horizonNumerals'
import { readPlanView, writePlanView, lineDropUpdates, type PlanView } from '@/lib/planning/v2/planV2'
import type { Task } from '@/types/task'
import type { LineActions, LineVM } from './PlanLine'
import { FocusDeck, CloseOut, type CloseDecision } from './FocusDeck'
import { FromPaper } from './FromPaper'
import { ViewSwitch } from './ViewSwitch'
import { WeekListV2 } from './WeekListV2'
import { WeekRefShelves } from './RefShelves'
import { useAddArea } from './AddArea'
import { makePlanActions, timingRemoval } from '@/lib/planning/planActions'
import { useActionableInstances } from '@/hooks/useActionableInstances'
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
  const weekTasks = useMemo(() => weekListTasks(tasks, weekStart, meId, { isCurrent }), [tasks, weekStart, meId, isCurrent])
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
    if (d === 'carried') await keepForward(t.id, { weekStart }, prevWeek)
    else if (d === 'done') { if (!t.completed) await toggleTask(t.id) }
    else if (d === 'someday') await gated.updateTask(t.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
    else if (d === 'dropped') await dropCommitment(t.id, 'week', prevWeek)
  }
  // "Plan this week" read as a gate you had to pass before adding anything
  // (Scott, 2026-09-29). It is the REVIEW: close out what the last period
  // left, write this one with the level above beside it, agree it. It asks
  // for attention only while there is a review to do — the period not yet
  // agreed, or the last one leaving undecided lines — and is quiet after.
  const reviewIds = prevTasks.filter((t) => !t.completed && !t.scheduledFor).map((t) => t.id)
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
      const open = lines.filter((l) => l.fate === 'open').length
      const done = lines.filter((l) => l.fate === 'done').length
      const onADay = lines.filter((l) => l.fate === 'open' && l.task.scheduledFor).length
      setJustSaved({ detail: [`${open} on the list${open ? (onADay ? `, ${onADay} on a day` : ', none on a day yet') : ''}${done ? `, ${done} done` : ''}.`, tallySentence(tally, 'last week')].filter(Boolean).join(' ') })
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
  const openRef = useCallback((_kind: 'task' | 'routine', id: string) => onSelectTask(id), [onSelectTask])
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
  const takeInEarlier = async (t: Task) => {
    const undo = timingRemoval(t, 'all').previous
    if ((await gated.updateTask(t.id, lineDropUpdates(t, { kind: 'week', at: weekStart }))) === false) return
    showToast(`“${t.title}” → this week, any day.`, 'success', 5000, { label: 'Undo', onClick: () => { void gated.updateTask(t.id, undo) } })
  }
  const takeIn = async (t: Task, month: string) => {
    await gated.updateTask(t.id, { bucket: 'week', weekStart })
    showToast(`“${t.title}” → this week · still on ${month}’s plan.`, 'success', 4000)
  }
  const agreedBy = session.saved
    ? (session.saved.authorId === user?.id ? 'you' : members.find((m) => m.auth_user_id === session.saved!.authorId)?.name ?? 'your household')
    : null
  const weekNo = weekOfYear(weekStart, readCadenceConfig().weekStartsOn)
  // A month line shows how many steps this week serve it (walkthrough
  // 2026-09-30: nothing said "Hang porch plants" had a step this week).
  const stepsThisWeek = (id: string) => weekTasks.filter((x) => x.goalTaskId === id || x.sourceId === id).length
  const viewSwitch = <ViewSwitch view={view} onChange={setView} aboveName={monthName} />

  return (
    <div className="pv2-week" data-week={localYmd(weekStart)}>
      {meeting ? (
        <PlanMeetingBar period={`week ${weekNo}`} prevName="last week" step={meeting.step} lookBack={meeting.candidateIds.length > 0}
          why={meeting.step === 1 ? lookBackWhy('Last week', 'this week', meeting.candidateIds.length)
            : `Choose next steps from ${monthName}’s plan beside the list, or write your own. Nothing needs a day yet.`}
          onStep={(step) => setMeeting({ ...meeting, step })} viewSwitch={meeting.step === 2 ? viewSwitch : undefined}
          onLeave={() => void endMeeting(false)} onSave={() => void endMeeting(true)} saveLabel={`Mark week ${weekNo} planned`} />
      ) : (
        <PlanToolbar period={`week ${weekNo}`} saved={session.saved} loading={session.loading} error={!!session.error} agreedBy={agreedBy}
          reviewDue={reviewDue} onPlan={startMeeting} onRetry={session.reload} viewSwitch={viewSwitch}
          tools={tools && <div className="pv2-wtools">{tools}</div>}
          justSaved={justSaved && {
            detail: justSaved.detail,
            // Today opens with the week beside it — the thing to choose from.
            next: isCurrent ? { label: 'Pick something for today', onClick: () => { writePlanView('today', 'ref'); navigate('/today') } } : null,
            onDone: () => setJustSaved(null),
          }} />
      )}

      {meeting?.step === 1 ? (
        <CloseOut lines={prevLines} candidateIds={meeting.candidateIds} members={members} actions={actions} prevName="last week" nextName="this week"
          onDecide={decide} onFinish={() => setMeeting({ ...meeting, step: 2 })} />
      ) : view === 'focus' ? (
        <FocusDeck lines={lines} actions={actions} members={members} nextLabel="next week" context={`Week ${weekNo}`} label={`Week ${weekNo}`}
          empty={meeting
            ? `Nothing on this week yet. Choose next steps from ${monthName}’s plan, or add your own.`
            : `Nothing on this week yet. Add to the list, or choose “Plan week ${weekNo}” to pick from ${monthName}’s plan.`} />
      ) : (
        <div className={`pv2-wgrid${view === 'ref' ? ' is-ref' : ''}`}>
          {/* One spread: three columns, one heading line across them, no
              boxes (Scott, 2026-09-29: "a bunch of stuff randomly put down"). */}
          <section className="pv2-days" aria-label="The days"><div className="pv2-colh">The days</div>{days}</section>
          <div className="pv2-wside">
            <div>
              <WeekListV2 title={isCurrent ? 'This week’s list' : `List for the week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                lines={lines} weekStart={weekStart} members={members} actions={actions} timingControl={timingControl}
                onContext={(t, c: TaskContext | undefined) => { void gated.updateTask(t.id, { context: c }) }}
                onAdd={async (title) => { await addTask(title, undefined, undefined, undefined, { bucket: 'week', weekStart, assignedTo: meId ?? undefined, context: addArea.area }) }}
                addPicker={addArea.picker}
                parentOf={parentOf} onHoverParent={setLitParent} onShowParent={showParent}
                draftChild={childOf ? { id: childOf.id, title: childOf.title, isGoal: !!childOf.isGoal } : null}
                onDraftChild={(title) => { if (childOf) void addStep(childOf, title) }} onCancelChild={() => setChildOf(null)}
                dragEnabled={dragEnabled} headerAction={<FromPaper altitude="week" periodStart={weekStart} tasks={tasks} />}
                emptyHint={meeting
                  ? `Nothing on this week’s list yet. Choose next steps from ${monthName}’s plan beside it, or add your own below.`
                  : `Nothing on this week’s list yet. Add below, or choose “Plan week ${weekNo}” to pick from ${monthName}’s plan.`} />
            </div>
          </div>
          {view === 'ref' && (
            <aside className="pv2-ref" aria-label={`${monthName}, for reference`}>
              {refMonths.map((m) => (
                <div key={m.name} className="pv2-refmonth">
                  <div className="pv2-colh">{m.name} <small>(for reference)</small></div>
                  {m.rows.length ? (
                    <ul className="pv2-list">{m.rows.map((t) => (
                      <li key={t.id} data-ref-id={t.id} className={`pv2-rrow pv2-rrow-sans${litParent === t.id || childOf?.id === t.id ? ' is-linked' : ''}`}>
                        {t.isGoal ? <span className="pv2-goal is-small" aria-hidden="true" /> : <span className="pv2-dash" style={{ marginTop: 10 }} aria-hidden="true" />}
                        <button type="button" className="flex-1 text-left" onClick={() => onSelectTask(t.id)}>{t.title}
                          {stepsThisWeek(t.id) > 0 && <span className="pv2-stepcount block">{stepsThisWeek(t.id)} {stepsThisWeek(t.id) === 1 ? 'step' : 'steps'} this week</span>}</button>
                        <span className="pv2-refacts">
                          {!t.isGoal && <button type="button" className="pv2-addbtn" onClick={() => void takeIn(t, m.name)} aria-label={`Add ${t.title} to this week`}>+ This week</button>}
                          <button type="button" className="pv2-addbtn" onClick={() => setChildOf(t)}
                            aria-label={`Add a ${t.isGoal ? 'next step' : 'step'} for ${t.title} to this week`}>{t.isGoal ? '+ Next step' : '+ Step'}</button>
                        </span>
                      </li>
                    ))}</ul>
                  ) : <p className="pv2-hint">{tasksLoading ? 'Loading…' : `Nothing open on ${m.name}’s plan.`}</p>}
                  <button type="button" className="pv2-link" style={{ marginTop: 8 }} onClick={() => navigate(`/month?start=${localYmd(m.start)}`)}>Open {m.name} →</button>
                </div>
              ))}
              <WeekRefShelves weekStart={weekStart} isCurrent={isCurrent} onOpen={openRef} onTakeIn={(t) => void takeInEarlier(t)} />
            </aside>
          )}
        </div>
      )}
    </div>
  )
}
