import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Task, TaskLink, TaskContext } from '@/types/task'

interface DbTask {
  id: string
  user_id: string
  title: string
  completed: boolean
  scheduled_for: string | null
  deferred_until: string | null
  defer_count: number | null
  is_all_day: boolean | null
  context: TaskContext | null
  notes: string | null
  links: (string | TaskLink)[] | null // Can be old string format or new object format
  phone_number: string | null
  contact_id: string | null
  assigned_to: string | null
  project_id: string | null
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
  return {
    id: dbTask.id,
    title: dbTask.title,
    completed: dbTask.completed,
    createdAt: new Date(dbTask.created_at),
    scheduledFor: dbTask.scheduled_for ? new Date(dbTask.scheduled_for) : undefined,
    deferredUntil: dbTask.deferred_until ? new Date(dbTask.deferred_until) : undefined,
    deferCount: dbTask.defer_count ?? undefined,
    isAllDay: dbTask.is_all_day ?? undefined,
    context: dbTask.context ?? undefined,
    notes: dbTask.notes ?? undefined,
    links: normalizeLinks(dbTask.links),
    phoneNumber: dbTask.phone_number ?? undefined,
    contactId: dbTask.contact_id ?? undefined,
    assignedTo: dbTask.assigned_to ?? undefined,
    projectId: dbTask.project_id ?? undefined,
  }
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

      const { data, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }

      setTasks((data as DbTask[]).map(dbTaskToTask))
      setLoading(false)
    }

    fetchTasks()
  }, [user])

  const addTask = useCallback(async (title: string, contactId?: string, projectId?: string, scheduledFor?: Date): Promise<string | undefined> => {
    if (!user) return undefined

    // Optimistic update
    const tempId = crypto.randomUUID()
    const optimisticTask: Task = {
      id: tempId,
      title,
      completed: false,
      createdAt: new Date(),
      contactId,
      projectId,
      scheduledFor,
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

  const toggleTask = useCallback(async (id: string) => {
    const task = tasks.find((t) => t.id === id)
    if (!task) return

    // Optimistic update
    const newCompleted = !task.completed
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: newCompleted } : t))
    )

    const { error: updateError } = await supabase
      .from('tasks')
      .update({ completed: newCompleted })
      .eq('id', id)

    if (updateError) {
      // Rollback on error
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, completed: !newCompleted } : t))
      )
      setError(updateError.message)
    }
  }, [tasks])

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
      // Convert Date to YYYY-MM-DD string for DATE column
      dbUpdates.deferred_until = updates.deferredUntil
        ? updates.deferredUntil.toISOString().split('T')[0]
        : null
    }
    if ('deferCount' in updates) dbUpdates.defer_count = updates.deferCount ?? 0
    if ('isAllDay' in updates) dbUpdates.is_all_day = updates.isAllDay ?? null
    if ('context' in updates) dbUpdates.context = updates.context ?? null
    if ('notes' in updates) dbUpdates.notes = updates.notes ?? null
    if ('links' in updates) dbUpdates.links = updates.links ?? null
    if ('phoneNumber' in updates) dbUpdates.phone_number = updates.phoneNumber ?? null
    if ('contactId' in updates) dbUpdates.contact_id = updates.contactId ?? null
    if ('assignedTo' in updates) dbUpdates.assigned_to = updates.assignedTo ?? null
    if ('projectId' in updates) dbUpdates.project_id = updates.projectId ?? null

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

  return { tasks, loading, error, addTask, toggleTask, deleteTask, updateTask, scheduleTask, pushTask }
}
