import { useMemo } from 'react'
import type { Task } from '@/types/task'
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

export function useGatedTaskActions<R extends {
  updateTask: (id: string, u: Partial<Task>) => Promise<void> | void
  pushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => Promise<void> | void
  updateTasksBulk: (ids: string[], u: Partial<Task>) => Promise<void>
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
    pushTask: async (id: string, target: Date | 'week' | 'month' | 'quarter') => {
      const t = findTask(id)
      if (t && t.context == null) {
        const context = await requireDomain(t)
        if (!context) return
        await raw.updateTask(id, { context })
      }
      return raw.pushTask(id, target)
    },
    updateTasksBulk: async (ids: string[], updates: Partial<Task>) => {
      const untagged = ids.map(findTask).filter((t): t is Task => !!t && needsDomain(t, updates))
      if (untagged.length === 0) return raw.updateTasksBulk(ids, updates)
      const context = await requireDomain({ id: untagged[0].id, title: `${untagged.length} items`, context: null })
      if (!context) return
      await raw.updateTasksBulk(ids, { ...updates, context })
    },
    onAssignTask: raw.onAssignTask && (async (id: string, memberId: string | null) => {
      const t = findTask(id)
      if (t && t.context == null && memberId) {
        const context = await requireDomain(t)
        if (!context) return
        await raw.updateTask(id, { context })
      }
      raw.onAssignTask!(id, memberId)
    }),
    onAssignTaskAll: raw.onAssignTaskAll && (async (id: string, memberIds: string[]) => {
      const t = findTask(id)
      if (t && t.context == null && memberIds.length > 0) {
        const context = await requireDomain(t)
        if (!context) return
        await raw.updateTask(id, { context })
      }
      raw.onAssignTaskAll!(id, memberIds)
    }),
  }) as R, [raw, findTask, requireDomain])
}
