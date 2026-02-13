// useActionSynthesis — Push assessment actions to Symphony as tasks, projects, routines, or goals
// Creates the Symphony item, then links it back to the assessment_actions table

import { useCallback, useState } from 'react'
import { useSupabaseTasks } from './useSupabaseTasks'
import { useProjects } from './useProjects'
import { useRoutines } from './useRoutines'
import { useAssessmentActions } from './useAssessmentActions'
import type { ActionItem, DomainId } from '@/types/manual'

interface PushOptions {
  scheduledFor?: Date
  projectId?: string
  notes?: string
}

interface PushResult {
  symphonyItemId: string
  symphonyItemType: ActionItem['type']
}

export function useActionSynthesis(householdId: string | null) {
  const { addTask } = useSupabaseTasks()
  const { addProject } = useProjects()
  const { addRoutine } = useRoutines()
  const { createAction, linkToSymphony } = useAssessmentActions(householdId)
  const [pushing, setPushing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pushToSymphony = useCallback(async (
    action: ActionItem,
    domainId: DomainId,
    options?: PushOptions,
  ): Promise<PushResult | null> => {
    setPushing(true)
    setError(null)

    try {
      let symphonyItemId: string | null = null
      const actualType = action.type

      switch (actualType) {
        case 'task': {
          const id = await addTask(
            action.title,
            undefined,
            options?.projectId,
            options?.scheduledFor,
          )
          symphonyItemId = id ?? null
          break
        }
        case 'project': {
          const project = await addProject({
            name: action.title,
            notes: action.description || undefined,
          })
          symphonyItemId = project?.id ?? null
          break
        }
        case 'routine': {
          const routine = await addRoutine({
            name: action.title,
            description: action.description || undefined,
          })
          symphonyItemId = routine?.id ?? null
          break
        }
        case 'goal': {
          // Goals require an area — create as task for now
          const id = await addTask(action.title)
          symphonyItemId = id ?? null
          break
        }
      }

      if (!symphonyItemId) {
        setError('Failed to create Symphony item')
        return null
      }

      // Create assessment_action record and link it
      const assessmentActionId = await createAction({
        domain_id: domainId,
        title: action.title,
        description: action.description || undefined,
        effort: action.effort,
        estimated_time: action.estimatedTime,
        action_type: actualType,
        priority: action.priority,
      })

      await linkToSymphony(assessmentActionId, symphonyItemId, actualType)

      return { symphonyItemId, symphonyItemType: actualType }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to push to Symphony'
      setError(msg)
      console.error('pushToSymphony error:', err)
      return null
    } finally {
      setPushing(false)
    }
  }, [addTask, addProject, addRoutine, createAction, linkToSymphony])

  return { pushToSymphony, pushing, error }
}
