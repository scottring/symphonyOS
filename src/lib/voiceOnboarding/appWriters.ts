// src/lib/voiceOnboarding/appWriters.ts
//
// The plan's rows, onto the app's own writers, in the periods the SESSION
// fixed when it began (draft.periods) — never "now". Year → a goal for that
// year (useGoals.addGoal). Season → that season's list (bucket 'quarter'),
// month → that month's list, week → that week's list, each with its explicit
// period. Links ride the INSERT: goal_id to the year goal, source_id to the
// line one level up it was written for. Today is a separate step on the row
// (updateTask with plannedOn, the call Today's own "choose" makes) whose
// result is checked — never addTask's best-effort plannedOn. Every write is
// the signed-in person's, under RLS.

import type { TaskBucket } from '@/types/task'
import { parseLocalYmd } from '@/lib/cadence/config'
import type { VoicePlanWriters } from './savePlan'

type Domain = 'work' | 'family' | 'personal'

export interface AppAddTaskOptions {
  id: string
  bucket: TaskBucket
  context: Domain
  goalId?: string
  sourceId?: string
  seasonStart?: Date
  monthStart?: Date
  weekStart?: Date
}

export function appWriters(
  addGoal: (areaId: null, name: string, context: Domain, extra: { id: string; year: number }) => Promise<unknown>,
  addTask: (title: string, contactId: undefined, projectId: undefined, scheduledFor: undefined, options: AppAddTaskOptions) => Promise<string | undefined>,
  updateTask: (id: string, updates: { plannedOn: Date }) => Promise<boolean | void>,
): VoicePlanWriters {
  return {
    addYearGoal: async (title, o) => !!(await addGoal(null, title, o.context, { id: o.id, year: o.periods.year })),
    addTask: async (title, o) => {
      const common = { id: o.id, context: o.context, ...(o.goalId ? { goalId: o.goalId } : {}), ...(o.sourceId ? { sourceId: o.sourceId } : {}) }
      const opts: AppAddTaskOptions = o.level === 'season' ? { ...common, bucket: 'quarter', seasonStart: parseLocalYmd(o.periods.seasonStart) }
        : o.level === 'month' ? { ...common, bucket: 'month', monthStart: parseLocalYmd(o.periods.monthStart) }
        : { ...common, bucket: 'week', weekStart: parseLocalYmd(o.periods.weekStart) }
      return !!(await addTask(title, undefined, undefined, undefined, opts))
    },
    planForToday: async (id, periods) => (await updateTask(id, { plannedOn: parseLocalYmd(periods.today) })) === true,
  }
}
