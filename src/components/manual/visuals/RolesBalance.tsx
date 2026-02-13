// RolesBalance — Balance scale showing role distribution / mental load equity
// Beam tilts based on harmony; weights reflect strengths vs issues

import type { VisualProps } from './DomainVisual'

export function RolesBalance({ score, strengths, issues, size, className }: VisualProps) {
  const color = score >= 75 ? '#34d399' : score >= 40 ? '#fbbf24' : '#f87171'
  const bgColor = score >= 75 ? '#d1fae5' : score >= 40 ? '#fef3c7' : '#fee2e2'

  // Tilt angle: 0 = balanced, negative = left heavy, positive = right heavy
  // Map score: 100 = level, 0 = max tilt
  const tilt = (100 - score) * 0.15 * (issues > strengths ? 1 : -1)
  const beamY = 35

  // Pan positions (affected by tilt)
  const leftPanY = beamY + 20 - tilt * 1.5
  const rightPanY = beamY + 20 + tilt * 1.5

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      {/* Background glow */}
      <circle cx="50" cy="50" r="38" fill={bgColor} opacity="0.2" />

      {/* Fulcrum / stand */}
      <line x1="50" y1={beamY} x2="50" y2="78" stroke="#d6d3d1" strokeWidth="2" />
      <polygon points="44,78 56,78 50,72" fill="#d6d3d1" />
      {/* Base */}
      <rect x="38" y="78" width="24" height="3" rx="1.5" fill="#d6d3d1" />

      {/* Fulcrum point */}
      <circle cx="50" cy={beamY} r="3" fill={color} />

      {/* Beam */}
      <line
        x1="20" y1={beamY - tilt * 2}
        x2="80" y2={beamY + tilt * 2}
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Left pan strings */}
      <line x1="20" y1={beamY - tilt * 2} x2="15" y2={leftPanY} stroke="#a8a29e" strokeWidth="0.8" />
      <line x1="20" y1={beamY - tilt * 2} x2="25" y2={leftPanY} stroke="#a8a29e" strokeWidth="0.8" />

      {/* Left pan */}
      <ellipse cx="20" cy={leftPanY + 2} rx="12" ry="3" fill={color} opacity="0.2" stroke={color} strokeWidth="1" />
      {/* Left weights (strengths) */}
      {Array.from({ length: Math.min(strengths, 4) }).map((_, i) => (
        <rect
          key={`ls-${i}`}
          x={14 + i * 4}
          y={leftPanY - 3 - i * 2}
          width="4"
          height="4"
          rx="1"
          fill={color}
          opacity={0.5 + i * 0.1}
        />
      ))}

      {/* Right pan strings */}
      <line x1="80" y1={beamY + tilt * 2} x2="75" y2={rightPanY} stroke="#a8a29e" strokeWidth="0.8" />
      <line x1="80" y1={beamY + tilt * 2} x2="85" y2={rightPanY} stroke="#a8a29e" strokeWidth="0.8" />

      {/* Right pan */}
      <ellipse cx="80" cy={rightPanY + 2} rx="12" ry="3" fill="#fbbf24" opacity="0.2" stroke="#fbbf24" strokeWidth="1" />
      {/* Right weights (issues) */}
      {Array.from({ length: Math.min(issues, 4) }).map((_, i) => (
        <rect
          key={`ri-${i}`}
          x={74 + i * 4}
          y={rightPanY - 3 - i * 2}
          width="4"
          height="4"
          rx="1"
          fill="#fbbf24"
          opacity={0.5 + i * 0.1}
        />
      ))}

      {/* Score text */}
      <text x="50" y="94" textAnchor="middle" fill="#78716c" fontSize="9" fontFamily="sans-serif">
        {score}
      </text>
    </svg>
  )
}
