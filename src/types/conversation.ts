// Conversation types — AI-facilitated conversations (onboarding, refresh, coaching)

import type { OnboardingPhaseId, DomainId } from './manual'

export interface ConversationTurn {
  role: 'system' | 'assistant' | 'user'
  content: string
  timestamp: string
  extractedData?: Record<string, unknown>
}

export interface Conversation {
  id: string
  household_id: string
  user_id: string
  purpose: ConversationPurpose
  manual_id?: string | null
  phase_id?: OnboardingPhaseId | null
  domain_id?: DomainId | null
  turns: ConversationTurn[]
  status: 'active' | 'completed'
  created_at: string
  updated_at: string
}

export type ConversationPurpose = 'onboarding' | 'domain-assessment' | 'coaching' | 'checkin' | 'facilitation' | 'refresh'

export interface RelishOnboardingProgress {
  introCompleted: boolean
  phasesCompleted: OnboardingPhaseId[]
  currentPhase: OnboardingPhaseId | null
  currentConversationId: string | null
  familyManualId: string | null
}
