import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Task, TaskLink } from '@/types/task'

interface DbTask {
  id: string
  user_id: string
  title: string
  completed: boolean
  scheduled_for: string | null
  notes: string | null
  links: (string | TaskLink)[] | null // Can be old string format or new object format
  phone_number: string | null
  contact_id: string | null
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
    notes: dbTask.notes ?? undefined,
    links: normalizeLinks(dbTask.links),
    phoneNumber: dbTask.phone_number ?? undefined,
    contactId: dbTask.contact_id ?? undefined,
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

  const addTask = useCallback(async (title: string, contactId?: string) => {
    if (!user) return

    // Optimistic update
    const tempId = crypto.randomUUID()
    const optimisticTask: Task = {
      id: tempId,
      title,
      completed: false,
      createdAt: new Date(),
      contactId,
    }
    setTasks((prev) => [optimisticTask, ...prev])

    const { data, error: insertError } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        title,
        completed: false,
        contact_id: contactId ?? null,
      })
      .select()
      .single()

    if (insertError) {
      // Rollback on error
      setTasks((prev) => prev.filter((t) => t.id !== tempId))
      setError(insertError.message)
      return
    }

    // Replace optimistic task with real one
    setTasks((prev) =>
      prev.map((t) => (t.id === tempId ? dbTaskToTask(data as DbTask) : t))
    )
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
    const dbUpdates: Record<string, unknown> = {}
    if (updates.title !== undefined) dbUpdates.title = updates.title
    if (updates.completed !== undefined) dbUpdates.completed = updates.completed
    if (updates.scheduledFor !== undefined) {
      dbUpdates.scheduled_for = updates.scheduledFor?.toISOString() ?? null
    }
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes ?? null
    if (updates.links !== undefined) dbUpdates.links = updates.links ?? null
    if (updates.phoneNumber !== undefined) dbUpdates.phone_number = updates.phoneNumber ?? null
    if (updates.contactId !== undefined) dbUpdates.contact_id = updates.contactId ?? null

    const { error: updateError } = await supabase
      .from('tasks')
      .update(dbUpdates)
      .eq('id', id)

    if (updateError) {
      // Rollback on error
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? task : t))
      )
      setError(updateError.message)
    }
  }, [tasks])

  return { tasks, loading, error, addTask, toggleTask, deleteTask, updateTask }
}
