import type { DayPlanEntry, DayPlanInput } from '@/lib/today/dayPlan'
import { selectDayPlan } from '@/lib/today/dayPlan'
import { routinesForViewedDate } from '@/lib/today/routinesForDate'
import { localYmd } from '@/lib/cadence/config'
import type { Routine, ActionableInstance } from '@/types/actionable'

export interface WeekRoutineDay { date: Date; entries: DayPlanEntry[] }

/** The same untimed, unchosen occurrences Today offers, for every day on Week. */
export function weekRoutineChoices(input: Pick<DayPlanInput, 'weekStart' | 'selectedAssignee' | 'hideRoutines' | 'layers'>, routines: Routine[], getForDate: (date: Date) => Routine[], instances: ActionableInstance[]): WeekRoutineDay[] {
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(input.weekStart)
    date.setDate(date.getDate() + offset)
    const ymd = localYmd(date)
    const dateInstances = instances.filter(instance => instance.date === ymd || (instance.deferred_to && localYmd(new Date(instance.deferred_to)) === ymd))
    const plan = selectDayPlan({ ...input, viewedDate: date, tasks: [], routines: routinesForViewedDate(getForDate(date), routines, dateInstances, date), dateInstances })
    return { date, entries: plan.available.filter(entry => !entry.completed && !entry.planned) }
  })
}
