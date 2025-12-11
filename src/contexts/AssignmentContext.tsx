import { createContext, useContext, useCallback, type ReactNode } from 'react'
import type { FamilyMember } from '@/types/family'

/**
 * AssignmentContext provides family member assignment operations
 * to child components without prop drilling.
 *
 * Usage:
 * 1. Wrap your component tree with AssignmentProvider
 * 2. Pass family members and assignment handlers to the provider
 * 3. Use useAssignment() in child components to access members and operations
 */

interface AssignmentOperations {
  // Update task assignment
  assignTask: (taskId: string, memberIds: string[]) => Promise<void>
  // Update event assignment
  assignEvent?: (eventId: string, memberIds: string[]) => void
  // Update routine assignment
  assignRoutine?: (routineId: string, memberIds: string[]) => Promise<boolean>
}

interface AssignmentContextValue extends AssignmentOperations {
  familyMembers: FamilyMember[]
  currentUserId?: string
  // Helper to get member by ID
  getMemberById: (id: string) => FamilyMember | undefined
  // Helper to get member display name
  getMemberName: (id: string) => string
}

const AssignmentContext = createContext<AssignmentContextValue | null>(null)

interface AssignmentProviderProps {
  children: ReactNode
  familyMembers: FamilyMember[]
  currentUserId?: string
  assignTask: (taskId: string, memberIds: string[]) => Promise<void>
  assignEvent?: (eventId: string, memberIds: string[]) => void
  assignRoutine?: (routineId: string, memberIds: string[]) => Promise<boolean>
}

export function AssignmentProvider({
  children,
  familyMembers,
  currentUserId,
  assignTask,
  assignEvent,
  assignRoutine,
}: AssignmentProviderProps) {
  const handleAssignTask = useCallback(async (taskId: string, memberIds: string[]) => {
    await assignTask(taskId, memberIds)
  }, [assignTask])

  const handleAssignEvent = useCallback((eventId: string, memberIds: string[]) => {
    assignEvent?.(eventId, memberIds)
  }, [assignEvent])

  const handleAssignRoutine = useCallback(async (routineId: string, memberIds: string[]) => {
    return await assignRoutine?.(routineId, memberIds) ?? false
  }, [assignRoutine])

  const getMemberById = useCallback((id: string): FamilyMember | undefined => {
    return familyMembers.find(m => m.id === id)
  }, [familyMembers])

  const getMemberName = useCallback((id: string): string => {
    const member = familyMembers.find(m => m.id === id)
    return member?.name || 'Unknown'
  }, [familyMembers])

  const value: AssignmentContextValue = {
    familyMembers,
    currentUserId,
    assignTask: handleAssignTask,
    assignEvent: handleAssignEvent,
    assignRoutine: handleAssignRoutine,
    getMemberById,
    getMemberName,
  }

  return (
    <AssignmentContext.Provider value={value}>
      {children}
    </AssignmentContext.Provider>
  )
}

/**
 * Hook to access assignment context
 * @throws Error if used outside of AssignmentProvider
 */
export function useAssignment(): AssignmentContextValue {
  const context = useContext(AssignmentContext)
  if (!context) {
    throw new Error('useAssignment must be used within an AssignmentProvider')
  }
  return context
}

/**
 * Hook to optionally access assignment context (returns null if outside provider)
 * Useful for components that can work with or without the context
 */
export function useAssignmentOptional(): AssignmentContextValue | null {
  return useContext(AssignmentContext)
}
