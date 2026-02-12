// useRelishOnboarding — manages Relish phase-based onboarding state
// Ported from Relish, adapted for Supabase (replaces Firestore operations)

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { OnboardingPhaseId } from '@/types/manual'
import { emptyDomains, PHASE_DOMAINS } from '@/types/manual'

const PHASE_ORDER: OnboardingPhaseId[] = ['foundation', 'relationships', 'operations', 'strategy']

interface RelishOnboardingState {
  introCompleted: boolean
  phasesCompleted: OnboardingPhaseId[]
  currentPhase: OnboardingPhaseId | null
  familyManualId: string | null
}

interface UseRelishOnboardingReturn {
  state: RelishOnboardingState
  loading: boolean
  savePhaseData: (phaseId: OnboardingPhaseId, data: Record<string, unknown>) => Promise<void>
  completePhase: (phaseId: OnboardingPhaseId) => Promise<void>
  completeIntro: () => Promise<void>
  getNextPhase: () => OnboardingPhaseId | null
  isPhaseComplete: (phaseId: OnboardingPhaseId) => boolean
  isOnboardingComplete: boolean
  getPreviousPhaseData: () => Promise<Record<string, unknown>>
  refetch: () => Promise<void>
}

export function useRelishOnboarding(householdId: string | null): UseRelishOnboardingReturn {
  const [state, setState] = useState<RelishOnboardingState>({
    introCompleted: false,
    phasesCompleted: [],
    currentPhase: 'foundation',
    familyManualId: null,
  })
  const [loading, setLoading] = useState(true)

  const manualIdRef = useRef<string | null>(null)

  // Fetch current onboarding state from user_profiles
  const fetchState = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('relish_intro_completed, relish_onboarding_phases_completed, relish_current_phase, family_manual_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) {
        console.error('Error fetching relish onboarding state:', error)
        return
      }

      if (profile) {
        const phasesCompleted = (profile.relish_onboarding_phases_completed || []) as OnboardingPhaseId[]
        const currentPhase = (profile.relish_current_phase as OnboardingPhaseId) || 'foundation'
        const familyManualId = profile.family_manual_id || null

        setState({
          introCompleted: !!profile.relish_intro_completed,
          phasesCompleted,
          currentPhase,
          familyManualId,
        })
        manualIdRef.current = familyManualId
      }
    } catch (err) {
      console.error('Error in fetchRelishOnboardingState:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchState()
  }, [fetchState])

  const isPhaseComplete = useCallback((phaseId: OnboardingPhaseId) => {
    return state.phasesCompleted.includes(phaseId)
  }, [state.phasesCompleted])

  const isOnboardingComplete = state.phasesCompleted.length >= 2 // Foundation + Relationships minimum

  const getNextPhase = useCallback((): OnboardingPhaseId | null => {
    return PHASE_ORDER.find(p => !state.phasesCompleted.includes(p)) ?? null
  }, [state.phasesCompleted])

  // Get or create the household manual
  const getOrCreateManual = useCallback(async (): Promise<string> => {
    if (manualIdRef.current) return manualIdRef.current
    if (!householdId) throw new Error('No household')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No user')

    // Check if a household manual already exists
    const { data: existing } = await supabase
      .from('manuals')
      .select('id')
      .eq('household_id', householdId)
      .eq('type', 'household')
      .maybeSingle()

    if (existing) {
      manualIdRef.current = existing.id
      return existing.id
    }

    // Create new household manual
    const { data: newManual, error } = await supabase
      .from('manuals')
      .insert({
        household_id: householdId,
        user_id: user.id,
        type: 'household',
        title: 'Our Family',
        subtitle: 'The operating manual for how we do things',
        domains: emptyDomains,
        domain_meta: {},
      })
      .select('id')
      .single()

    if (error) throw error
    manualIdRef.current = newManual.id
    return newManual.id
  }, [householdId])

  // Save AI synthesis data for a phase (updates 2 domains on the manual)
  const savePhaseData = useCallback(async (phaseId: OnboardingPhaseId, data: Record<string, unknown>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No user')

    const manualId = await getOrCreateManual()

    // First, read the current manual to merge domain data
    const { data: currentManual, error: readError } = await supabase
      .from('manuals')
      .select('domains, domain_meta')
      .eq('id', manualId)
      .single()

    if (readError) throw readError

    const domains = PHASE_DOMAINS[phaseId]
    const updatedDomains = { ...currentManual.domains }
    const updatedMeta = { ...(currentManual.domain_meta || {}) }
    const now = new Date().toISOString()

    for (const domainId of domains) {
      if (data[domainId]) {
        updatedDomains[domainId] = data[domainId]
        updatedMeta[domainId] = {
          updated_at: now,
          updated_by: 'onboarding',
        }
      }
    }

    const { error: updateError } = await supabase
      .from('manuals')
      .update({
        domains: updatedDomains,
        domain_meta: updatedMeta,
      })
      .eq('id', manualId)

    if (updateError) throw updateError
  }, [getOrCreateManual])

  // Mark a phase as completed and advance to next
  const completePhase = useCallback(async (phaseId: OnboardingPhaseId) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No user')

    const manualId = await getOrCreateManual()
    const newCompleted = state.phasesCompleted.includes(phaseId)
      ? state.phasesCompleted
      : [...state.phasesCompleted, phaseId]
    const nextPhase = PHASE_ORDER.find(p => !newCompleted.includes(p)) ?? null

    const { error } = await supabase
      .from('user_profiles')
      .update({
        relish_intro_completed: true,
        relish_onboarding_phases_completed: newCompleted,
        relish_current_phase: nextPhase,
        family_manual_id: manualId,
      })
      .eq('user_id', user.id)

    if (error) throw error

    setState(prev => ({
      ...prev,
      introCompleted: true,
      phasesCompleted: newCompleted,
      currentPhase: nextPhase,
      familyManualId: manualId,
    }))
  }, [state.phasesCompleted, getOrCreateManual])

  // Mark intro as completed
  const completeIntro = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No user')

    const { error } = await supabase
      .from('user_profiles')
      .update({ relish_intro_completed: true })
      .eq('user_id', user.id)

    if (error) throw error

    setState(prev => ({ ...prev, introCompleted: true }))
  }, [])

  // Get all domain data from previously completed phases
  const getPreviousPhaseData = useCallback(async (): Promise<Record<string, unknown>> => {
    const manualId = state.familyManualId || manualIdRef.current
    if (!manualId) return {}

    try {
      const { data: manual, error } = await supabase
        .from('manuals')
        .select('domains')
        .eq('id', manualId)
        .single()

      if (error || !manual) return {}

      const result: Record<string, unknown> = {}
      for (const phaseId of state.phasesCompleted) {
        const domains = PHASE_DOMAINS[phaseId]
        for (const domainId of domains) {
          result[domainId] = (manual.domains as Record<string, unknown>)[domainId]
        }
      }

      return result
    } catch {
      return {}
    }
  }, [state.familyManualId, state.phasesCompleted])

  return {
    state,
    loading,
    savePhaseData,
    completePhase,
    completeIntro,
    getNextPhase,
    isPhaseComplete,
    isOnboardingComplete,
    getPreviousPhaseData,
    refetch: fetchState,
  }
}
