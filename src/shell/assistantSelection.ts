import type { Task } from '@/types/task'
import type { Layer } from '@/lib/domains'
import { matchesLayers } from '@/lib/today/domainFilter'
import type { AssistantTaskContext } from '@/lib/agentStream'
import type { EntityContext } from '@/types/chat'

/** Only attach the selected item, never the full task collection. */
export function assistantSelection(tasks: Task[], selection: {kind: string; id: string} | null, layers: ReadonlySet<Layer>): {taskContext?: AssistantTaskContext; entityContext: EntityContext | null} {
  const task = selection?.kind === 'task' ? tasks.find(t => t.id === selection.id && matchesLayers(t.context, layers)) : undefined
  return task ? {
    taskContext: {id: task.id, title: task.title, kind: 'task', notes: task.notes},
    entityContext: {id: task.id, type: 'task', name: task.title},
  } : {entityContext: null}
}
