// src/components/plan/v2/WeekV2.tsx
//
// Week, v2 (docs/planning/2026-09-28-planning-v2.md): the day column on the
// left — the part of the prototype Scott called "basically perfect" — and the
// week's list on the right, under the same toolbar the month wears (plan
// status · List / With <month> / One at a time · Plan this week).
//
// It is chrome AROUND the existing week: the journal, the list, drag and drop,
// add-to-day and the week's planning session are WeekViewV2's, unchanged.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useGatedTaskActions } from '@/hooks/useGatedTaskActions'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { usePlanningSession, weekToken } from '@/hooks/usePlanningSession'
import { useAuth } from '@/hooks/useAuth'
import { showToast } from '@/hooks/useToast'
import { weekListTasks } from '@/lib/planning/weekList'
import { selectPeriodTasks } from '@/lib/planning/periodPage'
import { monthStartOf } from '@/lib/planning/periodPlacement'
import { lowerPlacement } from '@/lib/placement/model'
import { goalOfTask } from '@/lib/planning/goalSupport'
import { readSeasons } from '@/lib/cadence/seasons'
import { readCadenceConfig, localYmd } from '@/lib/cadence/config'
import { weekOfYear } from '@/lib/planning/horizonNumerals'
import { readPlanView, writePlanView, type PlanView } from '@/lib/planning/v2/planV2'
import type { Task } from '@/types/task'
import type { LineActions, LineVM } from './PlanLine'
import { FocusDeck, CloseOut, type CloseDecision } from './FocusDeck'
import { FromPaper } from './FromPaper'
import { WeekListV2 } from './WeekListV2'
import { useDomain } from '@/hooks/useDomain'
import type { TaskContext } from '@/types/task'

const DAY = 86_400_000
const shortDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

export function WeekV2({ tasks, weekStart, meId, isCurrent, days, onSelectTask, timingControl }: {
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
  /** The journal of days, as WeekViewV2 builds it. */
  days: ReactNode
  onSelectTask: (id: string) => void
}) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { toggleTask, updateTask, pushTask, updateTasksBulk, keepForward, dropCommitment, addTask } = useSupabaseTasks()
  const gated = useGatedTaskActions({ updateTask, pushTask, updateTasksBulk }, (id) => tasks.find((t) => t.id === id))
  const { members } = useFamilyMembers()
  const { soleDomain } = useDomain()
  const session = usePlanningSession('weekly', weekToken(weekStart))
  const [view, setViewState] = useState<PlanView>(() => readPlanView('week'))
  const setView = (v: PlanView) => { setViewState(v); writePlanView('week', v) }

  const monthStart = useMemo(() => monthStartOf(new Date(weekStart.getTime() + 3 * DAY)), [weekStart])
  const monthName = monthStart.toLocaleDateString('en-US', { month: 'long' })
  const monthRows = useMemo(() => selectPeriodTasks(tasks, 'month', monthStart, isCurrent, meId, readSeasons())
    .filter((t) => !t.completed && !lowerPlacement(t, 'month', monthStart)), [tasks, monthStart, isCurrent, meId])
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
  }

  const decide = async (vm: LineVM, d: CloseDecision) => {
    const t = vm.task
    if (d === 'carried') await keepForward(t.id, { weekStart }, prevWeek)
    else if (d === 'done') { if (!t.completed) await toggleTask(t.id) }
    else if (d === 'someday') await gated.updateTask(t.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
    else if (d === 'dropped') await dropCommitment(t.id, 'week', prevWeek)
  }
  const startMeeting = () => {
    const candidateIds = prevTasks.filter((t) => !t.completed && !t.scheduledFor).map((t) => t.id)
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
      showToast(`Saved as our week ${weekOfYear(weekStart, readCadenceConfig().weekStartsOn)} plan.`, 'success', 5000)
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
  const [stepFor, setStepFor] = useState<string | null>(null)
  const [stepDraft, setStepDraft] = useState('')
  const addStep = async (goal: Task, title: string) => {
    const id = await addTask(title, undefined, undefined, undefined, { bucket: 'week', weekStart, goalTaskId: goal.id, context: goal.context ?? undefined, assignedTo: meId ?? undefined })
    if (!id) return
    setStepFor(null); setStepDraft('')
    showToast(`“${title}” → this week, as a step toward “${goal.title}”.`, 'success', 5000)
  }
  const takeIn = async (t: Task) => {
    await gated.updateTask(t.id, { bucket: 'week', weekStart })
    showToast(`“${t.title}” → this week · still on ${monthName}’s plan.`, 'success', 4000)
  }
  const agreedBy = session.saved
    ? (session.saved.authorId === user?.id ? 'you' : members.find((m) => m.auth_user_id === session.saved!.authorId)?.name ?? 'your household')
    : null
  const weekNo = weekOfYear(weekStart, readCadenceConfig().weekStartsOn)
  const viewSwitch = (
    <div className="pv2-seg" role="group" aria-label="View">
      {([['list', 'List'], ['ref', `With ${monthName}`], ['focus', 'One at a time']] as const).map(([v, l]) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{l}</button>
      ))}
    </div>
  )

  return (
    <div className="pv2-week" data-week={localYmd(weekStart)}>
      {meeting ? (
        <div className="pv2-sbar" role="region" aria-label={`Planning week ${weekNo}`}>
          <span className="pv2-st">Planning week {weekNo}<small>a planning meeting</small></span>
          {meeting.candidateIds.length > 0 ? (
            <div className="pv2-steps">
              <button type="button" aria-current={meeting.step === 1 ? 'step' : undefined} onClick={() => setMeeting({ ...meeting, step: 1 })}><b>1</b>Close out last week</button>
              <button type="button" aria-current={meeting.step === 2 ? 'step' : undefined} onClick={() => setMeeting({ ...meeting, step: 2 })}><b>2</b>Plan this week</button>
            </div>
          ) : <span className="flex-1" />}
          {meeting.step === 2 && viewSwitch}
          <button type="button" className="pv2-link pv2-quiet" onClick={() => void endMeeting(false)}>Leave for now</button>
          <button type="button" className="pv2-btn" onClick={() => void endMeeting(true)}>This is our week</button>
        </div>
      ) : (
      <div className="pv2-toolbar">
        <div className="pv2-status">
          {session.saved
            ? <><span className="pv2-seal" aria-hidden="true" /><span><b>Our week {weekNo} plan</b> · agreed {shortDay(session.saved.at)} · {agreedBy}</span></>
            : <span className="pv2-hint">{session.loading ? '' : `No plan for week ${weekNo} yet`}</span>}
        </div>
        {viewSwitch}
        <button type="button" className={session.saved ? 'pv2-qbtn' : 'pv2-btn'} onClick={startMeeting}>Plan this week</button>
      </div>
      )}

      {meeting?.step === 1 ? (
        <CloseOut lines={prevLines} candidateIds={meeting.candidateIds} members={members} actions={actions} prevName="last week" nextName="this week"
          onDecide={decide} onFinish={() => setMeeting({ ...meeting, step: 2 })} />
      ) : view === 'focus' ? (
        <FocusDeck lines={lines} actions={actions} members={members} nextLabel="next week" context={`Week ${weekNo}`} label={`Week ${weekNo}`}
          empty={`Nothing on this week yet. “Plan this week” lets you choose from ${monthName}’s plan.`} />
      ) : (
        <div className={`pv2-wgrid${view === 'ref' ? ' is-ref' : ''}`}>
          <section className="pv2-days" aria-label="The days">{days}</section>
          <div className="pv2-wside"><div className="pv2-wside-tools"><FromPaper altitude="week" periodStart={weekStart} tasks={tasks} /></div>
            <div className="pv2-panel">
              <WeekListV2 title={isCurrent ? 'This week’s list' : `List for the week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                lines={lines} weekStart={weekStart} members={members} actions={actions} timingControl={timingControl}
                onContext={(t, c: TaskContext | undefined) => { void gated.updateTask(t.id, { context: c }) }}
                onAdd={async (title) => { await addTask(title, undefined, undefined, undefined, { bucket: 'week', weekStart, assignedTo: meId ?? undefined, context: soleDomain ?? undefined }) }}
                goalTitle={(t) => (t.goalTaskId ? tasks.find((x) => x.id === t.goalTaskId)?.title ?? null : null)} />
            </div>
          </div>
          {view === 'ref' && (
            <aside className="pv2-ref" aria-label={`${monthName}, for reference`}>
              <div className="pv2-colh">{monthName} <small>for reference</small></div>
              {monthRows.length ? (
                <ul className="pv2-list">{monthRows.map((t) => (
                  <li key={t.id} className="pv2-rrow pv2-rrow-sans">
                    {t.isGoal ? <span className="pv2-goal is-small" aria-hidden="true" /> : <span className="pv2-dash" style={{ marginTop: 10 }} aria-hidden="true" />}
                    <button type="button" className="flex-1 text-left" onClick={() => onSelectTask(t.id)}>{t.title}</button>
                    {meeting && (t.isGoal
                      ? <button type="button" className="pv2-addbtn" onClick={() => { setStepFor(t.id); setStepDraft(t.title) }} aria-label={`Add a next step for ${t.title} to this week`}>+ Next step</button>
                      : <button type="button" className="pv2-addbtn" onClick={() => void takeIn(t)} aria-label={`Add ${t.title} to this week`}>+ This week</button>)}
                    {stepFor === t.id && (
                      <form className="pv2-stepform" onSubmit={(e) => { e.preventDefault(); const v = stepDraft.trim(); if (v) void addStep(t, v) }}>
                        <label className="pv2-hint" htmlFor={`step-${t.id}`}>What’s the next step?</label>
                        <input id={`step-${t.id}`} autoFocus className="pv2-input" value={stepDraft} onChange={(e) => setStepDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Escape') setStepFor(null) }} />
                        <div className="pv2-acts"><button type="submit" className="pv2-btn">Add to this week</button><button type="button" className="pv2-link pv2-quiet" onClick={() => setStepFor(null)}>Cancel</button></div>
                      </form>
                    )}
                  </li>
                ))}</ul>
              ) : <p className="pv2-hint">Nothing open on {monthName}’s plan.</p>}
              <button type="button" className="pv2-link" style={{ marginTop: 8 }} onClick={() => navigate(`/month?start=${localYmd(monthStart)}`)}>Open {monthName} →</button>
            </aside>
          )}
        </div>
      )}
    </div>
  )
}
