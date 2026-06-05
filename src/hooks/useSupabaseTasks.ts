import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useFamilyMembers } from './useFamilyMembers'
import { useToast } from './useToast'
import { logger } from '@/lib/logger'
import type { Task, TaskBucket, TaskLink, TaskContext, TaskCategory, LinkedActivity, LinkType, LinkedActivityType, GroupMemberRef } from '@/types/task'

export interface DbTask {
  id: string
  user_id: string
  title: string
  completed: boolean
  bucket: TaskBucket
  scheduled_for: string | null
  deferred_until: string | null
  defer_count: number | null
  is_all_day: boolean | null
  is_someday: boolean | null
  context: TaskContext | null
  category: string | null
  notes: string | null
  links: (string | TaskLink)[] | null // Can be old string format or new object format
  phone_number: string | null
  contact_id: string | null
  assigned_to: string | null
  assigned_to_all: string[] | null
  project_id: string | null
  parent_task_id: string | null
  group_members: GroupMemberRef[] | null
  linked_event_id: string | null
  // Generalized prep/follow-up linking
  link_type: 'prep' | 'followup' | null
  linked_activity_type: LinkedActivityType | null
  linked_activity_id: string | null
  estimated_duration: number | null
  location: string | null
  location_place_id: string | null
  is_waiting: boolean | null
  waiting_since: string | null
  needs_discussion: boolean | null
  discussion_note: string | null
  week_deferred_at: string | null
  created_at: string
  updated_at: string
}

// Convert old string links to new TaskLink format
function normalizeLinks(links: (string | TaskLink)[] | null): TaskLink[] | undefined {
  if (!links || links.length === 0) return undefined
  return links.map((link) => {
    if (typeof link === 'string') {
      return { url: link }
    }
    return link
  })
}

export function dbTaskToTask(dbTask: DbTask): Task {
  // Build linkedTo from new generalized fields if present
  const linkedTo: LinkedActivity | undefined =
    dbTask.linked_activity_type && dbTask.linked_activity_id
      ? { type: dbTask.linked_activity_type, id: dbTask.linked_activity_id }
      : undefined

  return {
    id: dbTask.id,
    title: dbTask.title,
    completed: dbTask.completed,
    bucket: (dbTask.bucket as TaskBucket) || 'inbox',
    createdAt: new Date(dbTask.created_at),
    updatedAt: new Date(dbTask.updated_at),
    scheduledFor: dbTask.scheduled_for ? new Date(dbTask.scheduled_for) : undefined,
    deferredUntil: dbTask.deferred_until ? new Date(dbTask.deferred_until) : undefined,
    deferCount: dbTask.defer_count ?? undefined,
    isAllDay: dbTask.is_all_day ?? undefined,
    isSomeday: dbTask.is_someday ?? undefined,
    context: dbTask.context ?? null,
    category: (dbTask.category as TaskCategory) ?? 'task',
    notes: dbTask.notes ?? undefined,
    links: normalizeLinks(dbTask.links),
    phoneNumber: dbTask.phone_number ?? undefined,
    contactId: dbTask.contact_id ?? undefined,
    assignedTo: dbTask.assigned_to ?? undefined,
    // Normalize assignee: legacy single-assignee tasks store only `assigned_to`
    // (array null). Surfaces that read `assignedToAll` (the Today timeline's
    // multi-assignee avatars) would then show the task as unassigned while the
    // detail panel — which reads `assignedTo` — shows the assignee. Fall back so
    // every consumer agrees.
    assignedToAll: (dbTask.assigned_to_all && dbTask.assigned_to_all.length > 0)
      ? dbTask.assigned_to_all
      : (dbTask.assigned_to ? [dbTask.assigned_to] : undefined),
    projectId: dbTask.project_id ?? undefined,
    parentTaskId: dbTask.parent_task_id ?? undefined,
    groupMembers: (dbTask.group_members && dbTask.group_members.length > 0) ? dbTask.group_members : undefined,
    linkedEventId: dbTask.linked_event_id ?? undefined,
    linkedTo,
    linkType: dbTask.link_type ?? undefined,
    estimatedDuration: dbTask.estimated_duration ?? undefined,
    location: dbTask.location ?? undefined,
    locationPlaceId: dbTask.location_place_id ?? undefined,
    isWaiting: dbTask.is_waiting ?? undefined,
    waitingSince: dbTask.waiting_since ? new Date(dbTask.waiting_since) : undefined,
    needsDiscussion: dbTask.needs_discussion ?? undefined,
    discussionNote: dbTask.discussion_note ?? undefined,
    weekDeferredAt: dbTask.week_deferred_at ? new Date(dbTask.week_deferred_at) : undefined,
  }
}

// Nest subtasks under their parent tasks
function nestSubtasks(tasks: Task[]): Task[] {
  const taskMap = new Map<string, Task>()
  const subtasksByParent = new Map<string, Task[]>()

  // First pass: index all tasks and group subtasks
  for (const task of tasks) {
    taskMap.set(task.id, { ...task })
    if (task.parentTaskId) {
      const existing = subtasksByParent.get(task.parentTaskId) || []
      existing.push(task)
      subtasksByParent.set(task.parentTaskId, existing)
    }
  }

  // Second pass: attach subtasks to parents and filter out subtasks from top level
  const result: Task[] = []
  for (const task of tasks) {
    if (!task.parentTaskId) {
      const taskWithSubtasks = taskMap.get(task.id)!
      const subtasks = subtasksByParent.get(task.id)
      if (subtasks && subtasks.length > 0) {
        taskWithSubtasks.subtasks = subtasks
      }
      result.push(taskWithSubtasks)
    }
  }

  return result
}

export function useSupabaseTasks() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { members: familyMembers } = useFamilyMembers()
  const { showToast } = useToast()

  // Fetch tasks. Exposed as `refetch` so an external write (e.g. the assistant
  // creating a task server-side) can force an immediate refresh, since realtime
  // is not relied upon for those.
  const fetchTasks = useCallback(async () => {
    if (!user) {
      setTasks([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    // RLS policies handle household sharing - no need to filter by user_id.
    const { data, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
      setLoading(false)
      return
    }

    setTasks(nestSubtasks((data as DbTask[]).map(dbTaskToTask)))
    setLoading(false)
  }, [user])

  // Fetch on mount / user change, then subscribe to realtime.
  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on auth change is valid
      setTasks([])
      setLoading(false)
      return
    }

    fetchTasks()

    // Subscribe to real-time changes for tasks
    const channel = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
        },
        (payload) => {
          logger.debug('[useSupabaseTasks] Real-time update:', payload)

          if (payload.eventType === 'INSERT') {
            const newTask = dbTaskToTask(payload.new as DbTask)
            setTasks((prev) => {
              const nested = nestSubtasks([newTask, ...prev])
              return nested
            })
          } else if (payload.eventType === 'UPDATE') {
            const updatedTask = dbTaskToTask(payload.new as DbTask)
            setTasks((prev) => {
              const updated = prev.map((t) => {
                if (t.id === updatedTask.id) return updatedTask
                // Also check subtasks
                if (t.subtasks) {
                  const updatedSubtasks = t.subtasks.map((st) =>
                    st.id === updatedTask.id ? updatedTask : st
                  )
                  if (updatedSubtasks !== t.subtasks) {
                    return { ...t, subtasks: updatedSubtasks }
                  }
                }
                return t
              })
              return nestSubtasks(updated)
            })
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id: string }).id
            setTasks((prev) => {
              const filtered = prev.filter((t) => {
                if (t.id === deletedId) return false
                if (t.subtasks) {
                  t.subtasks = t.subtasks.filter((st) => st.id !== deletedId)
                }
                return true
              })
              return filtered
            })
          }
        }
      )
      .subscribe()

    // Cleanup subscription on unmount
    return () => {
      channel.unsubscribe()
    }
  }, [user, fetchTasks])

  // Options for creating linked tasks
  interface AddTaskOptions {
    linkedTo?: LinkedActivity
    linkType?: LinkType
    assignedTo?: string | null  // Family member ID to assign task to (null = no assignment, undefined = use default)
    assignedToAll?: string[]  // Multiple family member IDs (for shared tasks)
    category?: TaskCategory  // What kind of family item
    context?: TaskContext | null  // Life domain for filtering (null = private/untagged)
    location?: string  // Address or place name
    locationPlaceId?: string  // Google Place ID for precise directions
    defaultAssigneeId?: string  // Default assignee if assignedTo is undefined
    isAllDay?: boolean  // Whether the task is all-day (no specific time)
    parentTaskId?: string  // Link as follow-up to a parent task (for context lineage)
  }

  const addTask = useCallback(async (
    title: string,
    contactId?: string,
    projectId?: string,
    scheduledFor?: Date,
    options?: AddTaskOptions
  ): Promise<string | undefined> => {
    if (!user) {
      return undefined
    }

    // Determine assignment: explicit assignedTo takes precedence, then default, then null
    // This allows callers to explicitly pass null to create unassigned tasks
    const effectiveAssignedTo = options?.assignedTo !== undefined
      ? options.assignedTo
      : options?.defaultAssigneeId ?? null

    // Optimistic update
    const tempId = crypto.randomUUID()
    const now = new Date()
    const optimisticTask: Task = {
      id: tempId,
      title,
      completed: false,
      bucket: scheduledFor ? 'timed' : 'inbox',
      createdAt: now,
      updatedAt: now,
      contactId,
      projectId,
      scheduledFor,
      linkedTo: options?.linkedTo,
      linkType: options?.linkType,
      assignedTo: effectiveAssignedTo ?? undefined,
      assignedToAll: options?.assignedToAll,
      category: options?.category ?? 'task',
      context: options?.context ?? null,
      location: options?.location,
      locationPlaceId: options?.locationPlaceId,
      isAllDay: options?.isAllDay,
      parentTaskId: options?.parentTaskId,
    }
    setTasks((prev) => [optimisticTask, ...prev])

    const { data, error: insertError } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        title,
        completed: false,
        bucket: scheduledFor ? 'timed' : 'inbox',
        contact_id: contactId ?? null,
        project_id: projectId ?? null,
        scheduled_for: scheduledFor?.toISOString() ?? null,
        linked_activity_type: options?.linkedTo?.type ?? null,
        linked_activity_id: options?.linkedTo?.id ?? null,
        link_type: options?.linkType ?? null,
        assigned_to: effectiveAssignedTo,
        assigned_to_all: options?.assignedToAll ?? null,
        category: options?.category ?? 'task',
        context: options?.context ?? null,
        location: options?.location ?? null,
        location_place_id: options?.locationPlaceId ?? null,
        is_all_day: options?.isAllDay ?? null,
        parent_task_id: options?.parentTaskId ?? null,
      })
      .select()
      .single()

    if (insertError) {
      // Rollback on error
      setTasks((prev) => prev.filter((t) => t.id !== tempId))
      setError(insertError.message)
      return undefined
    }

    const createdTask = dbTaskToTask(data as DbTask)

    // Replace optimistic task with real one
    setTasks((prev) =>
      prev.map((t) => (t.id === tempId ? createdTask : t))
    )

    return createdTask.id
  }, [user])

  // Add a subtask to a parent task
  const addSubtask = useCallback(async (
    parentId: string,
    title: string,
    options?: { defaultAssigneeId?: string }
  ): Promise<string | undefined> => {
    if (!user) return undefined

    // Find parent to inherit properties
    const parent = tasks.find((t) => t.id === parentId)
    if (!parent) return undefined

    // Inherit assignedTo from parent, or use default if parent has no assignment
    const effectiveAssignedTo = parent.assignedTo ?? options?.defaultAssigneeId ?? null

    const tempId = crypto.randomUUID()
    const now = new Date()
    const optimisticSubtask: Task = {
      id: tempId,
      title,
      completed: false,
      bucket: 'inbox',
      createdAt: now,
      updatedAt: now,
      parentTaskId: parentId,
      projectId: parent.projectId,
      contactId: parent.contactId,
      assignedTo: effectiveAssignedTo ?? undefined,
    }

    // Optimistic: add subtask to parent's subtasks array
    setTasks((prev) =>
      prev.map((t) =>
        t.id === parentId
          ? { ...t, subtasks: [...(t.subtasks || []), optimisticSubtask] }
          : t
      )
    )

    const { data, error: insertError } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        title,
        completed: false,
        parent_task_id: parentId,
        project_id: parent.projectId ?? null,
        contact_id: parent.contactId ?? null,
        assigned_to: effectiveAssignedTo,
      })
      .select()
      .single()

    if (insertError) {
      // Rollback
      setTasks((prev) =>
        prev.map((t) =>
          t.id === parentId
            ? { ...t, subtasks: (t.subtasks || []).filter((s) => s.id !== tempId) }
            : t
        )
      )
      setError(insertError.message)
      return undefined
    }

    const createdSubtask = dbTaskToTask(data as DbTask)

    // Replace optimistic subtask with real one
    setTasks((prev) =>
      prev.map((t) =>
        t.id === parentId
          ? {
              ...t,
              subtasks: (t.subtasks || []).map((s) =>
                s.id === tempId ? createdSubtask : s
              ),
            }
          : t
      )
    )

    return createdSubtask.id
  }, [user, tasks])

  // Helper to find a task by id, including in subtasks
  const findTaskById = useCallback((id: string): Task | undefined => {
    for (const task of tasks) {
      if (task.id === id) return task
      if (task.subtasks) {
        const subtask = task.subtasks.find((s) => s.id === id)
        if (subtask) return subtask
      }
    }
    return undefined
  }, [tasks])

  // Helper to find parent of a subtask
  const findParentOfSubtask = useCallback((subtaskId: string): Task | undefined => {
    return tasks.find((t) => t.subtasks?.some((s) => s.id === subtaskId))
  }, [tasks])

  const toggleTask = useCallback(async (id: string) => {
    const task = findTaskById(id)
    if (!task) return

    const newCompleted = !task.completed
    const isSubtask = !!task.parentTaskId

    if (isSubtask) {
      // Toggle subtask - update within parent's subtasks array
      const parent = findParentOfSubtask(id)
      if (!parent) return

      setTasks((prev) =>
        prev.map((t) =>
          t.id === parent.id
            ? {
                ...t,
                subtasks: (t.subtasks || []).map((s) =>
                  s.id === id ? { ...s, completed: newCompleted } : s
                ),
              }
            : t
        )
      )

      const { error: updateError } = await supabase
        .from('tasks')
        .update({ completed: newCompleted })
        .eq('id', id)

      if (updateError) {
        // Rollback
        setTasks((prev) =>
          prev.map((t) =>
            t.id === parent.id
              ? {
                  ...t,
                  subtasks: (t.subtasks || []).map((s) =>
                    s.id === id ? { ...s, completed: !newCompleted } : s
                  ),
                }
              : t
          )
        )
        setError(updateError.message)
      }
    } else {
      // Toggle parent task
      const hasSubtasks = task.subtasks && task.subtasks.length > 0
      const incompleteSubtaskIds = hasSubtasks && newCompleted
        ? task.subtasks!.filter((s) => !s.completed).map((s) => s.id)
        : []

      // Optimistic update - complete parent and all subtasks if completing
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id === id) {
            return {
              ...t,
              completed: newCompleted,
              // Clear waiting state when completing
              ...(newCompleted && t.isWaiting ? { isWaiting: false, waitingSince: undefined } : {}),
              // Clear discussion flag when completing
              ...(newCompleted && t.needsDiscussion ? { needsDiscussion: false, discussionNote: undefined } : {}),
              subtasks: newCompleted
                ? t.subtasks?.map((s) => ({ ...s, completed: true }))
                : t.subtasks,
            }
          }
          return t
        })
      )

      // Update parent in DB — also clear waiting state if completing
      const dbUpdate: Record<string, unknown> = { completed: newCompleted }
      if (newCompleted && task.isWaiting) {
        dbUpdate.is_waiting = false
        dbUpdate.waiting_since = null
      }
      if (newCompleted && task.needsDiscussion) {
        dbUpdate.needs_discussion = false
        dbUpdate.discussion_note = null
      }
      const { error: updateError } = await supabase
        .from('tasks')
        .update(dbUpdate)
        .eq('id', id)

      if (updateError) {
        // Rollback
        setTasks((prev) =>
          prev.map((t) => (t.id === id ? task : t))
        )
        setError(updateError.message)
        return
      }

      // If completing and has incomplete subtasks, complete them too
      if (incompleteSubtaskIds.length > 0) {
        const { error: subtaskError } = await supabase
          .from('tasks')
          .update({ completed: true })
          .in('id', incompleteSubtaskIds)

        if (subtaskError) {
          setError(subtaskError.message)
        }
      }
    }
  }, [findTaskById, findParentOfSubtask])

  const toggleWaiting = useCallback(async (id: string) => {
    const task = findTaskById(id)
    if (!task) return

    const newIsWaiting = !task.isWaiting
    const now = new Date()
    const isSubtask = !!task.parentTaskId
    const waitingUpdates = { isWaiting: newIsWaiting, waitingSince: newIsWaiting ? now : undefined }

    // Optimistic update — handle subtasks
    if (isSubtask) {
      const parent = findParentOfSubtask(id)
      setTasks((prev) =>
        prev.map((t) =>
          t.id === parent?.id
            ? { ...t, subtasks: (t.subtasks || []).map((s) => s.id === id ? { ...s, ...waitingUpdates } : s) }
            : t
        )
      )
    } else {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, ...waitingUpdates } : t
        )
      )
    }

    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        is_waiting: newIsWaiting,
        waiting_since: newIsWaiting ? now.toISOString() : null,
      })
      .eq('id', id)

    if (updateError) {
      // Rollback
      if (isSubtask) {
        const parent = findParentOfSubtask(id)
        setTasks((prev) =>
          prev.map((t) =>
            t.id === parent?.id
              ? { ...t, subtasks: (t.subtasks || []).map((s) => s.id === id ? task : s) }
              : t
          )
        )
      } else {
        setTasks((prev) =>
          prev.map((t) => (t.id === id ? task : t))
        )
      }
      setError(updateError.message)
    }
  }, [findTaskById, findParentOfSubtask])

  const deleteTask = useCallback(async (id: string) => {
    // Save for rollback
    const taskToDelete = findTaskById(id)
    if (!taskToDelete) return

    const isSubtask = !!taskToDelete.parentTaskId

    // Optimistic update — handle subtasks
    if (isSubtask) {
      const parent = findParentOfSubtask(id)
      setTasks((prev) =>
        prev.map((t) =>
          t.id === parent?.id
            ? { ...t, subtasks: (t.subtasks || []).filter((s) => s.id !== id) }
            : t
        )
      )
    } else {
      setTasks((prev) => prev.filter((t) => t.id !== id))
    }

    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)

    if (deleteError) {
      // Rollback on error
      if (isSubtask) {
        const parent = findParentOfSubtask(id)
        setTasks((prev) =>
          prev.map((t) =>
            t.id === parent?.id
              ? { ...t, subtasks: [...(t.subtasks || []), taskToDelete] }
              : t
          )
        )
      } else {
        setTasks((prev) => [...prev, taskToDelete])
      }
      setError(deleteError.message)
    }
  }, [findTaskById, findParentOfSubtask])

  const updateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    logger.debug('[updateTask] Called with:', { id, updates })
    const task = findTaskById(id)
    if (!task) {
      logger.debug('[updateTask] Task not found!')
      return
    }

    // Auto-context: Assign to family member → auto-set context='family'
    if ('assignedTo' in updates && updates.assignedTo) {
      const isFamilyMember = familyMembers.some(m => m.id === updates.assignedTo)
      if (isFamilyMember && !('context' in updates)) {
        logger.debug('[updateTask] Auto-setting context to family for family member assignment')
        updates = { ...updates, context: 'family' }

        // Show toast notification
        showToast('Set context to Family', 'info', 2500)
      }
    }

    // Optimistic update — handle both top-level tasks and nested subtasks
    const isSubtask = !!task.parentTaskId
    if (isSubtask) {
      const parent = findParentOfSubtask(id)
      setTasks((prev) =>
        prev.map((t) =>
          t.id === parent?.id
            ? { ...t, subtasks: (t.subtasks || []).map((s) => s.id === id ? { ...s, ...updates } : s) }
            : t
        )
      )
    } else {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
      )
    }

    // Convert Task updates to DB format
    // Use 'key in updates' to detect when a field is explicitly set (even to undefined)
    const dbUpdates: Record<string, unknown> = {}
    if ('title' in updates) dbUpdates.title = updates.title
    if ('completed' in updates) dbUpdates.completed = updates.completed
    if ('bucket' in updates) dbUpdates.bucket = updates.bucket ?? 'inbox'
    if ('scheduledFor' in updates) {
      dbUpdates.scheduled_for = updates.scheduledFor?.toISOString() ?? null
    }
    if ('deferredUntil' in updates) {
      dbUpdates.deferred_until = updates.deferredUntil
        ? updates.deferredUntil.toISOString()
        : null
    }
    if ('deferCount' in updates) dbUpdates.defer_count = updates.deferCount ?? 0
    if ('isAllDay' in updates) dbUpdates.is_all_day = updates.isAllDay ?? null
    if ('isSomeday' in updates) dbUpdates.is_someday = updates.isSomeday ?? false
    if ('context' in updates) dbUpdates.context = updates.context ?? null
    if ('category' in updates) dbUpdates.category = updates.category ?? 'task'
    if ('notes' in updates) dbUpdates.notes = updates.notes ?? null
    if ('links' in updates) dbUpdates.links = updates.links ?? null
    if ('phoneNumber' in updates) dbUpdates.phone_number = updates.phoneNumber ?? null
    if ('contactId' in updates) dbUpdates.contact_id = updates.contactId ?? null
    if ('assignedTo' in updates) dbUpdates.assigned_to = updates.assignedTo ?? null
    if ('assignedToAll' in updates) dbUpdates.assigned_to_all = updates.assignedToAll ?? null
    if ('projectId' in updates) dbUpdates.project_id = updates.projectId ?? null
    if ('parentTaskId' in updates) dbUpdates.parent_task_id = updates.parentTaskId ?? null
    // group_members is `jsonb NOT NULL DEFAULT '[]'` — clearing it must write []
    // (not null), unlike the nullable FK columns above.
    if ('groupMembers' in updates) dbUpdates.group_members = updates.groupMembers ?? []
    if ('linkedEventId' in updates) dbUpdates.linked_event_id = updates.linkedEventId ?? null
    if ('linkedTo' in updates) {
      dbUpdates.linked_activity_type = updates.linkedTo?.type ?? null
      dbUpdates.linked_activity_id = updates.linkedTo?.id ?? null
    }
    if ('linkType' in updates) dbUpdates.link_type = updates.linkType ?? null
    if ('estimatedDuration' in updates) dbUpdates.estimated_duration = updates.estimatedDuration ?? null
    if ('location' in updates) dbUpdates.location = updates.location ?? null
    if ('locationPlaceId' in updates) dbUpdates.location_place_id = updates.locationPlaceId ?? null
    if ('isWaiting' in updates) dbUpdates.is_waiting = updates.isWaiting ?? false
    if ('waitingSince' in updates) dbUpdates.waiting_since = updates.waitingSince?.toISOString() ?? null
    if ('needsDiscussion' in updates) dbUpdates.needs_discussion = updates.needsDiscussion ?? false
    if ('discussionNote' in updates) dbUpdates.discussion_note = updates.discussionNote ?? null
    if ('weekDeferredAt' in updates) dbUpdates.week_deferred_at = updates.weekDeferredAt?.toISOString() ?? null

    logger.debug('[updateTask] Sending to DB:', { id, dbUpdates })
    const { data, error: updateError, status, count } = await supabase
      .from('tasks')
      .update(dbUpdates)
      .eq('id', id)
      .select()

    logger.debug('[updateTask] DB response:', { data, status, count, error: updateError?.message })

    if (updateError) {
      console.error('[updateTask] DB error:', updateError.message)
      showToast('Failed to update task', 'error', 3000)
      // Rollback on error — handle subtasks correctly
      if (isSubtask) {
        const parent = findParentOfSubtask(id)
        setTasks((prev) =>
          prev.map((t) =>
            t.id === parent?.id
              ? { ...t, subtasks: (t.subtasks || []).map((s) => s.id === id ? task : s) }
              : t
          )
        )
      } else {
        setTasks((prev) =>
          prev.map((t) => (t.id === id ? task : t))
        )
      }
      setError(updateError.message)
    } else if (data && data.length > 0) {
      logger.debug('[updateTask] DB update successful, returned notes:', (data[0] as DbTask).notes)
    } else {
      console.warn('[updateTask] DB update returned no data!')
    }
  }, [tasks, familyMembers, showToast, findTaskById, findParentOfSubtask])

  // Bulk update multiple tasks at once
  const updateTasksBulk = useCallback(async (taskIds: string[], updates: Partial<Task>) => {
    if (taskIds.length === 0) return

    logger.debug('[updateTasksBulk] Called with:', { taskIds, updates })

    // Save original tasks for rollback
    const tasksToUpdate = tasks.filter(t => taskIds.includes(t.id))
    const rollbackMap = new Map(tasksToUpdate.map(t => [t.id, { ...t }]))

    logger.debug('[updateTasksBulk] Tasks to update:', tasksToUpdate.length)

    // Optimistic update
    setTasks(prev => prev.map(t =>
      taskIds.includes(t.id) ? { ...t, ...updates } : t
    ))

    // Convert Task updates to DB format (same logic as updateTask)
    const dbUpdates: Record<string, unknown> = {}
    if ('title' in updates) dbUpdates.title = updates.title
    if ('completed' in updates) dbUpdates.completed = updates.completed
    if ('bucket' in updates) dbUpdates.bucket = updates.bucket ?? 'inbox'
    if ('scheduledFor' in updates) {
      dbUpdates.scheduled_for = updates.scheduledFor?.toISOString() ?? null
    }
    if ('deferredUntil' in updates) {
      dbUpdates.deferred_until = updates.deferredUntil
        ? updates.deferredUntil.toISOString()
        : null
    }
    if ('deferCount' in updates) dbUpdates.defer_count = updates.deferCount ?? 0
    if ('isAllDay' in updates) dbUpdates.is_all_day = updates.isAllDay ?? null
    if ('isSomeday' in updates) dbUpdates.is_someday = updates.isSomeday ?? false
    if ('context' in updates) dbUpdates.context = updates.context ?? null
    if ('category' in updates) dbUpdates.category = updates.category ?? 'task'
    if ('notes' in updates) dbUpdates.notes = updates.notes ?? null
    if ('links' in updates) dbUpdates.links = updates.links ?? null
    if ('phoneNumber' in updates) dbUpdates.phone_number = updates.phoneNumber ?? null
    if ('contactId' in updates) dbUpdates.contact_id = updates.contactId ?? null
    if ('assignedTo' in updates) dbUpdates.assigned_to = updates.assignedTo ?? null
    if ('assignedToAll' in updates) dbUpdates.assigned_to_all = updates.assignedToAll ?? null
    if ('projectId' in updates) dbUpdates.project_id = updates.projectId ?? null
    if ('parentTaskId' in updates) dbUpdates.parent_task_id = updates.parentTaskId ?? null
    // group_members is `jsonb NOT NULL DEFAULT '[]'` — clearing it must write []
    // (not null), unlike the nullable FK columns above.
    if ('groupMembers' in updates) dbUpdates.group_members = updates.groupMembers ?? []
    if ('linkedEventId' in updates) dbUpdates.linked_event_id = updates.linkedEventId ?? null
    if ('linkedTo' in updates) {
      dbUpdates.linked_activity_type = updates.linkedTo?.type ?? null
      dbUpdates.linked_activity_id = updates.linkedTo?.id ?? null
    }
    if ('linkType' in updates) dbUpdates.link_type = updates.linkType ?? null
    if ('estimatedDuration' in updates) dbUpdates.estimated_duration = updates.estimatedDuration ?? null
    if ('location' in updates) dbUpdates.location = updates.location ?? null
    if ('locationPlaceId' in updates) dbUpdates.location_place_id = updates.locationPlaceId ?? null
    if ('isWaiting' in updates) dbUpdates.is_waiting = updates.isWaiting ?? false
    if ('waitingSince' in updates) dbUpdates.waiting_since = updates.waitingSince?.toISOString() ?? null
    if ('needsDiscussion' in updates) dbUpdates.needs_discussion = updates.needsDiscussion ?? false
    if ('discussionNote' in updates) dbUpdates.discussion_note = updates.discussionNote ?? null
    if ('weekDeferredAt' in updates) dbUpdates.week_deferred_at = updates.weekDeferredAt?.toISOString() ?? null

    logger.debug('[updateTasksBulk] Sending to DB:', { taskIds, dbUpdates })

    // Bulk update with .in()
    const { error: updateError } = await supabase
      .from('tasks')
      .update(dbUpdates)
      .in('id', taskIds)

    logger.debug('[updateTasksBulk] DB response:', { error: updateError?.message })

    if (updateError) {
      console.error('[updateTasksBulk] DB error:', updateError.message)
      // Rollback all tasks
      setTasks(prev => prev.map(t => rollbackMap.get(t.id) || t))
      setError(updateError.message)
      throw updateError
    }
  }, [tasks])

  // Schedule a task to a specific date — sets bucket to 'timed'
  const scheduleTask = useCallback(async (id: string, date: Date, isAllDay?: boolean) => {
    await updateTask(id, {
      bucket: 'timed',
      scheduledFor: date,
      isAllDay: isAllDay ?? true,
    })
  }, [updateTask])

  // Move a task to a bucket (week, month, quarter) or reschedule to a date
  const pushTask = useCallback(async (id: string, target: Date | 'week' | 'month' | 'quarter') => {
    if (target === 'week' || target === 'month' || target === 'quarter') {
      // Move to pool — clear scheduled date
      await updateTask(id, {
        bucket: target,
        scheduledFor: undefined,
      })
    } else {
      // Reschedule to a specific date
      const task = findTaskById(id)
      const newScheduledFor = new Date(target)

      // Check if task is overdue (scheduled before today)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const isOverdue = task?.scheduledFor && new Date(task.scheduledFor) < today

      if (!isOverdue && task?.isAllDay === false && task?.scheduledFor) {
        // Preserve original time for non-overdue tasks
        newScheduledFor.setHours(task.scheduledFor.getHours(), task.scheduledFor.getMinutes(), 0, 0)
      }

      // If the target date has a specific time set (not midnight), respect it.
      // A day with no time means "all-day" — this MUST be persisted, or the
      // task gets a midnight scheduledFor with isAllDay left undefined, which
      // every timeline view mishandles: Today buckets it as 'unscheduled'
      // instead of "All day", and the Week grid drops it at the 00:00 row
      // (top-left) instead of the all-day strip. Always write a real boolean.
      const hasSpecificTime = newScheduledFor.getHours() !== 0 || newScheduledFor.getMinutes() !== 0
      await updateTask(id, {
        bucket: 'timed',
        scheduledFor: newScheduledFor,
        isAllDay: !hasSpecificTime,
      })
    }
  }, [findTaskById, updateTask])

  // Set a task's bucket directly (for triage: inbox → week, month, etc.)
  const setBucket = useCallback(async (id: string, bucket: TaskBucket, scheduledFor?: Date, isAllDay?: boolean) => {
    const updates: Partial<Task> = { bucket }
    if (bucket === 'timed' && scheduledFor) {
      updates.scheduledFor = scheduledFor
      updates.isAllDay = isAllDay ?? true
    } else if (bucket !== 'timed') {
      updates.scheduledFor = undefined
    }
    await updateTask(id, updates)
  }, [updateTask])

  // Add a prep task linked to an event (e.g., "Defrost chicken" for a dinner event)
  const addPrepTask = useCallback(async (
    title: string,
    linkedEventId: string,
    scheduledFor: Date
  ): Promise<string | undefined> => {
    if (!user) return undefined

    // Optimistic update
    const tempId = crypto.randomUUID()
    const now = new Date()
    const optimisticTask: Task = {
      id: tempId,
      title,
      completed: false,
      bucket: 'timed',
      createdAt: now,
      updatedAt: now,
      scheduledFor,
      linkedEventId,
    }
    setTasks((prev) => [optimisticTask, ...prev])

    const { data, error: insertError } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        title,
        completed: false,
        bucket: 'timed',
        scheduled_for: scheduledFor.toISOString(),
        linked_event_id: linkedEventId,
      })
      .select()
      .single()

    if (insertError) {
      // Rollback on error
      setTasks((prev) => prev.filter((t) => t.id !== tempId))
      setError(insertError.message)
      return undefined
    }

    const createdTask = dbTaskToTask(data as DbTask)

    // Replace optimistic task with real one
    setTasks((prev) =>
      prev.map((t) => (t.id === tempId ? createdTask : t))
    )

    return createdTask.id
  }, [user])

  // Get prep tasks for a specific event (legacy - use getLinkedTasks for new code)
  const getPrepTasks = useCallback((eventId: string): Task[] => {
    return tasks.filter((t) => t.linkedEventId === eventId)
  }, [tasks])

  // Get all linked tasks (prep and followup) for any activity type
  const getLinkedTasks = useCallback((
    activityType: LinkedActivityType,
    activityId: string
  ): { prep: Task[], followup: Task[] } => {
    const linked = tasks.filter(t =>
      t.linkedTo?.type === activityType &&
      t.linkedTo?.id === activityId
    )
    return {
      prep: linked.filter(t => t.linkType === 'prep'),
      followup: linked.filter(t => t.linkType === 'followup'),
    }
  }, [tasks])

  return { tasks, loading, error, refetch: fetchTasks, addTask, addSubtask, addPrepTask, getPrepTasks, getLinkedTasks, toggleTask, toggleWaiting, deleteTask, updateTask, updateTasksBulk, scheduleTask, pushTask, setBucket }
}
