// src/components/plan/v2/WeekV2.tsx
//
// Week, v2 (docs/planning/2026-09-28-planning-v2.md): the day column on the
// left — the part of the prototype Scott called "basically perfect" — and the
// week's list on the right, under the same toolbar the month wears (plan
// status · List / With <month> / One at a time · Plan this week).
//
// It is chrome AROUND the existing week: the journal, the list, drag and drop,
// add-to-day and the week's planning session are WeekViewV2's, unchanged.

import { useMemo, useState, type ReactNode } from 'react'
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
import { FocusDeck } from './FocusDeck'

const DAY = 86_400_000
const shortDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

export function WeekV2({ tasks, weekStart, meId, isCurrent, onPlan, list, days, onSelectTask }: {
  /** Layer-filtered tasks, as the week receives them. */
  tasks: Task[]
  weekStart: Date
  meId: string | null
  isCurrent: boolean
  /** Opens the week's planning session (WeekPlanHost). */
  onPlan: () => void
  /** The week's list ("Any day this week"), as WeekViewV2 builds it. */
  list: ReactNode
  /** The journal of days, as WeekViewV2 builds it. */
  days: ReactNode
  onSelectTask: (id: string) => void
}) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { toggleTask, updateTask, pushTask, updateTasksBulk, keepForward, dropCommitment } = useSupabaseTasks()
  const gated = useGatedTaskActions({ updateTask, pushTask, updateTasksBulk }, (id) => tasks.find((t) => t.id === id))
  const { members } = useFamilyMembers()
  const session = usePlanningSession('weekly', weekToken(weekStart))
  const [view, setViewState] = useState<PlanView>(() => readPlanView('week'))
  const setView = (v: PlanView) => { setViewState(v); writePlanView('week', v) }

  const monthStart = useMemo(() => monthStartOf(new Date(weekStart.getTime() + 3 * DAY)), [weekStart])
  const monthName = monthStart.toLocaleDateString('en-US', { month: 'long' })
  const monthRows = useMemo(() => selectPeriodTasks(tasks, 'month', monthStart, isCurrent, meId, readSeasons())
    .filter((t) => !t.completed && !lowerPlacement(t, 'month', monthStart)), [tasks, monthStart, isCurrent, meId])
  const weekTasks = useMemo(() => weekListTasks(tasks, weekStart, meId, { isCurrent }), [tasks, weekStart, meId, isCurrent])
  const nextWeek = new Date(weekStart.getTime() + 7 * DAY)

  const lines: LineVM[] = weekTasks.map((t) => ({
    task: t, fate: t.completed ? 'done' : 'open', partOf: goalOfTask(t, tasks, readSeasons()),
    where: t.scheduledFor ? t.scheduledFor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Any day this week',
  }))
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

  const agreedBy = session.saved
    ? (session.saved.authorId === user?.id ? 'you' : members.find((m) => m.auth_user_id === session.saved!.authorId)?.name ?? 'your household')
    : null
  const weekNo = weekOfYear(weekStart, readCadenceConfig().weekStartsOn)

  return (
    <div className="pv2-week" data-week={localYmd(weekStart)}>
      <div className="pv2-toolbar">
        <div className="pv2-status">
          {session.saved
            ? <><span className="pv2-seal" aria-hidden="true" /><span><b>Our week {weekNo} plan</b> · agreed {shortDay(session.saved.at)} · {agreedBy}</span></>
            : <span className="pv2-hint">{session.loading ? '' : `No plan for week ${weekNo} yet`}</span>}
        </div>
        <div className="pv2-seg" role="group" aria-label="View">
          {([['list', 'List'], ['ref', `With ${monthName}`], ['focus', 'One at a time']] as const).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
        <button type="button" className={session.saved ? 'pv2-qbtn' : 'pv2-btn'} onClick={onPlan}>Plan this week</button>
      </div>

      {view === 'focus' ? (
        <FocusDeck lines={lines} actions={actions} members={members} nextLabel="next week" context={`Week ${weekNo}`} label={`Week ${weekNo}`} />
      ) : (
        <div className={`pv2-wgrid${view === 'ref' ? ' is-ref' : ''}`}>
          <section className="pv2-days" aria-label="The days">{days}</section>
          <div className="pv2-wside">{list}</div>
          {view === 'ref' && (
            <aside className="pv2-ref" aria-label={`${monthName}, for reference`}>
              <div className="pv2-colh">{monthName} <small>for reference</small></div>
              {monthRows.length ? (
                <ul className="pv2-list">{monthRows.map((t) => (
                  <li key={t.id} className="pv2-rrow pv2-rrow-sans">
                    {t.isGoal ? <span className="pv2-goal is-small" aria-hidden="true" /> : <span className="pv2-dash" style={{ marginTop: 10 }} aria-hidden="true" />}
                    <button type="button" className="flex-1 text-left" onClick={() => onSelectTask(t.id)}>{t.title}</button>
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
