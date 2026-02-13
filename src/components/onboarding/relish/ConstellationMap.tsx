// ConstellationMap — SVG-based constellation showing 8 domain nodes
// Nodes fill and connections appear as onboarding progresses

import { useMemo } from 'react'
import { ConstellationNode, type NodeState } from './ConstellationNode'
import type { DomainId, OnboardingPhaseId, IndividualDomainId } from '@/types/manual'
import { DOMAIN_NAMES, DOMAIN_DESCRIPTIONS, PHASE_DOMAINS, INDIVIDUAL_DOMAIN_NAMES, INDIVIDUAL_DOMAIN_DESCRIPTIONS } from '@/types/manual'

interface ConstellationMapProps {
  completedPhases: OnboardingPhaseId[]
  currentPhase: OnboardingPhaseId | null
  familyName?: string
  className?: string
}

// Domain colors — warm, Nordic palette
const DOMAIN_COLORS: Record<DomainId, string> = {
  values: '#2d5a3d',        // deep forest green
  communication: '#c4820e', // warm amber
  connection: '#b5546a',    // soft rose
  roles: '#4f46a8',         // indigo
  organization: '#0f766e',  // teal
  adaptability: '#c2630c',  // warm orange
  problemSolving: '#475985', // slate blue
  resources: '#5a7a5f',     // sage green
}

// Organic radial positions for 8 nodes (hand-tuned, not a rigid grid)
// Layout: roughly circular but with organic offsets for visual interest
// SVG viewBox is 0 0 320 320
const NODE_POSITIONS: Record<DomainId, { cx: number; cy: number }> = {
  values:         { cx: 160, cy: 52 },   // top center
  communication:  { cx: 258, cy: 88 },   // top right
  connection:     { cx: 282, cy: 182 },  // right
  roles:          { cx: 240, cy: 268 },  // bottom right
  organization:   { cx: 148, cy: 290 },  // bottom center-left
  adaptability:   { cx: 62, cy: 252 },   // bottom left
  problemSolving: { cx: 38, cy: 158 },   // left
  resources:      { cx: 72, cy: 78 },    // top left
}

// Domain connections — which domains are linked
const CONNECTIONS: [DomainId, DomainId][] = [
  ['values', 'communication'],
  ['connection', 'roles'],
  ['organization', 'adaptability'],
  ['problemSolving', 'resources'],
  // Cross-connections (secondary, rendered thinner)
  ['values', 'connection'],
  ['communication', 'roles'],
  ['organization', 'problemSolving'],
  ['adaptability', 'resources'],
]

// Primary connections (thicker, appear first)
const PRIMARY_CONNECTIONS = new Set([
  'values-communication',
  'connection-roles',
  'organization-adaptability',
  'problemSolving-resources',
])

export function ConstellationMap({
  completedPhases,
  currentPhase,
  familyName,
  className = '',
}: ConstellationMapProps) {
  // Compute which domains have data
  const domainStates = useMemo(() => {
    const states: Record<DomainId, NodeState> = {
      values: 'empty', communication: 'empty', connection: 'empty', roles: 'empty',
      organization: 'empty', adaptability: 'empty', problemSolving: 'empty', resources: 'empty',
    }

    // Mark completed phase domains as complete
    for (const phase of completedPhases) {
      const [d1, d2] = PHASE_DOMAINS[phase]
      states[d1] = 'complete'
      states[d2] = 'complete'
    }

    // Mark current phase domains as active/partial
    if (currentPhase && !completedPhases.includes(currentPhase)) {
      const [d1, d2] = PHASE_DOMAINS[currentPhase]
      if (states[d1] !== 'complete') states[d1] = 'active'
      if (states[d2] !== 'complete') states[d2] = 'partial'
    }

    return states
  }, [completedPhases, currentPhase])

  // Compute connection visibility
  const connectionStates = useMemo(() => {
    return CONNECTIONS.map(([a, b]) => {
      const aHasData = domainStates[a] === 'complete' || domainStates[a] === 'active'
      const bHasData = domainStates[b] === 'complete' || domainStates[b] === 'active'
      const key = `${a}-${b}`
      const isPrimary = PRIMARY_CONNECTIONS.has(key)

      return {
        from: NODE_POSITIONS[a],
        to: NODE_POSITIONS[b],
        color: DOMAIN_COLORS[a],
        visible: aHasData && bHasData,
        partial: aHasData || bHasData,
        isPrimary,
      }
    })
  }, [domainStates])

  const domainOrder: DomainId[] = [
    'values', 'communication', 'connection', 'roles',
    'organization', 'adaptability', 'problemSolving', 'resources',
  ]

  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox="0 0 320 320"
        className="w-full h-full max-w-[320px] mx-auto"
        aria-label="Family constellation — domains being explored"
      >
        {/* Connection lines */}
        {connectionStates.map((conn, i) => (
          <line
            key={i}
            x1={conn.from.cx}
            y1={conn.from.cy}
            x2={conn.to.cx}
            y2={conn.to.cy}
            stroke={conn.color}
            strokeWidth={conn.isPrimary ? 1.5 : 0.8}
            strokeOpacity={conn.visible ? 0.3 : conn.partial ? 0.08 : 0}
            strokeDasharray={conn.visible ? 'none' : '4 4'}
            className="transition-all duration-1000"
          />
        ))}

        {/* Center label */}
        {familyName && (
          <text
            x={160}
            y={170}
            textAnchor="middle"
            className="text-[11px] font-display"
            fill="#57534e"
            opacity={0.5}
          >
            {familyName}
          </text>
        )}

        {/* Domain nodes */}
        {domainOrder.map(domainId => {
          const pos = NODE_POSITIONS[domainId]
          return (
            <ConstellationNode
              key={domainId}
              domainId={domainId}
              label={DOMAIN_NAMES[domainId]}
              description={DOMAIN_DESCRIPTIONS[domainId]}
              state={domainStates[domainId]}
              color={DOMAIN_COLORS[domainId]}
              cx={pos.cx}
              cy={pos.cy}
            />
          )
        })}
      </svg>
    </div>
  )
}

export { DOMAIN_COLORS }

// ==================== Individual Constellation (6-node variant) ====================

const INDIVIDUAL_DOMAIN_COLORS: Record<IndividualDomainId, string> = {
  communicationStyle: '#c4820e',  // warm amber
  stressConflict: '#9f3b4e',     // deeper rose
  loveConnection: '#b5546a',     // soft rose
  motivationEnergy: '#c2630c',   // warm orange
  boundariesNeeds: '#475985',    // slate blue
  growthAreas: '#2d5a3d',        // deep forest green
}

// 6 nodes in a hexagonal arrangement — viewBox 0 0 280 280
const INDIVIDUAL_NODE_POSITIONS: Record<IndividualDomainId, { cx: number; cy: number }> = {
  communicationStyle: { cx: 140, cy: 42 },  // top
  stressConflict:     { cx: 242, cy: 90 },  // top right
  loveConnection:     { cx: 242, cy: 190 }, // bottom right
  motivationEnergy:   { cx: 140, cy: 238 }, // bottom
  boundariesNeeds:    { cx: 38, cy: 190 },  // bottom left
  growthAreas:        { cx: 38, cy: 90 },   // top left
}

const INDIVIDUAL_CONNECTIONS: [IndividualDomainId, IndividualDomainId][] = [
  ['communicationStyle', 'stressConflict'],
  ['stressConflict', 'loveConnection'],
  ['loveConnection', 'motivationEnergy'],
  ['motivationEnergy', 'boundariesNeeds'],
  ['boundariesNeeds', 'growthAreas'],
  ['growthAreas', 'communicationStyle'],
  // Cross-connections
  ['communicationStyle', 'loveConnection'],
  ['stressConflict', 'boundariesNeeds'],
  ['motivationEnergy', 'growthAreas'],
]

const INDIVIDUAL_PRIMARY_CONNECTIONS = new Set([
  'communicationStyle-stressConflict',
  'stressConflict-loveConnection',
  'loveConnection-motivationEnergy',
  'motivationEnergy-boundariesNeeds',
  'boundariesNeeds-growthAreas',
  'growthAreas-communicationStyle',
])

interface IndividualConstellationMapProps {
  completedDomains: IndividualDomainId[]
  activeDomain?: IndividualDomainId | null
  personName?: string
  className?: string
}

export function IndividualConstellationMap({
  completedDomains,
  activeDomain,
  personName,
  className = '',
}: IndividualConstellationMapProps) {
  const domainStates = useMemo(() => {
    const states: Record<IndividualDomainId, NodeState> = {
      communicationStyle: 'empty', stressConflict: 'empty', loveConnection: 'empty',
      motivationEnergy: 'empty', boundariesNeeds: 'empty', growthAreas: 'empty',
    }

    for (const d of completedDomains) {
      states[d] = 'complete'
    }

    if (activeDomain && states[activeDomain] !== 'complete') {
      states[activeDomain] = 'active'
    }

    return states
  }, [completedDomains, activeDomain])

  const connectionStates = useMemo(() => {
    return INDIVIDUAL_CONNECTIONS.map(([a, b]) => {
      const aHasData = domainStates[a] === 'complete' || domainStates[a] === 'active'
      const bHasData = domainStates[b] === 'complete' || domainStates[b] === 'active'
      const key = `${a}-${b}`
      const isPrimary = INDIVIDUAL_PRIMARY_CONNECTIONS.has(key)

      return {
        from: INDIVIDUAL_NODE_POSITIONS[a],
        to: INDIVIDUAL_NODE_POSITIONS[b],
        color: INDIVIDUAL_DOMAIN_COLORS[a],
        visible: aHasData && bHasData,
        partial: aHasData || bHasData,
        isPrimary,
      }
    })
  }, [domainStates])

  const domainOrder: IndividualDomainId[] = [
    'communicationStyle', 'stressConflict', 'loveConnection',
    'motivationEnergy', 'boundariesNeeds', 'growthAreas',
  ]

  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox="0 0 280 280"
        className="w-full h-full max-w-[280px] mx-auto"
        aria-label={`${personName || 'Individual'} constellation — personal domains`}
      >
        {/* Connection lines */}
        {connectionStates.map((conn, i) => (
          <line
            key={i}
            x1={conn.from.cx}
            y1={conn.from.cy}
            x2={conn.to.cx}
            y2={conn.to.cy}
            stroke={conn.color}
            strokeWidth={conn.isPrimary ? 1.5 : 0.8}
            strokeOpacity={conn.visible ? 0.3 : conn.partial ? 0.08 : 0}
            strokeDasharray={conn.visible ? 'none' : '4 4'}
            className="transition-all duration-1000"
          />
        ))}

        {/* Center label */}
        {personName && (
          <text
            x={140}
            y={145}
            textAnchor="middle"
            className="text-[11px] font-display"
            fill="#57534e"
            opacity={0.5}
          >
            {personName}
          </text>
        )}

        {/* Domain nodes */}
        {domainOrder.map(domainId => {
          const pos = INDIVIDUAL_NODE_POSITIONS[domainId]
          return (
            <ConstellationNode
              key={domainId}
              domainId={domainId}
              label={INDIVIDUAL_DOMAIN_NAMES[domainId]}
              description={INDIVIDUAL_DOMAIN_DESCRIPTIONS[domainId]}
              state={domainStates[domainId]}
              color={INDIVIDUAL_DOMAIN_COLORS[domainId]}
              cx={pos.cx}
              cy={pos.cy}
            />
          )
        })}
      </svg>
    </div>
  )
}
