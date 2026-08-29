import { useMemo } from 'react'
import type { Task, TaskBucket } from '@/types/task'
import type { DomainId } from '@/lib/domains'
import { useDomainGate } from '@/components/domain/DomainGate'

type Ask = (task: Pick<Task, 'id' | 'title' | 'context'>) => Promise<DomainId | null>

/** A gated task, plus the one field that says it is a STEP rather than an item. */
type Gatable = Pick<Task, 'id' | 'title' | 'context'> & Pick<Task, 'parentTaskId'>

/** `parentTaskId` means two different things: a real step created by
 *  `addSubtask` (which leaves `context` null on purpose — it is a step of its
 *  parent, not a separate item on a domain surface), AND a Today group
 *  wrapper attachment (groupTasks.ts, types/task.ts), which a TAGGED task can
 *  sit under while keeping its own domain. `context == null` is what tells
 *  them apart: a tagged row under a group wrapper is not a step and must not
 *  be treated as one — grouping it under a Personal wrapper doesn't make a
 *  Family task private. An untagged row under a wrapper (a step, or an
 *  Unsorted task dragged into a group) IS treated as a step: it inherits the
 *  parent's domain and is never gated for it — acceptable and consistent,
 *  since it has no domain of its own to lose. */
export function isStep(task: Pick<Task, 'context' | 'parentTaskId'>): boolean {
  return task.parentTaskId != null && task.context == null
}

/** Iris's rule: any process on an Unsorted item has to involve giving it a
 *  domain. These are the processes. A bare title/notes edit is not one.
 *
 *  A STEP is never one of them (see `isStep`). addSubtask leaves a step's
 *  `context` null on purpose, so the gate used to read every step as
 *  Unsorted: rescheduling any step of a family task popped "Where does this
 *  belong?", and answering Work stamped context='work' on the step →
 *  scopeForDomain → 'individual' → the partner lost a step of a task they
 *  share. A step inherits its parent; it is never asked, and its scope is
 *  derived from the parent's domain (useSupabaseTasks' updateTask). A row
 *  with its OWN context — grouped or not — is already tagged and skips the
 *  gate for that reason, not because it has a parent. */
export function needsDomain(task: Pick<Task, 'context' | 'parentTaskId'>, updates: Partial<Task>): boolean {
  if (isStep(task)) return false
  if (task.context != null) return false
  if ('context' in updates && updates.context) return false
  return (
    ('scheduledFor' in updates && !!updates.scheduledFor) ||
    ('bucket' in updates && updates.bucket !== 'inbox') ||
    'weekStart' in updates ||
    'assignedTo' in updates ||
    'assignedToAll' in updates ||
    ('projectId' in updates && !!updates.projectId)
  )
}

/** Normalize a gated write's result: `false` (the gate was cancelled — nothing
 *  written) is the only signal that means "did not happen". `void`/`true`
 *  (not gated, or the gate was answered) both mean "went through". Callers
 *  that fire-and-forget a gated handler and then show a success toast /
 *  record an undo MUST await this first — see InboxView, RescheduleButton,
 *  TriageRow's applyTriageVerdict, TaskDetailPanel. */
export async function wasWritten(result: void | Promise<void | boolean>): Promise<boolean> {
  const r = await result
  return r !== false
}

export async function gateUpdate(
  task: Gatable,
  updates: Partial<Task>,
  ask: Ask,
  write: (id: string, u: Partial<Task>) => Promise<void> | void,
): Promise<boolean> {
  if (!needsDomain(task, updates)) { await write(task.id, updates); return true }
  const context = await ask(task)
  if (!context) return false
  await write(task.id, { ...updates, context })
  return true
}

/** Push/setBucket/assign share one shape: if the task is untagged AND not a
 *  step (see `isStep`), ask first (unconditionally — unlike `needsDomain`,
 *  there's no "inbox" escape hatch for these, they're always a deliberate
 *  placement), stamp the context via `writeContext`, then run the actual
 *  write. Cancel (`ask` resolves null) runs nothing. A step, or a row that
 *  already has its own context (grouped or not), is never asked — see
 *  `isStep` and `needsDomain`. */
async function gateThenCall(
  task: Gatable | undefined,
  ask: Ask,
  writeContext: (id: string, context: DomainId) => Promise<void> | void,
  call: () => Promise<void> | void,
): Promise<boolean> {
  if (task && task.context == null && !isStep(task)) {
    const context = await ask(task)
    if (!context) return false
    await writeContext(task.id, context)
  }
  await call()
  return true
}

/** The six processes Iris's rule gates, re-typed to say what they actually
 *  resolve now: `false` means the gate was cancelled and nothing was
 *  written, so a caller MUST check it before showing a success toast or
 *  recording an undo entry (see `wasWritten`). Everything else on `R`
 *  (reference data, …) passes through unchanged. */
export interface GatedTaskActions {
  updateTask: (id: string, u: Partial<Task>) => Promise<boolean>
  pushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => Promise<boolean>
  updateTasksBulk: (ids: string[], u: Partial<Task>) => Promise<boolean>
  setBucket?: (id: string, bucket: TaskBucket, scheduledFor?: Date, isAllDay?: boolean) => Promise<boolean>
  onAssignTask?: (id: string, memberId: string | null) => Promise<boolean>
  onAssignTaskAll?: (id: string, memberIds: string[]) => Promise<boolean>
}

export function useGatedTaskActions<R extends {
  updateTask: (id: string, u: Partial<Task>) => Promise<void> | void
  pushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => Promise<void> | void
  updateTasksBulk: (ids: string[], u: Partial<Task>) => Promise<void>
  setBucket?: (id: string, bucket: TaskBucket, scheduledFor?: Date, isAllDay?: boolean) => Promise<void> | void
  onAssignTask?: (id: string, memberId: string | null) => void
  onAssignTaskAll?: (id: string, ids: string[]) => void
}>(raw: R, findTask: (id: string) => Task | undefined): Omit<R, keyof GatedTaskActions> & GatedTaskActions {
  const { requireDomain } = useDomainGate()
  return useMemo(() => ({
    ...raw,
    updateTask: async (id: string, updates: Partial<Task>) => {
      const t = findTask(id)
      if (!t) { await raw.updateTask(id, updates); return true }
      return gateUpdate(t, updates, requireDomain, raw.updateTask)
    },
    pushTask: async (id: string, target: Date | 'week' | 'month' | 'quarter') =>
      gateThenCall(
        findTask(id),
        requireDomain,
        (tid, context) => raw.updateTask(tid, { context }),
        () => raw.pushTask(id, target),
      ),
    updateTasksBulk: async (ids: string[], updates: Partial<Task>) => {
      const untaggedIds = ids.filter((id) => {
        const t = findTask(id)
        return !!t && needsDomain(t, updates)
      })
      if (untaggedIds.length === 0) { await raw.updateTasksBulk(ids, updates); return true }
      const context = await requireDomain({ id: untaggedIds[0], title: `${untaggedIds.length} items`, context: null })
      if (!context) return false
      // Only the UNTAGGED rows get the chosen domain. The gate asks about the
      // untagged half of a mixed selection, so stamping the answer onto the
      // whole selection re-tagged rows that already had an answer — a Work item
      // in a selection bulk-scheduled as Family became Family, silently, and
      // its scope was rederived to match.
      const taggedIds = ids.filter((id) => !untaggedIds.includes(id))
      if (taggedIds.length > 0) await raw.updateTasksBulk(taggedIds, updates)
      await raw.updateTasksBulk(untaggedIds, { ...updates, context })
      return true
    },
    setBucket: raw.setBucket && ((id: string, bucket: TaskBucket, scheduledFor?: Date, isAllDay?: boolean) =>
      gateThenCall(
        findTask(id),
        requireDomain,
        (tid, context) => raw.updateTask(tid, { context }),
        () => raw.setBucket!(id, bucket, scheduledFor, isAllDay),
      )),
    onAssignTask: raw.onAssignTask && ((id: string, memberId: string | null) =>
      gateThenCall(
        memberId ? findTask(id) : undefined, // unassigning never needs a domain
        requireDomain,
        (tid, context) => raw.updateTask(tid, { context }),
        () => raw.onAssignTask!(id, memberId),
      )),
    onAssignTaskAll: raw.onAssignTaskAll && ((id: string, memberIds: string[]) =>
      gateThenCall(
        memberIds.length > 0 ? findTask(id) : undefined,
        requireDomain,
        (tid, context) => raw.updateTask(tid, { context }),
        () => raw.onAssignTaskAll!(id, memberIds),
      )),
  }) as Omit<R, keyof GatedTaskActions> & GatedTaskActions, [raw, findTask, requireDomain])
}
