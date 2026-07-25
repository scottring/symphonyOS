// src/components/planning/guided/GuidedContext.tsx
//
// Context bridging the shell and the step components. `GuidedHost` is the
// only doorway to app data/actions — step components never import hooks that
// need providers, which keeps them individually testable.
import { createContext, useContext } from 'react'
import type { Task, TaskBucket } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'
import type { Goal, GoalArea, GoalStatus } from '@/types/goal'
import type { Project } from '@/types/project'
import type { GuidedStepConfig, GuidedStepRenderContext } from './types'

export interface GuidedHost {
  tasks: Task[]
  tasksLoading: boolean
  events: CalendarEvent[]
  calendarConnected: boolean
  /** True while the provider is still validating the Google connection —
   *  distinct from "checked and not connected". */
  calendarChecking: boolean
  /** Returns the fetched events (mirrors useGoogleCalendar's fetchEvents) — steps
   *  that need a range wider than the app-wide cache (e.g. CalendarStep's annual
   *  scan) should read this return value rather than `events`, since fetchEvents
   *  replaces the shared GoogleCalendarProvider cache as a side effect. */
  fetchEvents: (start: Date, end: Date) => Promise<CalendarEvent[]>
  createEvent: (input: { title: string; startTime: Date; endTime: Date; allDay?: boolean }) => Promise<unknown>
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  onSetBucket: (id: string, bucket: TaskBucket) => void
  onCompleteTask: (id: string) => void
  /** "Let it go" — every review narration promises it, so every review row
   *  must be able to perform it. */
  onDeleteTask: (id: string) => void
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  /** Single atomic create-into-bucket (bucket rides in AddTaskOptions).
   *  projectId attaches the new task to a project — context, not linkage.
   *  sourceId/goalId are the cascade thread: stamped on copy-down and goal
   *  promotion so ancestry and roll-up stay legible (lineage.ts). */
  createTaskInBucket: (
    title: string,
    bucket: TaskBucket,
    opts?: { projectId?: string; sourceId?: string; goalId?: string; pickedAt?: Date },
  ) => Promise<void>
  /** Dated all-day task (book-next fallback when calendar is disconnected). */
  createDatedTask: (title: string, date: Date) => Promise<void>
  // Projects — the "what" axis: context containers the horizon lists chunk into
  projects: Project[]
  projectsMap: Map<string, Project>
  // Goals (flattened: areas + goal statements only)
  goals: Goal[]
  goalAreas: GoalArea[]
  addGoal: (areaId: string, name: string) => Promise<unknown>
  addArea: (name: string) => Promise<unknown>
  updateGoalStatus: (id: string, status: GoalStatus) => Promise<void>
  /** Annual review "Carry forward": stamps the goal into the year being
   *  planned (goals are fetched per-year, so the stamp is what carries it). */
  carryGoal: (id: string) => Promise<void>
  // Weekly grid pass-through
  routines: Routine[]
  draggableRoutines: Routine[]
  onScheduleRoutine: (routineId: string, date: Date, time: string) => void
  getRoutinesForDate: (date: Date) => Routine[]
  // Monthly maintenance sweep (Best Laid Plans): the "Monthly upkeep"
  // template list — open items + one idempotent find-or-create-with-seeds.
  upkeepItems: { id: string; text: string }[]
  upkeepLoading: boolean
  ensureUpkeepList: () => Promise<void>
}

export interface GuidedValue extends GuidedStepRenderContext {
  host: GuidedHost
  step: GuidedStepConfig
  goNext: () => void
}

const Ctx = createContext<GuidedValue | null>(null)
export const GuidedProvider = Ctx.Provider

export function useGuided(): GuidedValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useGuided outside GuidedSession')
  return v
}
