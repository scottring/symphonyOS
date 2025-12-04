import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export type OnboardingStep =
  | 'welcome'
  | 'building_blocks'
  | 'tasks'
  | 'projects'
  | 'routines'
  | 'family'
  | 'assign'
  | 'triage'
  | 'today'
  | 'complete'

const STEP_ORDER: OnboardingStep[] = [
  'welcome',
  'building_blocks',
  'tasks',
  'projects',
  'routines',
  'family',
  'assign',
  'triage',
  'today',
  'complete',
]

export interface RoutineInput {
  name: string
  recurrence: 'daily' | 'weekdays' | 'weekly'
}

export interface OnboardingData {
  taskIds: string[]
  projectIds: string[]
  routineIds: string[]
  familyMemberIds: string[]
}

interface UserProfile {
  id: string
  user_id: string
  onboarding_step: OnboardingStep
  onboarding_completed_at: string | null
}

export function useOnboarding() {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome')
  const [loading, setLoading] = useState(true)
  const [isComplete, setIsComplete] = useState(false)
  const [data, setData] = useState<OnboardingData>({
    taskIds: [],
    projectIds: [],
    routineIds: [],
    familyMemberIds: [],
  })

  // Fetch current onboarding state
  const fetchOnboardingState = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = row not found, which is expected for new users
        console.error('Error fetching onboarding state:', error)
      }

      if (profile) {
        const p = profile as UserProfile
        setCurrentStep(p.onboarding_step as OnboardingStep)
        setIsComplete(!!p.onboarding_completed_at)
      } else {
        // Create initial profile
        const { error: insertError } = await supabase
          .from('user_profiles')
          .insert({ user_id: user.id, onboarding_step: 'welcome' })

        if (insertError) {
          console.error('Error creating profile:', insertError)
        }
      }
    } catch (err) {
      console.error('Error in fetchOnboardingState:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOnboardingState()
  }, [fetchOnboardingState])

  // Save step to database
  const saveStep = useCallback(async (step: OnboardingStep) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('user_profiles')
        .update({ onboarding_step: step })
        .eq('user_id', user.id)

      if (error) {
        console.error('Error saving onboarding step:', error)
      }
    } catch (err) {
      console.error('Error in saveStep:', err)
    }
  }, [])

  // Go to next step
  const nextStep = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(currentStep)
    if (currentIndex < STEP_ORDER.length - 1) {
      const next = STEP_ORDER[currentIndex + 1]
      setCurrentStep(next)
      saveStep(next)
    }
  }, [currentStep, saveStep])

  // Go to previous step
  const prevStep = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(currentStep)
    if (currentIndex > 0) {
      const prev = STEP_ORDER[currentIndex - 1]
      setCurrentStep(prev)
      saveStep(prev)
    }
  }, [currentStep, saveStep])

  // Skip to a specific step
  const goToStep = useCallback((step: OnboardingStep) => {
    setCurrentStep(step)
    saveStep(step)
  }, [saveStep])

  // Mark onboarding as complete
  const completeOnboarding = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('user_profiles')
        .update({
          onboarding_step: 'complete',
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)

      if (error) {
        console.error('Error completing onboarding:', error)
      } else {
        setIsComplete(true)
        setCurrentStep('complete')
      }
    } catch (err) {
      console.error('Error in completeOnboarding:', err)
    }
  }, [])

  // Add created IDs to data store
  const addTaskId = useCallback((id: string) => {
    setData(prev => ({ ...prev, taskIds: [...prev.taskIds, id] }))
  }, [])

  const addProjectId = useCallback((id: string) => {
    setData(prev => ({ ...prev, projectIds: [...prev.projectIds, id] }))
  }, [])

  const addRoutineId = useCallback((id: string) => {
    setData(prev => ({ ...prev, routineIds: [...prev.routineIds, id] }))
  }, [])

  const setFamilyMemberIds = useCallback((ids: string[]) => {
    setData(prev => ({ ...prev, familyMemberIds: ids }))
  }, [])

  // Progress calculation
  const stepIndex = STEP_ORDER.indexOf(currentStep)
  const totalSteps = STEP_ORDER.length
  const progress = (stepIndex / (totalSteps - 1)) * 100

  return {
    currentStep,
    loading,
    isComplete,
    data,
    progress,
    stepIndex,
    totalSteps,
    nextStep,
    prevStep,
    goToStep,
    completeOnboarding,
    addTaskId,
    addProjectId,
    addRoutineId,
    setFamilyMemberIds,
  }
}
