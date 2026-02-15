// RelishOnboardingWizard — Domain-at-a-time assessment onboarding
// Flow: Welcome → Household Setup → Wellness → Child Profiles → Domain Picker →
//       Assessment Conversation → Results → Domain Picker (or Launch) → Generate → Complete

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useConversation } from '@/hooks/useConversation'
import { useRelishOnboarding } from '@/hooks/useRelishOnboarding'
import { useHousehold } from '@/hooks/useHousehold'
import { useManual } from '@/hooks/useManual'
import { useYearbook } from '@/hooks/useYearbook'
import { useYearbookGeneration } from '@/hooks/useYearbookGeneration'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { ConversationView } from './ConversationView'
import { DomainPicker } from './DomainPicker'
import { AssessmentResults } from '@/components/manual/AssessmentResults'
import { HouseholdSetup } from '@/components/onboarding/steps/HouseholdSetup'
import { WellnessAssessment } from '@/components/onboarding/steps/WellnessAssessment'
import { ChildProfileForm } from '@/components/onboarding/steps/ChildProfileForm'
import { DOMAIN_ORDER, DOMAIN_NAMES, isDomainAssessed } from '@/types/manual'
import type { PersonalWellness, ChildProfile } from '@/types/userProfile'
import type { DomainId, ManualDomains, DomainAssessment } from '@/types/manual'
import type { ConversationTurn } from '@/types/conversation'

type WizardStep =
  | 'welcome'
  | 'family'
  | 'wellness'
  | 'child-profiles'
  | 'domain-picker'
  | 'domain-conversation'
  | 'domain-results'
  | 'joint-review'
  | 'joint-review-results'
  | 'person-profiles'
  | 'person-profile-conversation'
  | 'generating'
  | 'complete'

const DRAFT_MAX_AGE_MS = 2 * 60 * 60 * 1000 // 2 hours

interface DomainConversationDraft {
  domainId: DomainId
  conversationId: string
  turns: ConversationTurn[]
  lastResponse: {
    type: 'question' | 'synthesis'
    message: string
    structuredData: Record<string, unknown> | null
    conversationId: string
    turnCount: number
    minTurns: number
    maxTurns: number
  } | null
  savedAt: number
}

function getDraftKey(domainId: DomainId): string {
  return `relish-domain-draft-${domainId}`
}

function saveDomainDraft(draft: DomainConversationDraft): void {
  try {
    sessionStorage.setItem(getDraftKey(draft.domainId), JSON.stringify(draft))
  } catch {
    // fail silently
  }
}

function loadDomainDraft(domainId: DomainId): DomainConversationDraft | null {
  try {
    const raw = sessionStorage.getItem(getDraftKey(domainId))
    if (!raw) return null
    const draft = JSON.parse(raw) as DomainConversationDraft
    if (Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
      sessionStorage.removeItem(getDraftKey(domainId))
      return null
    }
    return draft
  } catch {
    return null
  }
}

function clearDomainDraft(domainId: DomainId): void {
  try {
    sessionStorage.removeItem(getDraftKey(domainId))
  } catch {
    // fail silently
  }
}

// Load the most recent active conversation from the server (survives tab close)
// Searches by user_id + domain_id only (not household_id) to handle cases where
// the user's household membership changed (e.g., joined a different household).
async function loadServerDraft(domainId: DomainId): Promise<DomainConversationDraft | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('conversations')
      .select('id, turns, status, created_at')
      .eq('user_id', user.id)
      .eq('domain_id', domainId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) return null

    const turns = (data.turns ?? []) as ConversationTurn[]
    // Only restore if there's meaningful content (at least one user turn)
    const hasUserTurn = turns.some(t => t.role === 'user')
    if (!hasUserTurn) return null

    // Reconstruct a lastResponse from the last assistant turn
    const lastAssistantTurn = [...turns].reverse().find(t => t.role === 'assistant')
    const lastResponse = lastAssistantTurn ? {
      type: 'question' as const,
      message: lastAssistantTurn.content,
      structuredData: null,
      conversationId: data.id,
      turnCount: turns.filter(t => t.role === 'user').length,
      minTurns: 3,
      maxTurns: 10,
    } : null

    return {
      domainId,
      conversationId: data.id,
      turns,
      lastResponse,
      savedAt: new Date(data.created_at).getTime(),
    }
  } catch {
    return null
  }
}

// ==================== Generating Step Component ====================

import type { FamilyMember } from '@/types/family'
import type { Manual } from '@/types/manual'

interface GeneratingStepProps {
  householdId: string | null
  familyMembers: FamilyMember[]
  manuals: Manual[]
  getOrCreateYearbook: (personId: string) => Promise<string>
  generateContent: (personId: string, yearbookId: string, manualId: string, count?: number) => Promise<number>
  isGenerating: boolean
  genProgress: { name: string; done: boolean }[]
  setGenProgress: React.Dispatch<React.SetStateAction<{ name: string; done: boolean }[]>>
  genTotal: number
  setGenTotal: React.Dispatch<React.SetStateAction<number>>
  onDone: () => void
}

function GeneratingStep({
  householdId,
  familyMembers,
  manuals,
  getOrCreateYearbook,
  generateContent,
  genProgress,
  setGenProgress,
  setGenTotal,
  onDone,
}: GeneratingStepProps) {
  const [started, setStarted] = useState(false)

  useEffect(() => {
    if (started || !householdId) return
    setStarted(true)

    const householdManual = manuals.find(m => m.type === 'household')
    if (!householdManual) {
      onDone()
      return
    }

    const members = familyMembers.length > 0 ? familyMembers : []
    if (members.length === 0) {
      onDone()
      return
    }

    setGenProgress(members.map(m => ({ name: m.name, done: false })))

    async function generateForAll() {
      let total = 0
      for (let i = 0; i < members.length; i++) {
        const member = members[i]
        try {
          const yearbookId = await getOrCreateYearbook(member.id)
          const count = await generateContent(member.id, yearbookId, householdManual!.id, 8)
          total += count
        } catch (err) {
          console.error(`Failed to generate for ${member.name}:`, err)
        }
        setGenProgress(prev => prev.map((p, j) => j === i ? { ...p, done: true } : p))
      }
      setGenTotal(total)
      setTimeout(onDone, 1500)
    }

    generateForAll()
  }, [started, householdId, familyMembers, manuals, getOrCreateYearbook, generateContent, setGenProgress, setGenTotal, onDone])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="mb-8">
        <svg className="w-12 h-12 text-stone-600 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-stone-900 mb-3 text-center">
        Generating your family's first entries...
      </h2>
      <p className="text-stone-500 text-center max-w-md mb-8">
        We're creating personalized stories, activities, discussions, and more from your manual.
      </p>

      {genProgress.length > 0 && (
        <div className="space-y-3 w-full max-w-xs">
          {genProgress.map((p, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                p.done ? 'bg-emerald-100' : 'bg-stone-100'
              }`}>
                {p.done ? (
                  <svg className="w-3 h-3 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <div className="w-2 h-2 bg-stone-300 rounded-full animate-pulse" />
                )}
              </div>
              <span className={`text-sm ${p.done ? 'text-emerald-700' : 'text-stone-500'}`}>
                {p.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ==================== Main Wizard ====================

interface RelishOnboardingWizardProps {
  onComplete: () => void
}

export function RelishOnboardingWizard({ onComplete }: RelishOnboardingWizardProps) {
  const { household, updateHousehold } = useHousehold()
  const householdId = household?.id ?? null
  const {
    state: onboardingState, loading: onboardingLoading, currentUserId,
    saveDomainAssessment, saveIndividualProfileData,
    completeIntro, getPreviousPhaseData,
  } = useRelishOnboarding(householdId)
  const {
    turns, isLoading: convLoading, error: convError, lastResponse,
    startDomainAssessment, startIndividualProfile, startJointReview, sendMessage,
    restoreState, reset, conversationId,
  } = useConversation()
  const { members: familyMembers, addMember, updateMember, deleteMember, refetch: refetchFamily } = useFamilyMembers()
  const { manuals, refetch: refetchManuals } = useManual(householdId)
  const { getOrCreateYearbook } = useYearbook(householdId)
  const { generateContent, isGenerating } = useYearbookGeneration(householdId)

  const [step, setStep] = useState<WizardStep>('welcome')
  const [activeDomain, setActiveDomain] = useState<DomainId>('values')
  const [isSaving, setIsSaving] = useState(false)
  const [conversationStarted, setConversationStarted] = useState(false)
  const [synthesisData, setSynthesisData] = useState<DomainAssessment | null>(null)
  const [genProgress, setGenProgress] = useState<{ name: string; done: boolean }[]>([])
  const [genTotal, setGenTotal] = useState(0)
  const restoredFromDraft = useRef(false)
  const [profileMemberIndex, setProfileMemberIndex] = useState(0)
  const [profiledMembers, setProfiledMembers] = useState<string[]>([])
  const [profileConversationStarted, setProfileConversationStarted] = useState(false)
  const [jointReviewStarted, setJointReviewStarted] = useState(false)
  const [jointReviewDomains, setJointReviewDomains] = useState<DomainId[]>([])
  const [jointSynthesisData, setJointSynthesisData] = useState<Record<string, unknown> | null>(null)

  const householdManual = manuals.find(m => m.type === 'household') ?? null

  // Compute per-USER assessed domains (each family member has their own assessment state)
  const assessedDomains: DomainId[] = (householdManual && currentUserId)
    ? DOMAIN_ORDER.filter(id => {
        const meta = householdManual.domain_meta?.[id]
        const assessedBy = meta?.assessed_by

        if (assessedBy) {
          // New per-user tracking: check if current user is in the list
          return assessedBy.includes(currentUserId)
        }

        // Legacy fallback: domain has data but no assessed_by tracking
        // Attribute to the manual creator (user_id on the manual record)
        if (isDomainAssessed(householdManual, id)) {
          return currentUserId === householdManual.user_id
        }

        return false
      })
    : []

  // Compute overlapping domains — domains where both the current user AND another user have assessed
  const overlappingDomains: DomainId[] = (householdManual && currentUserId)
    ? DOMAIN_ORDER.filter(id => {
        const assessedBy = householdManual.domain_meta?.[id]?.assessed_by
        if (!assessedBy || assessedBy.length < 2) return false
        return assessedBy.includes(currentUserId) && assessedBy.some((uid: string) => uid !== currentUserId)
      })
    : []

  // Find the other user's name for joint review UI
  const otherAdultName = familyMembers.find(m =>
    m.is_full_user && m.auth_user_id && m.auth_user_id !== currentUserId
  )?.name ?? 'your partner'
  const currentUserName = familyMembers.find(m =>
    m.auth_user_id === currentUserId
  )?.name ?? 'you'

  // Determine initial step on load
  useEffect(() => {
    if (onboardingLoading) return

    if (onboardingState.introCompleted) {
      // Past intro — go to domain picker (they'll see their progress)
      setStep('domain-picker')
    }
  }, [onboardingLoading, onboardingState.introCompleted])

  // Auto-start domain assessment conversation
  useEffect(() => {
    if (step !== 'domain-conversation' || !householdId || conversationStarted) return
    setConversationStarted(true)

    async function startOrRestore() {
      // 1. Check sessionStorage draft (same tab session)
      const sessionDraft = loadDomainDraft(activeDomain)
      if (sessionDraft && sessionDraft.turns.length > 0) {
        restoredFromDraft.current = true
        restoreState(sessionDraft.turns, sessionDraft.conversationId, sessionDraft.lastResponse, {
          mode: 'domain-assessment',
          domainId: activeDomain,
          householdId: householdId!,
          previousDomains: {},
        })
        return
      }

      // 2. Check server for an existing active conversation (survives tab close)
      const serverDraft = await loadServerDraft(activeDomain)
      if (serverDraft && serverDraft.turns.length > 0) {
        restoredFromDraft.current = true
        restoreState(serverDraft.turns, serverDraft.conversationId, serverDraft.lastResponse, {
          mode: 'domain-assessment',
          domainId: activeDomain,
          householdId: householdId!,
          previousDomains: {},
        })
        return
      }

      // 3. No draft found — start a fresh conversation
      const previousDomains: Record<string, unknown> = {}
      if (householdManual) {
        const domains = householdManual.domains as ManualDomains
        for (const id of assessedDomains) {
          if (id !== activeDomain && domains[id]) {
            previousDomains[id] = domains[id]
          }
        }
      }

      startDomainAssessment(activeDomain, householdId!, previousDomains)
    }

    startOrRestore()
  }, [step, householdId, activeDomain, conversationStarted, startDomainAssessment, householdManual, restoreState])

  // Auto-save conversation draft after each AI response
  useEffect(() => {
    if (step !== 'domain-conversation') return
    if (turns.length === 0 || !conversationId) return
    const hasAiTurn = turns.some(t => t.role === 'assistant')
    if (!hasAiTurn) return

    saveDomainDraft({
      domainId: activeDomain,
      conversationId,
      turns,
      lastResponse,
      savedAt: Date.now(),
    })
  }, [step, turns, conversationId, lastResponse, activeDomain])

  // Detect synthesis response → go to results
  useEffect(() => {
    if (step !== 'domain-conversation') return
    if (lastResponse?.type === 'synthesis' && lastResponse.structuredData) {
      const rawData = lastResponse.structuredData as Record<string, unknown>
      const assessment = (rawData[activeDomain] || rawData) as DomainAssessment
      setSynthesisData(assessment)
      setStep('domain-results')
    }
  }, [step, lastResponse, activeDomain])

  const handleWelcomeContinue = async () => {
    await completeIntro()
    setStep('family')
  }

  const handleFamilyContinue = () => {
    setStep('wellness')
  }

  // Wellness assessment — save to user_profiles
  const [childProfileIndex, setChildProfileIndex] = useState(0)
  const childMembers = familyMembers.filter(m => m.member_type === 'core' && m.role_label === 'child')

  const handleWellnessSave = useCallback(async (data: PersonalWellness) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase
      .from('user_profiles')
      .upsert({ user_id: user.id, personal_wellness: data }, { onConflict: 'user_id' })
    // If there are children, go to child profiles; otherwise domain picker
    if (childMembers.length > 0) {
      setChildProfileIndex(0)
      setStep('child-profiles')
    } else {
      setStep('domain-picker')
    }
  }, [childMembers.length])

  const handleWellnessSkip = useCallback(() => {
    if (childMembers.length > 0) {
      setChildProfileIndex(0)
      setStep('child-profiles')
    } else {
      setStep('domain-picker')
    }
  }, [childMembers.length])

  // Child profiles — save to family_members.child_profile
  const handleChildProfileSave = useCallback(async (childId: string, profile: ChildProfile) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    // Add current user to assessed_by
    const updatedProfile = { ...profile, assessed_by: [user.id] }
    await updateMember(childId, { child_profile: updatedProfile } as Partial<import('@/types/family').FamilyMember>)
    await refetchFamily()
    // Advance to next child or domain picker
    if (childProfileIndex < childMembers.length - 1) {
      setChildProfileIndex(prev => prev + 1)
    } else {
      setStep('domain-picker')
    }
  }, [childProfileIndex, childMembers.length, updateMember, refetchFamily])

  const handleChildProfileSkip = useCallback(() => {
    if (childProfileIndex < childMembers.length - 1) {
      setChildProfileIndex(prev => prev + 1)
    } else {
      setStep('domain-picker')
    }
  }, [childProfileIndex, childMembers.length])

  const handleChildProfileBack = useCallback(() => {
    if (childProfileIndex > 0) {
      setChildProfileIndex(prev => prev - 1)
    } else {
      setStep('wellness')
    }
  }, [childProfileIndex])

  const handleSelectDomain = (domainId: DomainId) => {
    setActiveDomain(domainId)
    setConversationStarted(false)
    setSynthesisData(null)
    reset()
    setStep('domain-conversation')
  }

  // Joint review — start conversation with both partners' assessments
  const handleStartJointReview = useCallback((domainIds: DomainId[]) => {
    setJointReviewDomains(domainIds)
    setJointReviewStarted(false)
    setJointSynthesisData(null)
    reset()
    setStep('joint-review')
  }, [reset])

  // Auto-start joint review conversation
  useEffect(() => {
    if (step !== 'joint-review' || !householdId || jointReviewStarted) return
    setJointReviewStarted(true)

    // Gather both partners' assessments for the overlapping domains
    const domainAssessments: Record<string, unknown> = {}
    if (householdManual) {
      const domains = householdManual.domains as ManualDomains
      for (const domainId of jointReviewDomains) {
        if (domains[domainId]) {
          domainAssessments[domainId] = domains[domainId]
        }
      }
    }

    startJointReview(
      householdId,
      currentUserName,
      otherAdultName,
      jointReviewDomains,
      domainAssessments,
    )
  }, [step, householdId, jointReviewStarted, jointReviewDomains, householdManual, startJointReview, currentUserName, otherAdultName])

  // Detect joint review synthesis → go to results
  useEffect(() => {
    if (step !== 'joint-review') return
    if (lastResponse?.type === 'synthesis' && lastResponse.structuredData) {
      setJointSynthesisData(lastResponse.structuredData)
      setStep('joint-review-results')
    }
  }, [step, lastResponse])

  const handleSendMessage = useCallback(async (message: string): Promise<void> => {
    await sendMessage(message)
  }, [sendMessage])

  // Save assessment results and return to picker
  const handleSaveAssessment = useCallback(async () => {
    if (!synthesisData) return
    setIsSaving(true)
    try {
      await saveDomainAssessment(activeDomain, synthesisData as unknown as Record<string, unknown>)
      clearDomainDraft(activeDomain)
      restoredFromDraft.current = false
      reset()
      setSynthesisData(null)
      // Explicitly refetch manuals so assessedDomains recomputes immediately
      // (don't rely solely on realtime subscription — it can miss updates)
      await refetchManuals()
      setStep('domain-picker')
    } catch (err) {
      console.error('Failed to save domain assessment:', err)
    } finally {
      setIsSaving(false)
    }
  }, [synthesisData, activeDomain, saveDomainAssessment, reset, refetchManuals])

  // Save joint review results — overwrite domains with the agreed-upon assessments
  const handleSaveJointReview = useCallback(async () => {
    if (!jointSynthesisData) return
    setIsSaving(true)
    try {
      // The synthesis should contain updatedDomains with agreed assessments
      const updatedDomains = (jointSynthesisData as Record<string, unknown>).updatedDomains as Record<string, unknown> | undefined
      if (updatedDomains) {
        // Save each agreed domain assessment
        for (const domainId of jointReviewDomains) {
          const agreedAssessment = updatedDomains[domainId] as Record<string, unknown> | undefined
          if (agreedAssessment) {
            await saveDomainAssessment(domainId as DomainId, agreedAssessment)
          }
        }
      }
      reset()
      setJointSynthesisData(null)
      setJointReviewDomains([])
      await refetchManuals()
      setStep('domain-picker')
    } catch (err) {
      console.error('Failed to save joint review:', err)
    } finally {
      setIsSaving(false)
    }
  }, [jointSynthesisData, jointReviewDomains, saveDomainAssessment, reset, refetchManuals])

  const handleLaunch = () => {
    if (familyMembers.length > 0) {
      setProfileMemberIndex(0)
      setProfiledMembers([])
      setStep('person-profiles')
    } else {
      setStep('generating')
    }
  }

  // Auto-start individual profile conversation
  useEffect(() => {
    if (step === 'person-profile-conversation' && householdId && !profileConversationStarted) {
      setProfileConversationStarted(true)
      const member = familyMembers[profileMemberIndex]
      if (member) {
        getPreviousPhaseData().then(prevDomains => {
          startIndividualProfile(householdId, member.name, member.id, prevDomains)
        })
      }
    }
  }, [step, householdId, profileConversationStarted, profileMemberIndex, familyMembers, startIndividualProfile, getPreviousPhaseData])

  // Detect individual profile synthesis and auto-save
  useEffect(() => {
    if (step !== 'person-profile-conversation') return
    if (lastResponse?.type !== 'synthesis' || !lastResponse.structuredData) return

    const member = familyMembers[profileMemberIndex]
    if (!member || profiledMembers.includes(member.id)) return

    setIsSaving(true)
    saveIndividualProfileData(member.id, member.name, lastResponse.structuredData)
      .then(() => {
        setProfiledMembers(prev => [...prev, member.id])
        reset()
        setProfileConversationStarted(false)

        const nextIndex = profileMemberIndex + 1
        if (nextIndex < familyMembers.length) {
          setProfileMemberIndex(nextIndex)
          setStep('person-profiles')
        } else {
          setStep('generating')
        }
      })
      .catch(err => console.error('Failed to save individual profile:', err))
      .finally(() => setIsSaving(false))
  }, [step, lastResponse, profileMemberIndex, familyMembers, profiledMembers, saveIndividualProfileData, reset])

  const handleStartPersonProfile = (index: number) => {
    setProfileMemberIndex(index)
    setProfileConversationStarted(false)
    reset()
    setStep('person-profile-conversation')
  }

  const handleSkipPersonProfiles = () => {
    setStep('generating')
  }

  const handleFinish = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from('user_profiles')
        .update({
          onboarding_step: 'complete',
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
    }
    onComplete()
  }, [onComplete])

  if (onboardingLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="animate-pulse text-neutral-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">
      {/* Dev skip button */}
      {import.meta.env.DEV && (
        <button
          onClick={handleFinish}
          className="fixed top-3 right-3 z-50 px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg opacity-60 hover:opacity-100 transition-opacity"
        >
          Skip onboarding (dev)
        </button>
      )}

      {/* ==================== Welcome ==================== */}
      {step === 'welcome' && (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
          <div className="mb-8">
            <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-stone-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
          </div>

          <h1 className="font-display text-4xl md:text-5xl font-semibold text-neutral-800 text-center mb-4 leading-tight">
            Build your family's
            <br />
            operating manual.
          </h1>

          <p className="text-lg text-neutral-500 text-center max-w-md mb-6 leading-relaxed">
            Through guided conversations, we'll do a deep assessment of how your family actually works &mdash;
            your values, roles, routines, communication, and more.
          </p>

          <p className="text-sm text-stone-400 mb-8">
            Each domain takes about 5 minutes. Start with 3 and add more anytime.
          </p>

          <button
            onClick={handleWelcomeContinue}
            className="btn-primary px-8 py-3 text-lg font-medium"
          >
            Let's begin
          </button>
        </div>
      )}

      {/* ==================== Household Setup ==================== */}
      {step === 'family' && (
        <HouseholdSetup
          household={household}
          members={familyMembers}
          onUpdateHousehold={updateHousehold}
          onAddMember={async (member) => {
            const newMember = await addMember(member)
            await refetchFamily()
            return newMember
          }}
          onUpdateMember={updateMember}
          onDeleteMember={deleteMember}
          onContinue={handleFamilyContinue}
        />
      )}

      {/* ==================== Wellness Assessment ==================== */}
      {step === 'wellness' && (
        <WellnessAssessment
          userName={familyMembers.find(m => m.is_full_user)?.name || 'there'}
          onSave={handleWellnessSave}
          onSkip={handleWellnessSkip}
        />
      )}

      {/* ==================== Child Profiles ==================== */}
      {step === 'child-profiles' && childMembers[childProfileIndex] && (
        <ChildProfileForm
          child={childMembers[childProfileIndex]}
          existingProfile={childMembers[childProfileIndex].child_profile}
          onSave={handleChildProfileSave}
          onSkip={handleChildProfileSkip}
          onBack={handleChildProfileBack}
          currentIndex={childProfileIndex}
          totalChildren={childMembers.length}
        />
      )}

      {/* ==================== Domain Picker ==================== */}
      {step === 'domain-picker' && (
        <DomainPicker
          manual={householdManual}
          assessedDomains={assessedDomains}
          onSelectDomain={handleSelectDomain}
          onLaunch={handleLaunch}
          overlappingDomains={overlappingDomains}
          onStartJointReview={handleStartJointReview}
        />
      )}

      {/* ==================== Domain Assessment Conversation ==================== */}
      {step === 'domain-conversation' && (
        <div className="flex-1 flex flex-col">
          <ConversationView
            turns={turns}
            isLoading={convLoading}
            onSendMessage={handleSendMessage}
            domainId={activeDomain}
            familyName={household?.name}
            error={convError}
            minTurns={lastResponse?.minTurns ?? 3}
            maxTurns={lastResponse?.maxTurns ?? 10}
          />
        </div>
      )}

      {/* ==================== Domain Assessment Results ==================== */}
      {step === 'domain-results' && synthesisData && (
        <AssessmentResults
          domainId={activeDomain}
          assessment={synthesisData}
          onSave={handleSaveAssessment}
          onBack={() => setStep('domain-conversation')}
          saving={isSaving}
        />
      )}

      {/* ==================== Joint Review Conversation ==================== */}
      {step === 'joint-review' && (
        <div className="flex-1 flex flex-col">
          {/* Joint review header */}
          <div className="border-b border-amber-100 px-5 py-3 bg-gradient-to-r from-amber-50/80 to-orange-50/80 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <button
                onClick={() => { reset(); setStep('domain-picker') }}
                className="text-amber-600 hover:text-amber-800 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
                </svg>
              </button>
              <div>
                <h1 className="text-base font-semibold text-amber-900">
                  Joint Review — {currentUserName} & {otherAdultName}
                </h1>
                <p className="text-xs text-amber-600">
                  {jointReviewDomains.map(id => DOMAIN_NAMES[id]).join(', ')}
                </p>
              </div>
            </div>
          </div>
          <div className="flex-1">
            <ConversationView
              turns={turns}
              isLoading={convLoading}
              onSendMessage={handleSendMessage}
              familyName={`${currentUserName} & ${otherAdultName}`}
              error={convError}
              minTurns={lastResponse?.minTurns ?? 4}
              maxTurns={lastResponse?.maxTurns ?? 8}
            />
          </div>
        </div>
      )}

      {/* ==================== Joint Review Results ==================== */}
      {step === 'joint-review-results' && jointSynthesisData && (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
          <div className="animate-fade-in-up flex flex-col items-center text-center max-w-lg w-full">
            <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mb-6">
              <svg className="w-7 h-7 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.746 3.746 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.746 3.746 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
              </svg>
            </div>

            <h2 className="font-display text-2xl font-semibold text-stone-900 mb-2">
              Joint Review Complete
            </h2>
            <p className="text-stone-500 leading-relaxed mb-6">
              You've aligned on a shared picture for{' '}
              {jointReviewDomains.map(id => DOMAIN_NAMES[id]).join(' and ')}.
              This becomes your family's agreed-upon truth.
            </p>

            {/* Show synthesis highlights */}
            {(() => {
              const data = jointSynthesisData as Record<string, unknown>
              const alignments = data.alignments as string[] | undefined
              const tensions = data.tensions as string[] | undefined
              return (
                <div className="w-full space-y-4 mb-8 text-left">
                  {alignments && alignments.length > 0 && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                      <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-2">Where you align</p>
                      <ul className="space-y-1.5">
                        {alignments.slice(0, 4).map((a, i) => (
                          <li key={i} className="text-sm text-emerald-800 flex gap-2">
                            <span className="text-emerald-500 shrink-0">+</span>
                            {a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {tensions && tensions.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">Tensions addressed</p>
                      <ul className="space-y-1.5">
                        {tensions.slice(0, 4).map((t, i) => (
                          <li key={i} className="text-sm text-amber-800 flex gap-2">
                            <span className="text-amber-500 shrink-0">~</span>
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })()}

            <button
              onClick={handleSaveJointReview}
              disabled={isSaving}
              className="w-full py-3 bg-stone-900 text-white rounded-xl hover:bg-stone-800 font-medium mb-3 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save & Return'}
            </button>
            <button
              onClick={() => setStep('joint-review')}
              className="text-sm text-stone-400 hover:text-stone-600 transition-colors"
            >
              Back to conversation
            </button>
          </div>
        </div>
      )}

      {/* ==================== Person Profiles — Intro ==================== */}
      {step === 'person-profiles' && (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
          <div className="animate-fade-in-up flex flex-col items-center text-center max-w-md">
            <div className="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center mb-6">
              <svg className="w-7 h-7 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>

            <h2 className="font-display text-2xl font-semibold text-stone-900 mb-3">
              Quick personal profiles
            </h2>
            <p className="text-stone-500 leading-relaxed mb-8">
              A quick 1-2 minute sketch for each family member. How do they communicate?
              What stresses them? What lights them up? You can deepen these over time.
            </p>

            <div className="space-y-3 w-full mb-8">
              {familyMembers.map((member, i) => {
                const isDone = profiledMembers.includes(member.id)
                const isNext = i === profileMemberIndex && !isDone
                return (
                  <button
                    key={member.id}
                    onClick={() => !isDone && handleStartPersonProfile(i)}
                    disabled={isDone}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
                      isDone
                        ? 'border-emerald-200 bg-emerald-50/50'
                        : isNext
                          ? 'border-stone-300 bg-white hover:bg-stone-50 shadow-sm'
                          : 'border-stone-200 bg-white/50 hover:bg-stone-50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      isDone
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-stone-100 text-stone-500'
                    }`}>
                      {isDone ? (
                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        member.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${isDone ? 'text-emerald-700' : 'text-stone-800'}`}>
                        {member.name}
                      </p>
                      <p className="text-xs text-stone-400">
                        {isDone ? 'Profile complete' : isNext ? 'Ready to start' : 'Waiting'}
                      </p>
                    </div>
                    {isNext && (
                      <span className="text-xs font-medium text-stone-500 px-2 py-1 bg-stone-100 rounded-lg">
                        Start
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <button
              onClick={handleSkipPersonProfiles}
              className="text-sm text-stone-400 hover:text-stone-600 transition-colors"
            >
              Skip for now — I'll add these later
            </button>
          </div>
        </div>
      )}

      {/* ==================== Person Profile Conversation ==================== */}
      {step === 'person-profile-conversation' && (
        <div className="flex-1 flex flex-col">
          <div className="border-b border-stone-100 px-5 py-3 bg-white/80 flex items-center gap-3">
            <button
              onClick={() => setStep('person-profiles')}
              className="text-stone-400 hover:text-stone-600 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-semibold text-stone-900">
                {familyMembers[profileMemberIndex]?.name}'s Profile
              </h1>
              <p className="text-xs text-stone-400">
                Quick sketch — {profileMemberIndex + 1} of {familyMembers.length}
              </p>
            </div>
          </div>
          <div className="flex-1">
            <ConversationView
              turns={turns}
              isLoading={convLoading || isSaving}
              onSendMessage={handleSendMessage}
              familyName={familyMembers[profileMemberIndex]?.name}
              error={convError}
            />
          </div>
        </div>
      )}

      {/* ==================== Generating Yearbooks ==================== */}
      {step === 'generating' && (
        <GeneratingStep
          householdId={householdId}
          familyMembers={familyMembers}
          manuals={manuals}
          getOrCreateYearbook={getOrCreateYearbook}
          generateContent={generateContent}
          isGenerating={isGenerating}
          genProgress={genProgress}
          setGenProgress={setGenProgress}
          genTotal={genTotal}
          setGenTotal={setGenTotal}
          onDone={() => setStep('complete')}
        />
      )}

      {/* ==================== Complete ==================== */}
      {step === 'complete' && (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-8">
            <svg className="w-10 h-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="font-display text-4xl md:text-5xl font-semibold text-neutral-800 text-center mb-4">
            Your manual is ready.
          </h1>

          <p className="text-lg text-neutral-500 text-center max-w-md mb-4">
            You've mapped your family's operating system.
          </p>

          {genTotal > 0 && (
            <p className="text-emerald-600 font-medium text-center mb-4">
              {genTotal} entries created across {genProgress.length} yearbook{genProgress.length !== 1 ? 's' : ''}
            </p>
          )}

          <p className="text-sm text-stone-400 text-center max-w-md mb-8">
            Explore your manual, browse yearbook entries,
            and check in weekly to keep things aligned.
          </p>

          <button
            onClick={handleFinish}
            className="btn-primary px-8 py-3 text-lg font-medium"
          >
            Go to Relish
          </button>
        </div>
      )}
    </div>
  )
}
