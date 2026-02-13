// ConstellationNode — Individual animated domain node in the constellation
// States: empty (outline), partial (dim fill), complete (full fill + glow), active (ring + bright)

import type { DomainId, IndividualDomainId } from '@/types/manual'

export type NodeState = 'empty' | 'partial' | 'complete' | 'active'

interface ConstellationNodeProps {
  domainId: DomainId | IndividualDomainId
  label: string
  description: string
  state: NodeState
  color: string
  cx: number
  cy: number
  r?: number
  icon?: string
  onClick?: () => void
}

// SVG icons for each domain (simple, recognizable at small sizes)
const DOMAIN_ICONS: Record<string, string> = {
  // Household domains
  values: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z', // star
  communication: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z', // chat
  connection: 'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z', // heart
  roles: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75', // people
  organization: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z', // home
  adaptability: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15', // refresh
  problemSolving: 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z', // wrench
  resources: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6', // dollar
  // Individual domains
  communicationStyle: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z', // chat
  stressConflict: 'M13 10V3L4 14h7v7l9-11h-7z', // lightning bolt
  loveConnection: 'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z', // heart
  motivationEnergy: 'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83', // sun
  boundariesNeeds: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', // shield
  growthAreas: 'M12 2a10 10 0 0110 10c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zM12 8v8M8 12h8', // plus in circle
}

export function ConstellationNode({
  domainId,
  label,
  description,
  state,
  color,
  cx,
  cy,
  r = 36,
  onClick,
}: ConstellationNodeProps) {
  const iconPath = DOMAIN_ICONS[domainId]

  // Fill opacity based on state
  const fillOpacity = state === 'complete' || state === 'active' ? 0.15 : state === 'partial' ? 0.08 : 0
  const strokeOpacity = state === 'empty' ? 0.25 : state === 'partial' ? 0.4 : 0.7
  const strokeWidth = state === 'active' ? 2.5 : state === 'complete' ? 2 : 1.5

  // Icon area is centered in the node
  const iconSize = 16
  const iconOffset = iconSize / 2

  return (
    <g
      className={`cursor-pointer transition-all duration-500 ${onClick ? 'hover:opacity-90' : ''}`}
      onClick={onClick}
      role="button"
      aria-label={`${label}: ${description}`}
    >
      {/* Glow effect for complete/active states */}
      {(state === 'complete' || state === 'active') && (
        <circle
          cx={cx}
          cy={cy}
          r={r + 8}
          fill={color}
          opacity={state === 'active' ? 0.12 : 0.06}
          className={state === 'active' ? 'animate-pulse-soft' : ''}
        />
      )}

      {/* Active state ring animation */}
      {state === 'active' && (
        <circle
          cx={cx}
          cy={cy}
          r={r + 4}
          fill="none"
          stroke={color}
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.4}
          className="animate-spin-slow"
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />
      )}

      {/* Main circle */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
        className="transition-all duration-700"
      />

      {/* Partial state: pulse animation */}
      {state === 'partial' && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={color}
          fillOpacity={0.04}
          stroke="none"
          className="animate-pulse-soft"
        />
      )}

      {/* Domain icon */}
      <svg
        x={cx - iconOffset}
        y={cy - iconOffset - 6}
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={state === 'empty' ? 0.35 : state === 'partial' ? 0.5 : 0.8}
        className="transition-opacity duration-500"
      >
        <path d={iconPath} />
      </svg>

      {/* Label */}
      <text
        x={cx}
        y={cy + iconOffset + 6}
        textAnchor="middle"
        className="text-[9px] font-medium tracking-wide uppercase transition-opacity duration-500"
        fill={color}
        opacity={state === 'empty' ? 0.3 : state === 'partial' ? 0.55 : 0.85}
      >
        {label.length > 14 ? label.split(' ')[0] : label}
      </text>
    </g>
  )
}
