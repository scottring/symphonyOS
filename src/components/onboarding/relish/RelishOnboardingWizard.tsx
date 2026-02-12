// RelishOnboardingWizard — replaces the brain-dump onboarding with Relish's
// AI diagnostic conversation flow. Internal state machine, no routing needed.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useConversation } from '@/hooks/useConversation'
import { useRelishOnboarding } from '@/hooks/useRelishOnboarding'
import { useHousehold } from '@/hooks/useHousehold'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { ConversationView } from './ConversationView'
import { PhaseProgress } from './PhaseProgress'
import { SynthesisReview } from './SynthesisReview'
import { FamilySetup } from '@/components/onboarding/steps/FamilySetup'
import { PHASE_NAMES, PHASE_DESCRIPTIONS } from '@/types/manual'
import type { OnboardingPhaseId } from '@/types/manual'

type WizardStep =
  | 'welcome'
  | 'family'
  | 'phase-conversation'
  | 'phase-review'
  | 'choose-next'
  | 'complete'

const VALID_PHASES: OnboardingPhaseId[] = ['foundation', 'relationships', 'operations', 'strategy']
const MIN_PHASES_FOR_LAUNCH = 2

interface RelishOnboardingWizardProps {
  onComplete: () => void
}

export function RelishOnboardingWizard({ onComplete }: RelishOnboardingWizardProps) {
  const { household } = useHousehold()
  const householdId = household?.id ?? null
  const { state: onboardingState, loading: onboardingLoading, savePhaseData, completePhase, completeIntro, getNextPhase, getPreviousPhaseData } = useRelishOnboarding(householdId)
  const { turns, isLoading: convLoading, error: convError, lastResponse, startConversation, sendMessage } = useConversation()
  const { members: familyMembers, addMember, updateMember, deleteMember, refetch: refetchFamily } = useFamilyMembers()

  const [step, setStep] = useState<WizardStep>('welcome')
  const [activePhase, setActivePhase] = useState<OnboardingPhaseId>('foundation')
  const [isSaving, setIsSaving] = useState(false)
  const [conversationStarted, setConversationStarted] = useState(false)
  const [savedNextPhase, setSavedNextPhase] = useState<OnboardingPhaseId | null>(null)

  // Determine initial step based on existing onboarding state
  useEffect(() => {
    if (onboardingLoading) return

    if (onboardingState.introCompleted) {
      // Already past intro — figure out where they left off
      const nextPhase = getNextPhase()
      if (nextPhase) {
        setActivePhase(nextPhase)
        setStep('phase-conversation')
      } else {
        setStep('complete')
      }
    }
  }, [onboardingLoading, onboardingState.introCompleted, getNextPhase])

  // Auto-start conversation when entering phase-conversation step
  useEffect(() => {
    if (step === 'phase-conversation' && householdId && !conversationStarted) {
      setConversationStarted(true)
      getPreviousPhaseData().then(prevDomains => {
        startConversation(activePhase, householdId, prevDomains)
      })
    }
  }, [step, householdId, activePhase, conversationStarted, startConversation, getPreviousPhaseData])

  // Detect synthesis response
  useEffect(() => {
    if (lastResponse?.type === 'synthesis' && lastResponse.structuredData) {
      setStep('phase-review')
    }
  }, [lastResponse])

  const handleWelcomeContinue = async () => {
    await completeIntro()
    setStep('family')
  }

  const handleFamilyContinue = () => {
    const nextPhase = getNextPhase() || 'foundation'
    setActivePhase(nextPhase)
    setConversationStarted(false)
    setStep('phase-conversation')
  }

  const handleSendMessage = useCallback(async (message: string) => {
    await sendMessage(message)
  }, [sendMessage])

  const handleApprovePhase = useCallback(async (editedData?: Record<string, unknown>) => {
    const dataToSave = editedData || lastResponse?.structuredData
    if (!dataToSave) return

    setIsSaving(true)
    try {
      await savePhaseData(activePhase, dataToSave)
      await completePhase(activePhase)

      // Compute next phase from what we know is now complete
      const completedAfterThis = [...onboardingState.phasesCompleted, activePhase]
      const uniqueCompleted = [...new Set(completedAfterThis)]
      const next = VALID_PHASES.find(p => !uniqueCompleted.includes(p)) ?? null

      if (!next) {
        // All phases done
        setStep('complete')
      } else if (uniqueCompleted.length >= MIN_PHASES_FOR_LAUNCH) {
        // Minimum met — offer choice
        setSavedNextPhase(next)
        setStep('choose-next')
      } else {
        // Not enough yet — auto-advance
        setActivePhase(next)
        setConversationStarted(false)
        setStep('phase-conversation')
      }
    } catch (err) {
      console.error('Failed to save phase:', err)
    } finally {
      setIsSaving(false)
    }
  }, [lastResponse, activePhase, savePhaseData, completePhase, onboardingState.phasesCompleted])

  const handleContinueToNext = () => {
    if (savedNextPhase) {
      setActivePhase(savedNextPhase)
      setConversationStarted(false)
      setStep('phase-conversation')
    }
  }

  const handleLaunch = () => {
    setStep('complete')
  }

  const handleFinish = useCallback(async () => {
    // Mark Relish onboarding as complete so it persists on reload
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
            Through a few guided conversations, we'll map out how your family actually works &mdash;
            your values, communication patterns, roles, routines, and more.
          </p>

          <p className="text-sm text-stone-400 mb-8">
            Each conversation takes about 5 minutes. You'll start with 2 and can add more anytime.
          </p>

          <button
            onClick={handleWelcomeContinue}
            className="btn-primary px-8 py-3 text-lg font-medium"
          >
            Let's begin
          </button>
        </div>
      )}

      {/* ==================== Family Setup ==================== */}
      {step === 'family' && (
        <FamilySetup
          members={familyMembers}
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

      {/* ==================== Phase Conversation ==================== */}
      {step === 'phase-conversation' && (
        <>
          <div className="border-b border-stone-200 bg-white px-4 py-3">
            <div className="max-w-2xl mx-auto flex items-center justify-between">
              <div>
                <h1 className="text-lg font-semibold text-stone-900">
                  {PHASE_NAMES[activePhase]}
                </h1>
                <p className="text-xs text-stone-400">{PHASE_DESCRIPTIONS[activePhase]}</p>
              </div>
              <PhaseProgress
                completedPhases={onboardingState.phasesCompleted}
                currentPhase={activePhase}
              />
            </div>
          </div>

          {convError && (
            <div className="px-4 py-2 bg-red-50 border-b border-red-200">
              <p className="text-sm text-red-700 max-w-2xl mx-auto">{convError}</p>
            </div>
          )}

          <div className="flex-1 max-w-2xl mx-auto w-full">
            <ConversationView
              turns={turns}
              isLoading={convLoading}
              onSendMessage={handleSendMessage}
              phaseId={activePhase}
            />
          </div>
        </>
      )}

      {/* ==================== Phase Review ==================== */}
      {step === 'phase-review' && lastResponse?.structuredData && (
        <>
          <div className="border-b border-stone-200 bg-white px-4 py-3">
            <div className="max-w-2xl mx-auto flex items-center justify-between">
              <h1 className="text-lg font-semibold text-stone-900">Review: {PHASE_NAMES[activePhase]}</h1>
              <PhaseProgress
                completedPhases={onboardingState.phasesCompleted}
                currentPhase={activePhase}
              />
            </div>
          </div>
          <div className="flex-1 max-w-2xl mx-auto w-full p-4">
            <SynthesisReview
              phaseId={activePhase}
              summary={lastResponse.message}
              structuredData={lastResponse.structuredData}
              onApprove={handleApprovePhase}
              isLoading={isSaving}
            />
          </div>
        </>
      )}

      {/* ==================== Choose Next ==================== */}
      {step === 'choose-next' && (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
          <div className="animate-fade-in-up flex flex-col items-center text-center max-w-md">
            <h2 className="text-2xl font-bold text-stone-900 mb-3">
              Nice work
            </h2>
            <p className="text-stone-500 leading-relaxed mb-10">
              You've covered enough ground to bring your manual to life.
              You can keep going to make it richer, or jump in now.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <button
                onClick={handleLaunch}
                className="flex-1 px-6 py-3 bg-stone-900 text-white rounded-xl hover:bg-stone-800 font-medium"
              >
                Enter the app
              </button>
              {savedNextPhase && (
                <button
                  onClick={handleContinueToNext}
                  className="flex-1 px-6 py-3 border border-stone-300 text-stone-700 rounded-xl hover:bg-stone-50 font-medium"
                >
                  Continue to {PHASE_NAMES[savedNextPhase]}
                  <span className="block text-xs text-stone-400 mt-0.5">
                    {VALID_PHASES.filter(p =>
                      !onboardingState.phasesCompleted.includes(p) && p !== activePhase
                    ).length} {VALID_PHASES.filter(p =>
                      !onboardingState.phasesCompleted.includes(p) && p !== activePhase
                    ).length === 1 ? 'phase' : 'phases'} remaining
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== Complete ==================== */}
      {step === 'complete' && (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-8">
            <svg
              className="w-10 h-10 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          <h1 className="font-display text-4xl md:text-5xl font-semibold text-neutral-800 text-center mb-4">
            Your manual is ready.
          </h1>

          <p className="text-lg text-neutral-500 text-center max-w-md mb-8">
            You've mapped your family's operating system. Explore your manual, add yearbook entries,
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
