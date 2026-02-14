// useRelishOnboarding — manages Relish phase-based onboarding state
// Ported from Relish, adapted for Supabase (replaces Firestore operations)

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { OnboardingPhaseId, DomainId } from '@/types/manual'
import { emptyDomains, emptyIndividualDomains, PHASE_DOMAINS, DOMAIN_ORDER } from '@/types/manual'

const PHASE_ORDER: OnboardingPhaseId[] = ['foundation', 'relationships', 'operations', 'strategy']

// Merge two domain objects by concatenating arrays (with dedup) and taking
// the incoming value for non-array fields. This ensures a second family
// member's onboarding adds to the manual rather than replacing it.
function mergeDomainData(existing: unknown, incoming: unknown): unknown {
  if (!existing) return incoming
  if (!incoming) return existing

  // Both are objects — merge field by field
  if (
    typeof existing === 'object' && !Array.isArray(existing) &&
    typeof incoming === 'object' && !Array.isArray(incoming)
  ) {
    const existingObj = existing as Record<string, unknown>
    const incomingObj = incoming as Record<string, unknown>
    const merged: Record<string, unknown> = { ...existingObj }

    for (const key of Object.keys(incomingObj)) {
      const existingVal = existingObj[key]
      const incomingVal = incomingObj[key]

      if (Array.isArray(incomingVal)) {
        const existingArr = Array.isArray(existingVal) ? existingVal : []
        // Deduplicate: for strings use direct comparison, for objects use JSON
        const seen = new Set(existingArr.map(item =>
          typeof item === 'string' ? item : JSON.stringify(item)
        ))
        const combined = [...existingArr]
        for (const item of incomingVal) {
          const key = typeof item === 'string' ? item : JSON.stringify(item)
          if (!seen.has(key)) {
            combined.push(item)
            seen.add(key)
          }
        }
        merged[key] = combined
      } else {
        // Non-array fields (e.g. decisionStyle string): take incoming
        merged[key] = incomingVal
      }
    }
    return merged
  }

  // Fallback: take incoming
  return incoming
}

interface RelishOnboardingState {
  introCompleted: boolean
  phasesCompleted: OnboardingPhaseId[]
  currentPhase: OnboardingPhaseId | null
  familyManualId: string | null
}

interface UseRelishOnboardingReturn {
  state: RelishOnboardingState
  loading: boolean
  currentUserId: string | null
  savePhaseData: (phaseId: OnboardingPhaseId, data: Record<string, unknown>) => Promise<void>
  saveDomainAssessment: (domainId: DomainId, assessmentData: Record<string, unknown>) => Promise<void>
  saveIndividualProfileData: (personId: string, personName: string, data: Record<string, unknown>) => Promise<void>
  completePhase: (phaseId: OnboardingPhaseId) => Promise<void>
  completeIntro: () => Promise<void>
  getNextPhase: () => OnboardingPhaseId | null
  isPhaseComplete: (phaseId: OnboardingPhaseId) => boolean
  isOnboardingComplete: boolean
  getPreviousPhaseData: () => Promise<Record<string, unknown>>
  getAssessedDomains: () => Promise<DomainId[]>
  getCurrentPhaseData: (phaseId: OnboardingPhaseId) => Promise<Record<string, unknown>>
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const manualIdRef = useRef<string | null>(null)

  // Fetch current onboarding state from user_profiles
  const fetchState = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setCurrentUserId(user.id)

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

  // Get or create the household manual (one per household, shared by all members)
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
        // Merge with existing data so multiple family members' input combines
        updatedDomains[domainId] = mergeDomainData(updatedDomains[domainId], data[domainId])
        const existingAssessedBy = (updatedMeta[domainId] as Record<string, unknown>)?.assessed_by as string[] || []
        updatedMeta[domainId] = {
          updated_at: now,
          updated_by: 'onboarding',
          assessed_by: existingAssessedBy.includes(user.id) ? existingAssessedBy : [...existingAssessedBy, user.id],
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

  // Save a single domain assessment (DomainAssessment format) — used by domain-at-a-time flow
  // MERGES with existing data so multiple family members' assessments combine
  const saveDomainAssessment = useCallback(async (domainId: DomainId, assessmentData: Record<string, unknown>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No user')

    const manualId = await getOrCreateManual()

    const { data: currentManual, error: readError } = await supabase
      .from('manuals')
      .select('domains, domain_meta')
      .eq('id', manualId)
      .single()

    if (readError) throw readError

    const now = new Date().toISOString()

    // The edge function wraps data as { [domainId]: assessmentData }
    // Extract the domain data if it's wrapped, otherwise use directly
    const domainData = assessmentData[domainId] ?? assessmentData
    const existingDomainData = (currentManual.domains as Record<string, unknown>)?.[domainId] || {}

    // Merge with existing data so multiple family members' input combines
    // (arrays get concatenated with dedup, non-array fields take incoming)
    const mergedDomainData = mergeDomainData(existingDomainData, domainData) as Record<string, unknown>

    // Update metadata fields on top of merged data
    const existingConversationCount = (existingDomainData as Record<string, unknown>)?.conversationCount as number || 0
    mergedDomainData.lastAssessedAt = now
    mergedDomainData.assessmentDepth = (domainData as Record<string, unknown>).assessmentDepth || 'initial'
    mergedDomainData.conversationCount = existingConversationCount + 1

    const updatedDomains = {
      ...currentManual.domains,
      [domainId]: mergedDomainData,
    }

    // Track which users have assessed this domain
    const currentMeta = (currentManual.domain_meta || {}) as Record<string, Record<string, unknown>>
    const domainMetaEntry = currentMeta[domainId] || {}
    const assessedBy = (domainMetaEntry.assessed_by as string[]) || []
    const updatedAssessedBy = assessedBy.includes(user.id) ? assessedBy : [...assessedBy, user.id]

    const updatedMeta = {
      ...currentMeta,
      [domainId]: {
        updated_at: now,
        updated_by: 'assessment',
        assessed_by: updatedAssessedBy,
      },
    }

    const { error: updateError } = await supabase
      .from('manuals')
      .update({ domains: updatedDomains, domain_meta: updatedMeta })
      .eq('id', manualId)

    if (updateError) throw updateError
  }, [getOrCreateManual])

  // Get list of domains the CURRENT USER has assessed (per-user tracking)
  const getAssessedDomains = useCallback(async (): Promise<DomainId[]> => {
    const manualId = state.familyManualId || manualIdRef.current
    if (!manualId) return []

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []

      const { data: manual, error } = await supabase
        .from('manuals')
        .select('domains, domain_meta, user_id')
        .eq('id', manualId)
        .single()

      if (error || !manual) return []

      const assessed: DomainId[] = []
      const meta = (manual.domain_meta || {}) as Record<string, Record<string, unknown>>

      for (const domainId of DOMAIN_ORDER) {
        const domainMeta = meta[domainId]
        const assessedBy = domainMeta?.assessed_by as string[] | undefined

        if (assessedBy) {
          // New per-user tracking: check if current user is in the list
          if (assessedBy.includes(user.id)) {
            assessed.push(domainId)
          }
        } else {
          // Legacy fallback: domain has data but no assessed_by tracking
          // Attribute to the manual creator (user_id)
          const domains = manual.domains as Record<string, Record<string, unknown>>
          const domain = domains[domainId]
          if (domain?.assessmentDepth && domain.assessmentDepth !== 'none' && user.id === manual.user_id) {
            assessed.push(domainId)
          }
        }
      }
      return assessed
    } catch {
      return []
    }
  }, [state.familyManualId])

  // Save individual profile data — get or create individual manual for person
  const saveIndividualProfileData = useCallback(async (personId: string, personName: string, data: Record<string, unknown>) => {
    if (!householdId) throw new Error('No household')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No user')

    // Check for existing individual manual
    const { data: existing } = await supabase
      .from('manuals')
      .select('id, individual_domains, domain_meta')
      .eq('household_id', householdId)
      .eq('type', 'individual')
      .eq('person_id', personId)
      .maybeSingle()

    const now = new Date().toISOString()

    if (existing) {
      // Merge with existing individual domains
      const currentDomains = existing.individual_domains || emptyIndividualDomains
      const updatedDomains: Record<string, unknown> = { ...currentDomains }
      const updatedMeta = { ...(existing.domain_meta || {}) }

      for (const [domainId, domainData] of Object.entries(data)) {
        if (domainData) {
          updatedDomains[domainId] = mergeDomainData(
            (currentDomains as Record<string, unknown>)[domainId],
            domainData
          )
          updatedMeta[domainId] = { updated_at: now, updated_by: 'onboarding' }
        }
      }

      const { error } = await supabase
        .from('manuals')
        .update({ individual_domains: updatedDomains, domain_meta: updatedMeta })
        .eq('id', existing.id)

      if (error) throw error
    } else {
      // Create new individual manual
      const individualDomains: Record<string, unknown> = { ...emptyIndividualDomains }
      const meta: Record<string, unknown> = {}

      for (const [domainId, domainData] of Object.entries(data)) {
        if (domainData) {
          individualDomains[domainId] = domainData
          meta[domainId] = { updated_at: now, updated_by: 'onboarding' }
        }
      }

      const { error } = await supabase
        .from('manuals')
        .insert({
          household_id: householdId,
          user_id: user.id,
          type: 'individual',
          person_id: personId,
          title: personName,
          subtitle: `How to understand and support ${personName}`,
          domains: emptyDomains, // household domains empty for individual
          individual_domains: individualDomains,
          domain_meta: meta,
        })

      if (error) throw error
    }
  }, [householdId])

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

  // Get existing domain data for a specific phase (from another family member's contribution)
  const getCurrentPhaseData = useCallback(async (phaseId: OnboardingPhaseId): Promise<Record<string, unknown>> => {
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
      const domains = PHASE_DOMAINS[phaseId]
      for (const domainId of domains) {
        const domainData = (manual.domains as Record<string, unknown>)[domainId]
        // Only include if there's actual content (not just empty arrays)
        if (domainData && JSON.stringify(domainData) !== JSON.stringify((emptyDomains as unknown as Record<string, unknown>)[domainId])) {
          result[domainId] = domainData
        }
      }

      return result
    } catch {
      return {}
    }
  }, [state.familyManualId])

  return {
    state,
    loading,
    currentUserId,
    savePhaseData,
    saveDomainAssessment,
    saveIndividualProfileData,
    completePhase,
    completeIntro,
    getNextPhase,
    isPhaseComplete,
    isOnboardingComplete,
    getPreviousPhaseData,
    getAssessedDomains,
    getCurrentPhaseData,
    refetch: fetchState,
  }
}
