// ConnectionWheel — Seasonal calendar wheel showing ritual/connection density
// Rings represent seasons; filled segments show active rituals

import type { VisualProps } from './DomainVisual'

export function ConnectionWheel({ score, strengths, issues, size, className }: VisualProps) {
  const color = score >= 75 ? '#34d399' : score >= 40 ? '#fbbf24' : '#f87171'
  const bgColor = score >= 75 ? '#d1fae5' : score >= 40 ? '#fef3c7' : '#fee2e2'

  // 4 seasons, each a 90-degree arc
  const totalFindings = strengths + issues
  const fillRatio = totalFindings > 0 ? strengths / totalFindings : score / 100
  const seasons = [
    { label: 'W', startAngle: 0 },
    { label: 'Sp', startAngle: 90 },
    { label: 'Su', startAngle: 180 },
    { label: 'F', startAngle: 270 },
  ]

  const arcPath = (cx: number, cy: number, r: number, startDeg: number, endDeg: number) => {
    const startRad = (startDeg - 90) * Math.PI / 180
    const endRad = (endDeg - 90) * Math.PI / 180
    const x1 = cx + r * Math.cos(startRad)
    const y1 = cy + r * Math.sin(startRad)
    const x2 = cx + r * Math.cos(endRad)
    const y2 = cy + r * Math.sin(endRad)
    const largeArc = endDeg - startDeg > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
  }

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      {/* Background circle */}
      <circle cx="50" cy="50" r="38" fill={bgColor} opacity="0.2" />

      {/* Outer ring — season arcs */}
      {seasons.map((season, i) => {
        const filled = i < Math.ceil(4 * fillRatio)
        return (
          <g key={season.label}>
            <path
              d={arcPath(50, 50, 36, season.startAngle + 2, season.startAngle + 88)}
              fill="none"
              stroke={filled ? color : '#e7e5e4'}
              strokeWidth="6"
              strokeLinecap="round"
              opacity={filled ? 0.7 : 0.4}
            />
          </g>
        )
      })}

      {/* Inner ring — thinner */}
      {seasons.map((season, i) => {
        const filled = i < Math.ceil(4 * (score / 100))
        return (
          <path
            key={`inner-${season.label}`}
            d={arcPath(50, 50, 26, season.startAngle + 4, season.startAngle + 86)}
            fill="none"
            stroke={filled ? color : '#e7e5e4'}
            strokeWidth="3"
            strokeLinecap="round"
            opacity={filled ? 0.5 : 0.25}
          />
        )
      })}

      {/* Center hub */}
      <circle cx="50" cy="50" r="12" fill="white" stroke={color} strokeWidth="1.5" />
      <circle cx="50" cy="50" r="6" fill={color} opacity="0.3" />

      {/* Score text */}
      <text x="50" y="94" textAnchor="middle" fill="#78716c" fontSize="9" fontFamily="sans-serif">
        {score}
      </text>
    </svg>
  )
}
