// Generalized Intelligence Layer types
// Every layer (Relish, Work, Organization, Wellness) uses these same structures.

// ── Domain Assessment ──────────────────────────────────────────────

export interface DomainAssessment {
  id: string
  userId: string
  layerId: string
  domainSlug: string
  harmonyScore: number          // 0-100 (maps from 1-5 self-rating: 20/40/60/80/100)
  summary: string | null        // AI-generated one-liner after deep assessment
  strengths: string[]
  issues: string[]
  opportunities: string[]
  challengeNote: string | null  // free-text from quick assessment
  assessedAt: string
  updatedAt: string
}

export interface QuickAssessmentInput {
  domainSlug: string
  rating: number                // 1-5
  challengeNote?: string
}

// ── Assessment Conversations (deep assessment) ─────────────────────

export interface AssessmentConversation {
  id: string
  userId: string
  layerId: string
  domainSlug: string
  messages: ConversationMessage[]
  status: 'in_progress' | 'completed'
  createdAt: string
  updatedAt: string
}

export interface ConversationMessage {
  role: 'assistant' | 'user'
  content: string
  timestamp: string
}

// ── Layer Rules ────────────────────────────────────────────────────

export interface LayerRule {
  id: string
  userId: string
  layerId: string | null
  rule: string
  appliesTo: string[]
  category: string | null       // slug from layer's ruleCategories config
  status: 'draft' | 'active' | 'paused' | 'retired'
  rationale: string | null
  enforcementTip: string | null
  createdAt: string
  updatedAt: string
}

export type CreateLayerRuleInput = {
  rule: string
  appliesTo?: string[]
  category?: string
  status?: LayerRule['status']
  rationale?: string
  enforcementTip?: string
  layerId?: string
}

export type UpdateLayerRuleInput = Partial<Omit<LayerRule, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
