// src/components/planning/cadence/CadenceSessions.tsx
//
// Phase 3 — the monthly / seasonal / annual sessions, each a thin config over the
// generic CadenceSession. Period tokens match getDueSession so a nudge dismissal
// and the opened session refer to the same period. Agendas follow the verbatim
// Scott+Iris requirements (relationships, hopes/fears, fun&joy, review).

import type { Task, TaskBucket } from '@/types/task'
import type { GoalAction } from '@/types/goal'
import { CadenceSession } from './CadenceSession'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SEASONS = ['Winter', 'Spring', 'Summer', 'Fall']

function seasonIndex(d: Date): number {
  return Math.floor(((d.getMonth() + 1) % 12) / 3)
}

interface BaseProps {
  tasks: Task[]
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  onClose: () => void
  /** Hand down to the next-lower session. */
  onHandDown?: () => void
  /** Review-row triage — move an open item to another bucket / mark it done. */
  onSetBucket?: (id: string, bucket: TaskBucket) => void
  onCompleteTask?: (id: string) => void
  /** Current-quarter goal actions + a handler that breaks one into this horizon. */
  goalActions?: GoalAction[]
  onPullGoalAction?: (action: GoalAction) => void
  /** Open the Goals app (used by the annual session's goal-setting step). */
  onOpenGoals?: () => void
  /** "Review & tools" links (monthly: routines/delegation, shopping lists). */
  links?: Array<{ label: string; onClick: () => void }>
}

export function MonthlyPlanningSession({ tasks, onPushTask, onClose, onHandDown, onSetBucket, onCompleteTask, goalActions, onPullGoalAction, links }: BaseProps) {
  const now = new Date()
  return (
    <CadenceSession
      horizon="monthly"
      periodToken={`${now.getFullYear()}-${now.getMonth() + 1}`}
      title="Plan the month"
      periodLabel={`${MONTHS[now.getMonth()]} ${now.getFullYear()}`}
      tasks={tasks}
      thisBucket="month"
      pullFromBucket="quarter"
      pullFromLabel="Pull from this season"
      // Verbatim monthly agenda. (Big-rock schedule review = the In-review list;
      // projects/goals = pull-down + break-goals; routines & lists = links below.)
      textFields={[
        { key: 'relationships', label: 'Relationships & parenting', placeholder: 'What needs attention with each other and the kids this month?' },
        { key: 'concerns', label: 'Bigger-picture concerns & topics', placeholder: 'Less-urgent things to discuss this month.' },
      ]}
      onPushTask={onPushTask}
      onClose={onClose}
      handDown={onHandDown ? { label: 'Plan the week', onActivate: onHandDown } : undefined}
      onSetBucket={onSetBucket}
      onCompleteTask={onCompleteTask}
      demote={{ label: 'Into week', bucket: 'week' }}
      goalActions={goalActions}
      onPullGoalAction={onPullGoalAction}
      links={links}
      financialLabel="Update the budget, review expenditures, discuss big budget items — in your finance tool"
    />
  )
}

export function SeasonalPlanningSession({ tasks, onPushTask, onClose, onHandDown, onSetBucket, onCompleteTask, goalActions, onPullGoalAction }: BaseProps) {
  const now = new Date()
  const s = seasonIndex(now)
  return (
    <CadenceSession
      horizon="seasonal"
      periodToken={`${now.getFullYear()}-S${s}`}
      title="Plan the season"
      periodLabel={`${SEASONS[s]} ${now.getFullYear()}`}
      tasks={tasks}
      thisBucket="quarter"
      pullFromBucket="someday"
      pullFromLabel="Pull from someday"
      // Verbatim seasonal agenda (goals/projects = pull-down + break-goals).
      textFields={[
        { key: 'review', label: 'Season in review', placeholder: 'What happened this season — wins and what slipped?' },
        { key: 'hopesFears', label: 'Hopes & fears', placeholder: 'What are you hoping for, and what are you worried about?' },
        { key: 'exerciseNutrition', label: 'Exercise & nutrition patterns', placeholder: 'How do you want to eat and move this season?' },
        { key: 'funJoy', label: 'Fun & joy audit', placeholder: 'Where did joy come from? What do you want more of?' },
        { key: 'tripChildcare', label: 'Trip & childcare planning', placeholder: 'Specific trips and the childcare they need.' },
      ]}
      onPushTask={onPushTask}
      onClose={onClose}
      handDown={onHandDown ? { label: 'Plan the month', onActivate: onHandDown } : undefined}
      onSetBucket={onSetBucket}
      onCompleteTask={onCompleteTask}
      demote={{ label: 'Into month', bucket: 'month' }}
      goalActions={goalActions}
      onPullGoalAction={onPullGoalAction}
      financialLabel="Compare actual vs budget, update the plan, make a seasonal budget — in your finance tool"
    />
  )
}

export function AnnualPlanningSession({ tasks, onPushTask, onClose, onHandDown, onOpenGoals }: BaseProps) {
  const now = new Date()
  return (
    <CadenceSession
      horizon="annual"
      periodToken={`${now.getFullYear()}`}
      title="Plan the year"
      periodLabel={`${now.getFullYear()}`}
      tasks={tasks}
      thisBucket={null}
      pullFromBucket={null}
      // The verbatim annual agenda (Scott + Iris).
      textFields={[
        { key: 'review', label: 'Year in review — wins & opportunities', placeholder: 'What went well this year, and where were the opportunities?' },
        { key: 'hopesFears', label: 'Macro hopes & fears', placeholder: 'The big-picture hopes and fears for the year ahead.' },
        { key: 'longTerm', label: 'Long-term plan (5-year)', placeholder: 'Where are you headed over the next five years?' },
        { key: 'annualCalendar', label: 'Annual calendar', placeholder: 'School holidays, key dates, the shape of the year.' },
        { key: 'trips', label: 'Yearly trip planning', placeholder: 'Trips — dates and possible locations.' },
        { key: 'funJoy', label: 'Fun & joy audit', placeholder: 'Where did joy come from this year? What do you want more of?' },
      ]}
      onPushTask={onPushTask}
      onClose={onClose}
      handDown={onHandDown ? { label: 'Plan the season', onActivate: onHandDown } : undefined}
      onOpenGoals={onOpenGoals}
      financialLabel="Long-term & big-expense financial planning (5–20 yr) — do it in your finance tool"
    />
  )
}
