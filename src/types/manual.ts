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

export type DomainUpdateSource = 'onboarding' | 'refresh' | 'manual-edit'

// ==================== Manual ====================

export interface Manual {
  id: string
  household_id: string
  user_id: string
  type: ManualType
  person_id?: string | null
  title: string
  subtitle?: string | null
  domains: ManualDomains
  domain_meta: Partial<Record<DomainId, DomainMeta>>
  created_at: string
  updated_at: string
}

export interface DomainMeta {
  updated_at: string
  updated_by: DomainUpdateSource
}

export interface ManualDomains {
  values: ValuesDomain
  communication: CommunicationDomain
  connection: ConnectionDomain
  roles: RolesDomain
  organization: OrganizationDomain
  adaptability: AdaptabilityDomain
  problemSolving: ProblemSolvingDomain
  resources: ResourcesDomain
}

// ==================== Domain 1: Values & Identity ====================

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

// ==================== Domain 2: Communication ====================

export interface CommunicationDomain {
  strengths: string[]
  patterns: string[]
  challenges: string[]
  repairStrategies: string[]
  goals: string[]
}

// ==================== Domain 3: Connection ====================

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

// ==================== Domain 4: Roles & Responsibilities ====================

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

// ==================== Domain 5: Organization & Spaces ====================

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

// ==================== Domain 6: Adaptability ====================

export interface AdaptabilityDomain {
  stressors: string[]
  copingStrategies: string[]
  strengths: string[]
  challenges: string[]
  goals: string[]
}

// ==================== Domain 7: Problem Solving ====================

export interface ProblemSolvingDomain {
  decisionStyle: string
  conflictPatterns: string[]
  strengths: string[]
  challenges: string[]
  goals: string[]
}

// ==================== Domain 8: Resource Management ====================

export interface ResourcesDomain {
  principles: string[]
  tensions: string[]
  strengths: string[]
  challenges: string[]
  goals: string[]
}

// ==================== Constants ====================

export const emptyDomains: ManualDomains = {
  values: { values: [], identityStatements: [], nonNegotiables: [], narratives: [] },
  communication: { strengths: [], patterns: [], challenges: [], repairStrategies: [], goals: [] },
  connection: { rituals: [], bondingActivities: [], strengths: [], challenges: [], goals: [] },
  roles: { assignments: [], decisionAreas: [], painPoints: [], goals: [] },
  organization: { spaces: [], systems: [], routines: [], painPoints: [], goals: [] },
  adaptability: { stressors: [], copingStrategies: [], strengths: [], challenges: [], goals: [] },
  problemSolving: { decisionStyle: '', conflictPatterns: [], strengths: [], challenges: [], goals: [] },
  resources: { principles: [], tensions: [], strengths: [], challenges: [], goals: [] },
}

export const DOMAIN_NAMES: Record<DomainId, string> = {
  values: 'Values & Identity',
  communication: 'Communication',
  connection: 'Connection',
  roles: 'Roles & Responsibilities',
  organization: 'Organization & Spaces',
  adaptability: 'Adaptability',
  problemSolving: 'Problem Solving',
  resources: 'Resource Management',
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
