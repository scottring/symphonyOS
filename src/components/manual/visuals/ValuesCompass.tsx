// ValuesCompass — Compass rose showing alignment across life areas
// Needle angle reflects harmony score; cardinal points represent core value pillars

import type { VisualProps } from './DomainVisual'

const STATUS_COLORS = {
  high: { fill: '#34d399', stroke: '#059669' },
  mid: { fill: '#fbbf24', stroke: '#d97706' },
  low: { fill: '#f87171', stroke: '#dc2626' },
}

function getColors(score: number) {
  if (score >= 75) return STATUS_COLORS.high
  if (score >= 40) return STATUS_COLORS.mid
  return STATUS_COLORS.low
}

export function ValuesCompass({ score, size, className }: VisualProps) {
  const colors = getColors(score)
  // Needle points toward score: 0=south (misaligned), 100=north (aligned)
  const needleAngle = 180 - (score / 100) * 180

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      {/* Outer ring */}
      <circle cx="50" cy="50" r="42" fill="none" stroke="#e7e5e4" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="38" fill="#fafaf9" stroke="none" />

      {/* Cardinal tick marks */}
      {[0, 90, 180, 270].map(angle => {
        const rad = (angle * Math.PI) / 180
        const x1 = 50 + Math.sin(rad) * 35
        const y1 = 50 - Math.cos(rad) * 35
        const x2 = 50 + Math.sin(rad) * 42
        const y2 = 50 - Math.cos(rad) * 42
        return <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#a8a29e" strokeWidth="1.5" />
      })}

      {/* Minor tick marks */}
      {[45, 135, 225, 315].map(angle => {
        const rad = (angle * Math.PI) / 180
        const x1 = 50 + Math.sin(rad) * 37
        const y1 = 50 - Math.cos(rad) * 37
        const x2 = 50 + Math.sin(rad) * 42
        const y2 = 50 - Math.cos(rad) * 42
        return <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d6d3d1" strokeWidth="1" />
      })}

      {/* Score arc — how much of the compass is "lit up" */}
      <circle
        cx="50" cy="50" r="30"
        fill="none"
        stroke={colors.fill}
        strokeWidth="3"
        strokeDasharray={`${(score / 100) * 188.5} 188.5`}
        strokeLinecap="round"
        transform="rotate(-90, 50, 50)"
        opacity="0.4"
      />

      {/* Compass needle */}
      <g transform={`rotate(${needleAngle}, 50, 50)`}>
        {/* North half (colored) */}
        <polygon points="50,18 47,50 53,50" fill={colors.fill} />
        {/* South half (gray) */}
        <polygon points="50,82 47,50 53,50" fill="#d6d3d1" />
      </g>

      {/* Center dot */}
      <circle cx="50" cy="50" r="3" fill={colors.stroke} />

      {/* Score text */}
      <text x="50" y="94" textAnchor="middle" fill="#78716c" fontSize="9" fontFamily="sans-serif">
        {score}
      </text>
    </svg>
  )
}
