// The deck's writers: the existing week writers behind one interface, each
// wrapped in the canvas activity so it saves, shows a receipt and offers Undo.
// Nothing here deletes; "Later" is the Someday bucket.

import { useMemo } from 'react'
import type { Task, TaskBucket } from '@/types/task'
import type { DeckCard } from '@/lib/planning/deck'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { timingRemoval } from '@/lib/planning/planActions'
import { placementOf } from '@/lib/planning/placement'
import { lineDropUpdates } from '@/lib/planning/v2/planV2'
import { liveCommitments } from '@/lib/placement/model'
import { bootstrapCommitments } from '@/lib/placement/intentions'
import { applyTriageWhen, describeTriageWhen } from '@/lib/triage/applyWhen'

export type LaterWhen = 'next-week' | 'this-month' | 'next-month' | 'this-season' | 'someday'

export interface DeckActions {
  done(c: DeckCard): Promise<boolean>
  placeOnDay(c: DeckCard, day: Date): Promise<boolean>
  keepThisWeek(c: DeckCard): Promise<boolean>
  later(c: DeckCard, when: LaterWhen): Promise<boolean>
  laterOnDate(c: DeckCard, date: Date): Promise<boolean>
  letGo(c: DeckCard): Promise<boolean>
  drain(tasks: Task[]): Promise<boolean>
}

export interface DeckDeps {
  toggleTask: (id: string) => Promise<unknown>
  updateTask: (id: string, updates: Partial<Task>) => Promise<unknown>
  onUpdateTask: (id: string, updates: Partial<Task>) => Promise<unknown> | void
  keepForward: (id: string, period: { weekStart?: Date }, from?: Date) => Promise<string | undefined>
  gated: {
    pushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => Promise<void | boolean> | void
    setBucket?: (id: string, bucket: TaskBucket) => Promise<void | boolean> | void
  }
  weekAnchor: Date
  lastWeekStart: Date
  nextWeekStart: Date
}

const ok = (r: unknown) => r !== false

export function useDeckActions(deps: DeckDeps): DeckActions {
  const activity = useCanvasActivity()
  const { toggleTask, updateTask, onUpdateTask, keepForward, gated, weekAnchor, lastWeekStart, nextWeekStart } = deps

  return useMemo<DeckActions>(() => {
    const setBucket = gated.setBucket ?? ((id: string, bucket: TaskBucket) => onUpdateTask(id, { bucket }))
    const handlers = { onPushTask: gated.pushTask, onSetBucket: setBucket }
    const fromWeek = (c: DeckCard) => (c.source === 'last-week' ? lastWeekStart : weekAnchor)
    const restoreOf = (t: Task) => {
      const before = liveCommitments({ commitments: bootstrapCommitments(t) })
      const offDay = timingRemoval(t, 'day')
      return async () => ok(await updateTask(t.id, { ...offDay.previous, commitments: before }))
    }
    const clearDay = async (t: Task) => !t.scheduledFor || ok(await updateTask(t.id, timingRemoval(t, 'day').updates))
    const restorePlacement = (t: Task) => async () => ok(await onUpdateTask(t.id, placementOf(t)))
    const toggle = (id: string) => async () => ok(await toggleTask(id))

    return {
      done: (c) => activity.run(`Done: “${c.task.title}”`, toggle(c.task.id), { ids: [c.task.id], undo: toggle(c.task.id) }),

      placeOnDay: (c, day) => {
        const t = c.task
        const patch = lineDropUpdates(t, { kind: 'day', at: day })
        const label = `Give “${t.title}” ${day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
        if (c.source === 'last-week') {
          return activity.run(label, async () => !!(await keepForward(t.id, { weekStart: weekAnchor }, lastWeekStart)) && ok(await onUpdateTask(t.id, patch)),
            { ids: [t.id], undo: restoreOf(t) })
        }
        const before = Object.fromEntries(Object.keys(patch).map((k) => [k, t[k as keyof Task]])) as Partial<Task>
        return activity.run(label, async () => ok(await onUpdateTask(t.id, patch)),
          { ids: [t.id], undo: async () => { await onUpdateTask(t.id, before) } })
      },

      keepThisWeek: (c) => {
        const t = c.task
        const label = `Keep “${t.title}” this week`
        if (c.source === 'last-week') {
          return activity.run(label, async () => await clearDay(t) && !!(await keepForward(t.id, { weekStart: weekAnchor }, lastWeekStart)),
            { ids: [t.id], undo: restoreOf(t) })
        }
        if (c.source === 'inbox') {
          return activity.run(label, () => applyTriageWhen('this-week', t.id, handlers), { ids: [t.id], undo: restorePlacement(t) })
        }
        return Promise.resolve(true) // already on this week
      },

      later: (c, when) => {
        const t = c.task
        if (when === 'next-week') {
          return activity.run(`Move “${t.title}” to next week`,
            async () => await clearDay(t) && !!(await keepForward(t.id, { weekStart: nextWeekStart }, fromWeek(c))),
            { ids: [t.id], undo: restoreOf(t) })
        }
        return activity.run(`${describeTriageWhen(when)}: “${t.title}”`,
          async () => await clearDay(t) && await applyTriageWhen(when, t.id, handlers),
          { ids: [t.id], undo: restorePlacement(t) })
      },

      laterOnDate: (c, date) => {
        const t = c.task
        return activity.run(`Later: “${t.title}”`, async () => ok(await gated.pushTask(t.id, date)), { ids: [t.id], undo: restorePlacement(t) })
      },

      letGo: (c) => {
        const t = c.task
        if (c.source === 'inbox') {
          return activity.run(`Let go of “${t.title}”`, async () => ok(await setBucket(t.id, 'someday')), { ids: [t.id], undo: restorePlacement(t) })
        }
        const off = timingRemoval(t, 'all')
        return activity.run(`Let go of “${t.title}”`, async () => ok(await updateTask(t.id, off.updates)),
          { ids: [t.id], undo: async () => ok(await updateTask(t.id, off.previous)) })
      },

      drain: (tasks) => activity.run(`Move ${tasks.length} untouched things to Later`, async () => {
        let all = true
        for (const t of tasks) all = ok(await setBucket(t.id, 'someday')) && all
        return all
      }, {
        ids: tasks.map((t) => t.id),
        undo: async () => {
          for (const t of tasks) await onUpdateTask(t.id, placementOf(t))
          return true
        },
      }),
    }
  }, [activity, toggleTask, updateTask, onUpdateTask, keepForward, gated, weekAnchor, lastWeekStart, nextWeekStart])
}
