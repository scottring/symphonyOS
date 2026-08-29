import { useMemo } from 'react'
import type { Task, TaskBucket } from '@/types/task'
import type { DomainId } from '@/lib/domains'
import { useDomainGate } from '@/components/domain/DomainGate'

type Ask = (task: Pick<Task, 'id' | 'title' | 'context'>) => Promise<DomainId | null>

/** Iris's rule: any process on an Unsorted item has to involve giving it a
 *  domain. These are the processes. A bare title/notes edit is not one. */
export function needsDomain(task: Pick<Task, 'context'>, updates: Partial<Task>): boolean {
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

export async function gateUpdate(
  task: Pick<Task, 'id' | 'title' | 'context'>,
  updates: Partial<Task>,
  ask: Ask,
  write: (id: string, u: Partial<Task>) => Promise<void> | void,
): Promise<void> {
  if (!needsDomain(task, updates)) { await write(task.id, updates); return }
  const context = await ask(task)
  if (!context) return
  await write(task.id, { ...updates, context })
}

/** Push/setBucket/assign share one shape: if the task is untagged, ask first
 *  (unconditionally — unlike `needsDomain`, there's no "inbox" escape hatch
 *  for these, they're always a deliberate placement), stamp the context via
 *  `writeContext`, then run the actual write. Cancel (`ask` resolves null)
 *  runs nothing. */
async function gateThenCall(
  task: Pick<Task, 'id' | 'title' | 'context'> | undefined,
  ask: Ask,
  writeContext: (id: string, context: DomainId) => Promise<void> | void,
  call: () => Promise<void> | void,
): Promise<void> {
  if (task && task.context == null) {
    const context = await ask(task)
    if (!context) return
    await writeContext(task.id, context)
  }
  await call()
}

export function useGatedTaskActions<R extends {
  updateTask: (id: string, u: Partial<Task>) => Promise<void> | void
  pushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => Promise<void> | void
  updateTasksBulk: (ids: string[], u: Partial<Task>) => Promise<void>
  setBucket?: (id: string, bucket: TaskBucket, scheduledFor?: Date, isAllDay?: boolean) => Promise<void> | void
  onAssignTask?: (id: string, memberId: string | null) => void
  onAssignTaskAll?: (id: string, ids: string[]) => void
}>(raw: R, findTask: (id: string) => Task | undefined): R {
  const { requireDomain } = useDomainGate()
  return useMemo(() => ({
    ...raw,
    updateTask: async (id: string, updates: Partial<Task>) => {
      const t = findTask(id)
      if (!t) return raw.updateTask(id, updates)
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
      const untagged = ids.map(findTask).filter((t): t is Task => !!t && needsDomain(t, updates))
      if (untagged.length === 0) return raw.updateTasksBulk(ids, updates)
      const context = await requireDomain({ id: untagged[0].id, title: `${untagged.length} items`, context: null })
      if (!context) return
      await raw.updateTasksBulk(ids, { ...updates, context })
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
  }) as R, [raw, findTask, requireDomain])
}
