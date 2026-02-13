// DomainVisual — Renders the appropriate visual for a given domain
// Each domain has a unique SVG metaphor driven by its assessment data

import type { DomainId, DomainAssessment } from '@/types/manual'
import { getHarmonyStatus } from '@/types/manual'
import { ValuesCompass } from './ValuesCompass'
import { CommunicationNetwork } from './CommunicationNetwork'
import { ConnectionWheel } from './ConnectionWheel'
import { RolesBalance } from './RolesBalance'
import { OrganizationFloorplan } from './OrganizationFloorplan'
import { AdaptabilityWave } from './AdaptabilityWave'
import { ProblemSolvingTree } from './ProblemSolvingTree'
import { ResourcesPools } from './ResourcesPools'

interface DomainVisualProps {
  domainId: DomainId
  assessment: DomainAssessment
  size?: number
  className?: string
}

const VISUAL_MAP: Record<DomainId, React.FC<VisualProps>> = {
  values: ValuesCompass,
  communication: CommunicationNetwork,
  connection: ConnectionWheel,
  roles: RolesBalance,
  organization: OrganizationFloorplan,
  adaptability: AdaptabilityWave,
  problemSolving: ProblemSolvingTree,
  resources: ResourcesPools,
}

export interface VisualProps {
  score: number
  strengths: number
  issues: number
  opportunities: number
  depth: string
  size: number
  className?: string
}

export function DomainVisual({ domainId, assessment, size = 120, className }: DomainVisualProps) {
  const Visual = VISUAL_MAP[domainId]
  const status = getHarmonyStatus(assessment.harmonyScore)

  if (status === 'uncharted') {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" width={size} height={size}>
          <circle cx="50" cy="50" r="40" fill="none" stroke="#e7e5e4" strokeWidth="2" strokeDasharray="6 4" />
          <text x="50" y="54" textAnchor="middle" fill="#a8a29e" fontSize="11" fontFamily="sans-serif">?</text>
        </svg>
      </div>
    )
  }

  return (
    <Visual
      score={assessment.harmonyScore}
      strengths={assessment.strengths?.length ?? 0}
      issues={assessment.issues?.length ?? 0}
      opportunities={assessment.opportunities?.length ?? 0}
      depth={assessment.assessmentDepth ?? 'none'}
      size={size}
      className={className}
    />
  )
}
