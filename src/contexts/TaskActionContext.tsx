import { createContext, useContext, useCallback, type ReactNode } from 'react'
import type { Task } from '@/types/task'

/**
 * TaskActionContext provides task operations (complete, update, delete, push/defer)
 * to child components without prop drilling.
 *
 * Usage:
 * 1. Wrap your component tree with TaskActionProvider
 * 2. Pass the task operations from useSupabaseTasks to the provider
 * 3. Use useTaskActions() in child components to access operations
 */

interface TaskActions {
  toggleTask: (taskId: string) => Promise<void>
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>
  pushTask: (taskId: string, date: Date) => Promise<void>
  addTask: (title: string, scheduledFor?: Date, projectId?: string, contactId?: string, options?: Partial<Task>) => Promise<string | undefined>
  addSubtask?: (parentId: string, title: string) => Promise<string | undefined>
}

interface TaskActionContextValue extends TaskActions {
  // Optional: track loading states per operation
  isUpdating?: boolean
}

const TaskActionContext = createContext<TaskActionContextValue | null>(null)

interface TaskActionProviderProps {
  children: ReactNode
  toggleTask: (taskId: string) => Promise<void>
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>
  pushTask: (taskId: string, date: Date) => Promise<void>
  addTask: (title: string, scheduledFor?: Date, projectId?: string, contactId?: string, options?: Partial<Task>) => Promise<string | undefined>
  addSubtask?: (parentId: string, title: string) => Promise<string | undefined>
}

export function TaskActionProvider({
  children,
  toggleTask,
  updateTask,
  deleteTask,
  pushTask,
  addTask,
  addSubtask,
}: TaskActionProviderProps) {
  // Wrap operations to ensure stable references and consistent error handling
  const handleToggleTask = useCallback(async (taskId: string) => {
    await toggleTask(taskId)
  }, [toggleTask])

  const handleUpdateTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
    await updateTask(taskId, updates)
  }, [updateTask])

  const handleDeleteTask = useCallback(async (taskId: string) => {
    await deleteTask(taskId)
  }, [deleteTask])

  const handlePushTask = useCallback(async (taskId: string, date: Date) => {
    await pushTask(taskId, date)
  }, [pushTask])

  const handleAddTask = useCallback(async (
    title: string,
    scheduledFor?: Date,
    projectId?: string,
    contactId?: string,
    options?: Partial<Task>
  ) => {
    return await addTask(title, scheduledFor, projectId, contactId, options)
  }, [addTask])

  const handleAddSubtask = useCallback(async (parentId: string, title: string) => {
    return await addSubtask?.(parentId, title)
  }, [addSubtask])

  const value: TaskActionContextValue = {
    toggleTask: handleToggleTask,
    updateTask: handleUpdateTask,
    deleteTask: handleDeleteTask,
    pushTask: handlePushTask,
    addTask: handleAddTask,
    addSubtask: handleAddSubtask,
  }

  return (
    <TaskActionContext.Provider value={value}>
      {children}
    </TaskActionContext.Provider>
  )
}

/**
 * Hook to access task actions from context
 * @throws Error if used outside of TaskActionProvider
 */
export function useTaskActions(): TaskActionContextValue {
  const context = useContext(TaskActionContext)
  if (!context) {
    throw new Error('useTaskActions must be used within a TaskActionProvider')
  }
  return context
}

/**
 * Hook to optionally access task actions (returns null if outside provider)
 * Useful for components that can work with or without the context
 */
export function useTaskActionsOptional(): TaskActionContextValue | null {
  return useContext(TaskActionContext)
}
