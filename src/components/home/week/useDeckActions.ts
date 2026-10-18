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
  /** One run, one Undo. `label` names the run; by default the stale drain's. */
  drain(tasks: Task[], label?: string): Promise<boolean>
}

export interface DeckDeps {
  toggleTask: (id: string) => Promise<unknown>
  updateTask: (id: string, updates: Partial<Task>) => Promise<unknown>
  onUpdateTask: (id: string, updates: Partial<Task>) => Promise<unknown> | void
  keepForward: (id: string, period: { weekStart?: Date; monthStart?: Date }, from?: Date) => Promise<string | undefined>
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
    const setBucket = gated.setBucket ?? (async (id: string, bucket: TaskBucket): Promise<boolean> => ok(await onUpdateTask(id, { bucket })))
    const handlers = { onPushTask: gated.pushTask, onSetBucket: setBucket }
    const fromWeek = (c: DeckCard) => (c.source === 'last-week' ? lastWeekStart : weekAnchor)
    const restoreOf = (t: Task) => {
      const before = liveCommitments({ commitments: bootstrapCommitments(t) })
      const offDay = timingRemoval(t, 'day')
      return async () => ok(await updateTask(t.id, { ...offDay.previous, commitments: before }))
    }
    const clearDay = async (t: Task) => !t.scheduledFor || ok(await updateTask(t.id, timingRemoval(t, 'day').updates))
    const restorePlacement = (t: Task) => async () => ok(await onUpdateTask(t.id, placementOf(t)))
    // Someday and its kin release every open commitment, so placementOf alone
    // would lose them: a task with live commitments is restored from them.
    const undoFor = (t: Task) => (liveCommitments({ commitments: bootstrapCommitments(t) }).length > 0 ? restoreOf(t) : restorePlacement(t))
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
          // The page's week, not the calendar's current one.
          return activity.run(label, async () => !!(await keepForward(t.id, { weekStart: weekAnchor })), { ids: [t.id], undo: undoFor(t) })
        }
        // Already on this week. A day that passed undone is spent: it goes.
        if (t.scheduledFor) return activity.run(label, async () => await clearDay(t), { ids: [t.id], undo: restoreOf(t) })
        return Promise.resolve(true)
      },

      later: (c, when) => {
        const t = c.task
        if (when === 'next-week') {
          return activity.run(`Move “${t.title}” to next week`,
            async () => await clearDay(t) && !!(await keepForward(t.id, { weekStart: nextWeekStart }, fromWeek(c))),
            { ids: [t.id], undo: restoreOf(t) })
        }
        if (when === 'next-month') {
          // A commitment to the month, not a date on its 1st.
          const now = new Date()
          const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
          return activity.run(`${describeTriageWhen(when)}: “${t.title}”`,
            async () => await clearDay(t) && !!(await keepForward(t.id, { monthStart: nextMonth }, fromWeek(c))),
            { ids: [t.id], undo: restoreOf(t) })
        }
        return activity.run(`${describeTriageWhen(when)}: “${t.title}”`,
          async () => await clearDay(t) && await applyTriageWhen(when, t.id, handlers),
          { ids: [t.id], undo: undoFor(t) })
      },

      laterOnDate: (c, date) => {
        const t = c.task
        return activity.run(`Later: “${t.title}”`, async () => ok(await gated.pushTask(t.id, date)), { ids: [t.id], undo: undoFor(t) })
      },

      letGo: (c) => {
        const t = c.task
        if (c.source === 'inbox') {
          return activity.run(`Let go of “${t.title}”`, async () => ok(await setBucket(t.id, 'someday')), { ids: [t.id], undo: undoFor(t) })
        }
        // The week goes. A month or season still holding it keeps it on that
        // list; with nothing broader it would fall to the Inbox and be dealt
        // again next week, so it goes to Someday instead.
        // The Undo is the commitments snapshot (with the day, focus and
        // weekend); a row with no commitments at all is restored from its
        // placement.
        const off = timingRemoval(t, 'all')
        const broader = (off.updates.commitments ?? []).some((c) => c.status === 'open' && c.level !== 'week')
        const snapshot = (off.previous.commitments ?? []).length > 0
        return activity.run(`Let go of “${t.title}”`,
          async () => ok(broader ? await updateTask(t.id, off.updates) : await setBucket(t.id, 'someday')),
          { ids: [t.id], undo: snapshot ? async () => ok(await updateTask(t.id, off.previous)) : restorePlacement(t) })
      },

      // Ungated: the drain is one deliberate sweep, not a question per task.
      drain: (tasks, label) => {
        const wrote: Task[] = []
        const options: { ids: string[]; failureState: 'partial'; failureSummary?: string; undo: () => Promise<boolean> } = {
          ids: tasks.map((t) => t.id),
          failureState: 'partial',
          undo: async () => {
            let all = true
            for (const t of wrote) all = (await undoFor(t)()) && all
            return all
          },
        }
        return activity.run(label ?? `Move ${tasks.length} untouched things to Later`, async () => {
          for (const t of tasks) {
            try { if (ok(await onUpdateTask(t.id, { bucket: 'someday' }))) wrote.push(t) } catch { /* counted below */ }
          }
          const failed = tasks.length - wrote.length
          if (failed > 0) options.failureSummary = `${failed} couldn't move`
          return wrote.length > 0
        }, options)
      },
    }
  }, [activity, toggleTask, updateTask, onUpdateTask, keepForward, gated, weekAnchor, lastWeekStart, nextWeekStart])
}
