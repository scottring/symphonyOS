import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Task, TaskLink, TaskContext, TaskCategory, LinkedActivity, LinkType, LinkedActivityType } from '@/types/task'

interface DbTask {
  id: string
  user_id: string
  title: string
  completed: boolean
  scheduled_for: string | null
  deferred_until: string | null
  defer_count: number | null
  is_all_day: boolean | null
  is_someday: boolean | null
  archived: boolean | null
  archived_at: string | null
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
  linked_event_id: string | null
  // Generalized prep/follow-up linking
  link_type: 'prep' | 'followup' | null
  linked_activity_type: LinkedActivityType | null
  linked_activity_id: string | null
  estimated_duration: number | null
  location: string | null
  location_place_id: string | null
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

function dbTaskToTask(dbTask: DbTask): Task {
  // Build linkedTo from new generalized fields if present
  const linkedTo: LinkedActivity | undefined =
    dbTask.linked_activity_type && dbTask.linked_activity_id
      ? { type: dbTask.linked_activity_type, id: dbTask.linked_activity_id }
      : undefined

  return {
    id: dbTask.id,
    title: dbTask.title,
    completed: dbTask.completed,
    createdAt: new Date(dbTask.created_at),
    updatedAt: new Date(dbTask.updated_at),
    scheduledFor: dbTask.scheduled_for ? new Date(dbTask.scheduled_for) : undefined,
    deferredUntil: dbTask.deferred_until ? new Date(dbTask.deferred_until) : undefined,
    deferCount: dbTask.defer_count ?? undefined,
    isAllDay: dbTask.is_all_day ?? undefined,
    isSomeday: dbTask.is_someday ?? undefined,
    archived: dbTask.archived ?? undefined,
    archivedAt: dbTask.archived_at ? new Date(dbTask.archived_at) : undefined,
    context: dbTask.context ?? undefined,
    category: (dbTask.category as TaskCategory) ?? 'task',
    notes: dbTask.notes ?? undefined,
    links: normalizeLinks(dbTask.links),
    phoneNumber: dbTask.phone_number ?? undefined,
    contactId: dbTask.contact_id ?? undefined,
    assignedTo: dbTask.assigned_to ?? undefined,
    assignedToAll: dbTask.assigned_to_all ?? undefined,
    projectId: dbTask.project_id ?? undefined,
    parentTaskId: dbTask.parent_task_id ?? undefined,
    linkedEventId: dbTask.linked_event_id ?? undefined,
    linkedTo,
    linkType: dbTask.link_type ?? undefined,
    estimatedDuration: dbTask.estimated_duration ?? undefined,
    location: dbTask.location ?? undefined,
    locationPlaceId: dbTask.location_place_id ?? undefined,
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

  // Fetch tasks on mount and when user changes
  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on auth change is valid
      setTasks([])
      setLoading(false)
      return
    }

    async function fetchTasks() {
      if (!user) return

      setLoading(true)
      setError(null)

      // RLS policies handle household sharing - no need to filter by user_id
      // All tasks visible to this user (their own + household members') will be returned
      const { data, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }

      const allTasks = (data as DbTask[]).map(dbTaskToTask)
      setTasks(nestSubtasks(allTasks))
      setLoading(false)
    }

    fetchTasks()
  }, [user])

  // Options for creating linked tasks
  interface AddTaskOptions {
    linkedTo?: LinkedActivity
    linkType?: LinkType
    assignedTo?: string | null  // Family member ID to assign task to (null = no assignment, undefined = use default)
    category?: TaskCategory  // What kind of family item
    defaultAssigneeId?: string  // Default assignee if assignedTo is undefined
  }

  const addTask = useCallback(async (
    title: string,
    contactId?: string,
    projectId?: string,
    scheduledFor?: Date,
    options?: AddTaskOptions
  ): Promise<string | undefined> => {
    if (!user) return undefined

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
      createdAt: now,
      updatedAt: now,
      contactId,
      projectId,
      scheduledFor,
      linkedTo: options?.linkedTo,
      linkType: options?.linkType,
      assignedTo: effectiveAssignedTo ?? undefined,
      category: options?.category ?? 'task',
    }
    setTasks((prev) => [optimisticTask, ...prev])

    const { data, error: insertError } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        title,
        completed: false,
        contact_id: contactId ?? null,
        project_id: projectId ?? null,
        scheduled_for: scheduledFor?.toISOString() ?? null,
        linked_activity_type: options?.linkedTo?.type ?? null,
        linked_activity_id: options?.linkedTo?.id ?? null,
        link_type: options?.linkType ?? null,
        assigned_to: effectiveAssignedTo,
        category: options?.category ?? 'task',
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
              subtasks: newCompleted
                ? t.subtasks?.map((s) => ({ ...s, completed: true }))
                : t.subtasks,
            }
          }
          return t
        })
      )

      // Update parent in DB
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ completed: newCompleted })
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

  const deleteTask = useCallback(async (id: string) => {
    // Save for rollback
    const taskToDelete = tasks.find((t) => t.id === id)
    if (!taskToDelete) return

    // Optimistic update
    setTasks((prev) => prev.filter((t) => t.id !== id))

    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)

    if (deleteError) {
      // Rollback on error
      setTasks((prev) => [...prev, taskToDelete])
      setError(deleteError.message)
    }
  }, [tasks])

  const updateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    const task = tasks.find((t) => t.id === id)
    if (!task) return

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    )

    // Convert Task updates to DB format
    // Use 'key in updates' to detect when a field is explicitly set (even to undefined)
    const dbUpdates: Record<string, unknown> = {}
    if ('title' in updates) dbUpdates.title = updates.title
    if ('completed' in updates) dbUpdates.completed = updates.completed
    if ('scheduledFor' in updates) {
      dbUpdates.scheduled_for = updates.scheduledFor?.toISOString() ?? null
    }
    if ('deferredUntil' in updates) {
      dbUpdates.deferred_until = updates.deferredUntil?.toISOString() ?? null
    }
    if ('deferCount' in updates) dbUpdates.defer_count = updates.deferCount ?? 0
    if ('isAllDay' in updates) dbUpdates.is_all_day = updates.isAllDay ?? null
    if ('isSomeday' in updates) dbUpdates.is_someday = updates.isSomeday ?? false
    if ('archived' in updates) dbUpdates.archived = updates.archived ?? false
    if ('archivedAt' in updates) dbUpdates.archived_at = updates.archivedAt?.toISOString() ?? null
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
    if ('linkedEventId' in updates) dbUpdates.linked_event_id = updates.linkedEventId ?? null
    if ('linkedTo' in updates) {
      dbUpdates.linked_activity_type = updates.linkedTo?.type ?? null
      dbUpdates.linked_activity_id = updates.linkedTo?.id ?? null
    }
    if ('linkType' in updates) dbUpdates.link_type = updates.linkType ?? null
    if ('estimatedDuration' in updates) dbUpdates.estimated_duration = updates.estimatedDuration ?? null
    if ('location' in updates) dbUpdates.location = updates.location ?? null
    if ('locationPlaceId' in updates) dbUpdates.location_place_id = updates.locationPlaceId ?? null

    const { error: updateError } = await supabase
      .from('tasks')
      .update(dbUpdates)
      .eq('id', id)

    if (updateError) {
      console.error('Task update failed:', updateError.message)
      // Rollback on error
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? task : t))
      )
      setError(updateError.message)
    }
  }, [tasks])

  // Schedule a task - sets scheduledFor, clears deferredUntil
  const scheduleTask = useCallback(async (id: string, date: Date, isAllDay?: boolean) => {
    await updateTask(id, {
      scheduledFor: date,
      isAllDay: isAllDay ?? true,
      deferredUntil: undefined, // Clear deferral when scheduling
    })
  }, [updateTask])

  // Push a task - moves it to a future date
  // For scheduled tasks: updates scheduledFor to the new date
  // For inbox tasks: sets deferredUntil to hide until that date
  const pushTask = useCallback(async (id: string, date: Date) => {
    const task = tasks.find((t) => t.id === id)
    if (!task) return

    const currentCount = task?.deferCount ?? 0

    if (task.scheduledFor) {
      // Scheduled task: move to new date (preserve time if set, otherwise all-day)
      const newScheduledFor = new Date(date)
      if (!task.isAllDay && task.scheduledFor) {
        // Preserve the original time
        newScheduledFor.setHours(task.scheduledFor.getHours(), task.scheduledFor.getMinutes(), 0, 0)
      }
      await updateTask(id, {
        scheduledFor: newScheduledFor,
        deferCount: currentCount + 1,
      })
    } else {
      // Inbox task: set deferredUntil to hide until that date
      await updateTask(id, {
        deferredUntil: date,
        deferCount: currentCount + 1,
      })
    }
  }, [tasks, updateTask])

  // Archive a task - hides it from normal views
  const archiveTask = useCallback(async (id: string) => {
    const task = tasks.find((t) => t.id === id)
    if (!task) return

    const now = new Date()

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, archived: true, archivedAt: now } : t))
    )

    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        archived: true,
        archived_at: now.toISOString(),
      })
      .eq('id', id)

    if (updateError) {
      // Rollback on error
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? task : t))
      )
      setError(updateError.message)
    }
  }, [tasks])

  // Unarchive a task - restores it to normal views
  const unarchiveTask = useCallback(async (id: string) => {
    const task = tasks.find((t) => t.id === id)
    if (!task) return

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, archived: false, archivedAt: undefined } : t))
    )

    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        archived: false,
        archived_at: null,
      })
      .eq('id', id)

    if (updateError) {
      // Rollback on error
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? task : t))
      )
      setError(updateError.message)
    }
  }, [tasks])

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

  // Bulk complete/uncomplete multiple tasks
  const bulkToggleTasks = useCallback(async (ids: string[], completed: boolean) => {
    if (ids.length === 0) return

    // Save original states for rollback
    const originalStates = new Map<string, boolean>()
    tasks.forEach((t) => {
      if (ids.includes(t.id)) {
        originalStates.set(t.id, t.completed)
      }
    })

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (ids.includes(t.id) ? { ...t, completed } : t))
    )

    const { error: updateError } = await supabase
      .from('tasks')
      .update({ completed })
      .in('id', ids)

    if (updateError) {
      // Rollback
      setTasks((prev) =>
        prev.map((t) =>
          originalStates.has(t.id)
            ? { ...t, completed: originalStates.get(t.id)! }
            : t
        )
      )
      setError(updateError.message)
    }
  }, [tasks])

  // Bulk delete multiple tasks - returns deleted tasks for undo
  const bulkDeleteTasks = useCallback(async (ids: string[]): Promise<Task[]> => {
    if (ids.length === 0) return []

    // Save tasks for rollback/undo
    const tasksToDelete = tasks.filter((t) => ids.includes(t.id))

    // Optimistic update
    setTasks((prev) => prev.filter((t) => !ids.includes(t.id)))

    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .in('id', ids)

    if (deleteError) {
      // Rollback
      setTasks((prev) => [...prev, ...tasksToDelete])
      setError(deleteError.message)
      return []
    }

    return tasksToDelete
  }, [tasks])

  // Bulk restore tasks (for undo after delete)
  const bulkRestoreTasks = useCallback(async (tasksToRestore: Task[]) => {
    if (!user || tasksToRestore.length === 0) return

    // Optimistic update
    setTasks((prev) => [...tasksToRestore, ...prev])

    // Convert Task objects to DB format
    const dbRows = tasksToRestore.map((task) => ({
      id: task.id,
      user_id: user.id,
      title: task.title,
      completed: task.completed,
      scheduled_for: task.scheduledFor?.toISOString() ?? null,
      deferred_until: task.deferredUntil?.toISOString() ?? null,
      defer_count: task.deferCount ?? 0,
      is_all_day: task.isAllDay ?? null,
      is_someday: task.isSomeday ?? false,
      archived: task.archived ?? false,
      archived_at: task.archivedAt?.toISOString() ?? null,
      context: task.context ?? null,
      category: task.category ?? 'task',
      notes: task.notes ?? null,
      links: task.links ?? null,
      phone_number: task.phoneNumber ?? null,
      contact_id: task.contactId ?? null,
      assigned_to: task.assignedTo ?? null,
      assigned_to_all: task.assignedToAll ?? null,
      project_id: task.projectId ?? null,
      parent_task_id: task.parentTaskId ?? null,
      linked_event_id: task.linkedEventId ?? null,
      linked_activity_type: task.linkedTo?.type ?? null,
      linked_activity_id: task.linkedTo?.id ?? null,
      link_type: task.linkType ?? null,
      estimated_duration: task.estimatedDuration ?? null,
      location: task.location ?? null,
      location_place_id: task.locationPlaceId ?? null,
    }))

    const { error: insertError } = await supabase
      .from('tasks')
      .insert(dbRows)

    if (insertError) {
      // Rollback
      const restoredIds = new Set(tasksToRestore.map((t) => t.id))
      setTasks((prev) => prev.filter((t) => !restoredIds.has(t.id)))
      setError(insertError.message)
    }
  }, [user])

  // Bulk reschedule multiple tasks to a new date
  const bulkRescheduleTasks = useCallback(async (ids: string[], date: Date, isAllDay?: boolean) => {
    if (ids.length === 0) return

    // Save original scheduled dates for rollback
    const originalDates = new Map<string, Date | undefined>()
    tasks.forEach((t) => {
      if (ids.includes(t.id)) {
        originalDates.set(t.id, t.scheduledFor)
      }
    })

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        ids.includes(t.id)
          ? { ...t, scheduledFor: date, isAllDay: isAllDay ?? t.isAllDay ?? true, deferredUntil: undefined }
          : t
      )
    )

    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        scheduled_for: date.toISOString(),
        is_all_day: isAllDay ?? null,
        deferred_until: null, // Clear deferral when rescheduling
      })
      .in('id', ids)

    if (updateError) {
      // Rollback
      setTasks((prev) =>
        prev.map((t) =>
          ids.includes(t.id)
            ? { ...t, scheduledFor: originalDates.get(t.id), deferredUntil: undefined }
            : t
        )
      )
      setError(updateError.message)
    }
  }, [tasks])

  return { tasks, loading, error, addTask, addSubtask, addPrepTask, getPrepTasks, getLinkedTasks, toggleTask, deleteTask, updateTask, scheduleTask, pushTask, archiveTask, unarchiveTask, bulkToggleTasks, bulkDeleteTasks, bulkRestoreTasks, bulkRescheduleTasks }
}
