// Manual types — domain-based family operating manual
// Research grounding: McMaster, Olson Circumplex, Walsh, Gottman, Bowen, Stinnett/DeFrain

// ==================== Core Identifiers ====================

export type DomainId =
  | 'values'
  | 'communication'
  | 'connection'
  | 'roles'
  | 'organization'
  | 'adaptability'
  | 'problemSolving'
  | 'resources'

export type OnboardingPhaseId = 'foundation' | 'relationships' | 'operations' | 'strategy'

export type ManualType = 'household' | 'individual'

export type DomainUpdateSource = 'onboarding' | 'refresh' | 'manual-edit' | 'assessment'

// ==================== Domain Assessment (Living Assessment Engine) ====================

export interface DomainAssessment {
  headline: string                          // "Kitchen is dialed, garage is a disaster"
  summary: string                           // 2-3 sentence portrait
  harmonyScore: number                      // 0-100
  assessmentDepth: AssessmentDepth
  strengths: FindingItem[]
  issues: FindingItem[]
  opportunities: FindingItem[]
  actions: ActionItem[]                     // suggested next steps
  data: Record<string, unknown>             // domain-specific structured data
  lastAssessedAt: string
  conversationCount: number
}

export type AssessmentDepth = 'none' | 'initial' | 'moderate' | 'deep'

export interface FindingItem {
  id: string
  title: string
  detail: string
  severity?: FindingSeverity
}

export type FindingSeverity = 'minor' | 'moderate' | 'significant'

export interface ActionItem {
  id: string
  title: string
  description: string
  effort: ActionItemEffort
  estimatedTime?: string
  type: ActionItemType
  priority: ActionItemPriority
  symphonyItemId?: string
  symphonyItemType?: ActionItemType
  status: ActionItemStatus
}

export type ActionItemEffort = 'quick_win' | 'small' | 'medium' | 'large' | 'ongoing'
export type ActionItemType = 'task' | 'routine' | 'project' | 'goal'
export type ActionItemPriority = 'now' | 'soon' | 'later'
export type ActionItemStatus = 'suggested' | 'accepted' | 'dismissed' | 'in_progress' | 'completed'

// ==================== Harmony Scoring ====================

export type HarmonyStatus = 'resonating' | 'adjusting' | 'discordant' | 'uncharted'

export function getHarmonyStatus(score: number): HarmonyStatus {
  if (!score || !Number.isFinite(score) || score <= 0) return 'uncharted'
  if (score < 40) return 'discordant'
  if (score < 75) return 'adjusting'
  return 'resonating'
}

export const HARMONY_LABELS: Record<HarmonyStatus, string> = {
  resonating: 'Resonating',
  adjusting: 'Adjusting',
  discordant: 'Needs Attention',
  uncharted: 'Not Yet Assessed',
}

export const HARMONY_COLORS: Record<HarmonyStatus, string> = {
  resonating: 'text-emerald-600 bg-emerald-50',
  adjusting: 'text-amber-600 bg-amber-50',
  discordant: 'text-red-600 bg-red-50',
  uncharted: 'text-stone-400 bg-stone-50',
}

// ==================== Empty Assessment Factory ====================

export function createEmptyAssessment(): DomainAssessment {
  return {
    headline: '',
    summary: '',
    harmonyScore: 0,
    assessmentDepth: 'none',
    strengths: [],
    issues: [],
    opportunities: [],
    actions: [],
    data: {},
    lastAssessedAt: '',
    conversationCount: 0,
  }
}

// ==================== Manual ====================

export type ManualDomains = Record<DomainId, DomainAssessment>

export interface Manual {
  id: string
  household_id: string
  user_id: string
  type: ManualType
  person_id?: string | null
  title: string
  subtitle?: string | null
  domains: ManualDomains
  individual_domains?: IndividualManualDomains | null
  domain_meta: Partial<Record<DomainId | IndividualDomainId, DomainMeta>>
  created_at: string
  updated_at: string
}

export interface DomainMeta {
  updated_at: string
  updated_by: DomainUpdateSource
  assessed_by?: string[]  // User IDs who have assessed this domain
}

// ==================== Legacy Domain Interfaces ====================
// Used by EditableDomainView for backward compat with existing manual data.
// The old data lives in DomainAssessment.data (or directly in domains JSONB for pre-assessment manuals).

/** @deprecated Use DomainAssessment instead */
export interface ValuesDomain {
  values: Value[]
  identityStatements: string[]
  nonNegotiables: string[]
  narratives: string[]
}

export interface Value {
  id: string
  name: string
  description: string
  rank?: number
}

/** @deprecated Use DomainAssessment instead */
export interface CommunicationDomain {
  strengths: string[]
  patterns: string[]
  challenges: string[]
  repairStrategies: string[]
  goals: string[]
}

/** @deprecated Use DomainAssessment instead */
export interface ConnectionDomain {
  rituals: Ritual[]
  bondingActivities: string[]
  strengths: string[]
  challenges: string[]
  goals: string[]
}

export interface Ritual {
  id: string
  name: string
  description: string
  frequency: string
  meaningSource: string
}

/** @deprecated Use DomainAssessment instead */
export interface RolesDomain {
  assignments: RoleAssignment[]
  decisionAreas: DecisionArea[]
  painPoints: string[]
  goals: string[]
}

export interface RoleAssignment {
  id: string
  area: string
  owner: string
  satisfaction: 'working' | 'needs-discussion' | 'source-of-conflict'
}

export interface DecisionArea {
  id: string
  name: string
  style: 'collaborative' | 'delegated' | 'unclear'
}

/** @deprecated Use DomainAssessment instead */
export interface OrganizationDomain {
  spaces: SpaceAssessment[]
  systems: FamilySystem[]
  routines: ManualRoutine[]
  painPoints: string[]
  goals: string[]
}

export interface SpaceAssessment {
  id: string
  name: string
  currentState: string
  idealState: string
  priority: 'urgent' | 'important' | 'nice-to-have'
}

export interface FamilySystem {
  id: string
  name: string
  description: string
  effectiveness: 'working' | 'inconsistent' | 'nonexistent'
}

// Named ManualRoutine to avoid conflict with the existing Routine type
export interface ManualRoutine {
  id: string
  name: string
  frequency: 'daily' | 'weekly' | 'monthly' | 'seasonal'
  description: string
  isActive: boolean
  consistency: 'solid' | 'spotty' | 'aspirational'
}

/** @deprecated Use DomainAssessment instead */
export interface AdaptabilityDomain {
  stressors: string[]
  copingStrategies: string[]
  strengths: string[]
  challenges: string[]
  goals: string[]
}

/** @deprecated Use DomainAssessment instead */
export interface ProblemSolvingDomain {
  decisionStyle: string
  conflictPatterns: string[]
  strengths: string[]
  challenges: string[]
  goals: string[]
}

/** @deprecated Use DomainAssessment instead */
export interface ResourcesDomain {
  principles: string[]
  tensions: string[]
  strengths: string[]
  challenges: string[]
  goals: string[]
}

// ==================== Individual (Per-Person) Domains ====================
// "How to understand and support [Name]" — 6 domains for individual manuals

export type IndividualDomainId =
  | 'communicationStyle'
  | 'stressConflict'
  | 'loveConnection'
  | 'motivationEnergy'
  | 'boundariesNeeds'
  | 'growthAreas'

export interface IndividualManualDomains {
  communicationStyle: CommunicationStyleDomain
  stressConflict: StressConflictDomain
  loveConnection: LoveConnectionDomain
  motivationEnergy: MotivationEnergyDomain
  boundariesNeeds: BoundariesNeedsDomain
  growthAreas: GrowthAreasDomain
}

export interface CommunicationStyleDomain {
  preferredReceiving: string[]
  feedbackStyle: string
  emotionalExpression: string
  conversationPreferences: string[]
  warningSignals: string[]
}

export interface StressConflictDomain {
  triggers: string[]
  responsePatterns: string[]
  decompressStrategies: string[]
  warningSignals: string[]
  whatMakesItWorse: string[]
  whatHelps: string[]
}

export interface LoveConnectionDomain {
  loveLanguages: string[]
  howTheyShowCare: string[]
  whatMakesThemFeelSeen: string[]
  qualityTimePreferences: string[]
  bidsForConnection: string[]
}

export interface MotivationEnergyDomain {
  energizers: string[]
  drainers: string[]
  goalApproach: string
  bestTimeOfDay: string
  rechargeMethod: string
}

export interface BoundariesNeedsDomain {
  nonNegotiables: string[]
  aloneTimeNeeds: string
  sensoryPreferences: string[]
  physicalSpace: string[]
  currentUnmetNeeds: string[]
}

export interface GrowthAreasDomain {
  selfIdentifiedAreas: string[]
  supportTheyWant: string[]
  currentFocus: string
  pastProgress: string[]
  aspirations: string[]
}

export const emptyIndividualDomains: IndividualManualDomains = {
  communicationStyle: { preferredReceiving: [], feedbackStyle: '', emotionalExpression: '', conversationPreferences: [], warningSignals: [] },
  stressConflict: { triggers: [], responsePatterns: [], decompressStrategies: [], warningSignals: [], whatMakesItWorse: [], whatHelps: [] },
  loveConnection: { loveLanguages: [], howTheyShowCare: [], whatMakesThemFeelSeen: [], qualityTimePreferences: [], bidsForConnection: [] },
  motivationEnergy: { energizers: [], drainers: [], goalApproach: '', bestTimeOfDay: '', rechargeMethod: '' },
  boundariesNeeds: { nonNegotiables: [], aloneTimeNeeds: '', sensoryPreferences: [], physicalSpace: [], currentUnmetNeeds: [] },
  growthAreas: { selfIdentifiedAreas: [], supportTheyWant: [], currentFocus: '', pastProgress: [], aspirations: [] },
}

export const INDIVIDUAL_DOMAIN_NAMES: Record<IndividualDomainId, string> = {
  communicationStyle: 'Communication Style',
  stressConflict: 'Stress & Conflict',
  loveConnection: 'Love & Connection',
  motivationEnergy: 'Motivation & Energy',
  boundariesNeeds: 'Boundaries & Needs',
  growthAreas: 'Growth Areas',
}

export const INDIVIDUAL_DOMAIN_DESCRIPTIONS: Record<IndividualDomainId, string> = {
  communicationStyle: 'How they prefer to receive info, give feedback, express emotions',
  stressConflict: 'Triggers, response patterns, what helps them decompress',
  loveConnection: 'Love language, how they show care, what makes them feel seen',
  motivationEnergy: 'What energizes them, what drains them, how they pursue goals',
  boundariesNeeds: 'Non-negotiables, alone time, sensory preferences',
  growthAreas: 'Self-identified areas for development and support they want',
}

export const INDIVIDUAL_DOMAIN_ORDER: IndividualDomainId[] = [
  'communicationStyle', 'stressConflict', 'loveConnection',
  'motivationEnergy', 'boundariesNeeds', 'growthAreas',
]

// ==================== Constants ====================

export const emptyDomains: ManualDomains = Object.fromEntries(
  (['values', 'communication', 'connection', 'roles', 'organization', 'adaptability', 'problemSolving', 'resources'] as DomainId[])
    .map(id => [id, createEmptyAssessment()])
) as ManualDomains

export const DOMAIN_NAMES: Record<DomainId, string> = {
  values: 'Values & Identity',
  communication: 'Communication',
  connection: 'Connection & Rituals',
  roles: 'Roles & Responsibilities',
  organization: 'Organization & Spaces',
  adaptability: 'Adaptability & Stress',
  problemSolving: 'Problem Solving & Decisions',
  resources: 'Resources & Finances',
}

export const DOMAIN_DESCRIPTIONS: Record<DomainId, string> = {
  values: 'What we believe, who we are, what matters most',
  communication: 'How we talk, listen, and repair',
  connection: 'Emotional bonds, rituals, and quality time',
  roles: 'Who does what and how decisions get made',
  organization: 'Physical spaces, systems, and routines',
  adaptability: 'How we handle change, stress, and transitions',
  problemSolving: 'How we face challenges and resolve conflicts',
  resources: 'How we manage money, time, and energy',
}

export const DOMAIN_ORDER: DomainId[] = [
  'values', 'communication', 'connection', 'roles',
  'organization', 'adaptability', 'problemSolving', 'resources',
]

export const ONBOARDING_PHASES: {
  id: OnboardingPhaseId
  name: string
  description: string
  domains: [DomainId, DomainId]
}[] = [
  { id: 'foundation', name: 'Foundation', description: 'Your values, identity, and how you communicate', domains: ['values', 'communication'] },
  { id: 'relationships', name: 'Relationships', description: 'How you connect and share responsibilities', domains: ['connection', 'roles'] },
  { id: 'operations', name: 'Operations', description: 'Your spaces, systems, and how you handle change', domains: ['organization', 'adaptability'] },
  { id: 'strategy', name: 'Strategy', description: 'How you solve problems and manage resources', domains: ['problemSolving', 'resources'] },
]

export const PHASE_DOMAINS: Record<OnboardingPhaseId, [DomainId, DomainId]> = {
  foundation: ['values', 'communication'],
  relationships: ['connection', 'roles'],
  operations: ['organization', 'adaptability'],
  strategy: ['problemSolving', 'resources'],
}

export const PHASE_NAMES: Record<OnboardingPhaseId, string> = {
  foundation: 'Foundation',
  relationships: 'Relationships',
  operations: 'Operations',
  strategy: 'Strategy',
}

export const PHASE_DESCRIPTIONS: Record<OnboardingPhaseId, string> = {
  foundation: 'Your values, identity, and how you communicate',
  relationships: 'How you connect and share responsibilities',
  operations: 'Your spaces, systems, and how you handle change',
  strategy: 'How you solve problems and manage resources',
}

// ==================== Freshness utilities ====================

export type FreshnessLabel = 'fresh' | 'aging' | 'stale'

export function getDomainAge(manual: Manual, domainId: DomainId): number {
  // Check DomainAssessment.lastAssessedAt first (new format)
  const assessment = manual.domains?.[domainId]
  if (assessment && 'lastAssessedAt' in assessment && assessment.lastAssessedAt) {
    return Date.now() - new Date(assessment.lastAssessedAt).getTime()
  }
  // Fall back to domain_meta (old format)
  const meta = manual.domain_meta?.[domainId]
  const dateStr = meta?.updated_at ?? manual.created_at
  if (!dateStr) return Infinity
  return Date.now() - new Date(dateStr).getTime()
}

export function getDomainFreshnessLabel(ageMs: number): FreshnessLabel {
  const days = ageMs / (1000 * 60 * 60 * 24)
  if (days < 30) return 'fresh'
  if (days < 90) return 'aging'
  return 'stale'
}

// ==================== Domain Assessment Helpers ====================

/** Check if a domain has been assessed (works with both old and new data shapes) */
export function isDomainAssessed(manual: Manual, domainId: DomainId): boolean {
  const domain = manual.domains?.[domainId]
  if (!domain) return false

  // New format: check assessmentDepth
  if ('assessmentDepth' in domain && domain.assessmentDepth !== 'none') return true

  // Old format: check if any data fields have content
  const data = domain as unknown as Record<string, unknown>
  return Object.values(data).some(v => {
    if (Array.isArray(v)) return v.length > 0
    if (typeof v === 'string') return !!v
    if (typeof v === 'object' && v !== null) return Object.keys(v).length > 0
    return !!v
  })
}
