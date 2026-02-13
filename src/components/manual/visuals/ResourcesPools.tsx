// ResourcesPools — Three resource pools (Time, Money, Energy) with fill levels
// Pool fill reflects overall score; color by harmony status

import type { VisualProps } from './DomainVisual'

export function ResourcesPools({ score, size, className }: VisualProps) {
  const color = score >= 75 ? '#34d399' : score >= 40 ? '#fbbf24' : '#f87171'
  const bgColor = score >= 75 ? '#d1fae5' : score >= 40 ? '#fef3c7' : '#fee2e2'

  // Three pools with slightly varied fill levels based on score
  const pools = [
    { cx: 22, label: 'Time', fill: Math.min(100, score + 5) },
    { cx: 50, label: 'Money', fill: score },
    { cx: 78, label: 'Energy', fill: Math.max(0, score - 5) },
  ]

  const poolTop = 20
  const poolHeight = 45
  const poolWidth = 18

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      {/* Background */}
      <rect x="5" y="15" width="90" height="58" rx="6" fill={bgColor} opacity="0.1" />

      {pools.map((pool) => {
        const fillHeight = poolHeight * (pool.fill / 100)
        const fillY = poolTop + poolHeight - fillHeight

        return (
          <g key={pool.label}>
            {/* Pool container */}
            <rect
              x={pool.cx - poolWidth / 2}
              y={poolTop}
              width={poolWidth}
              height={poolHeight}
              rx="4"
              fill="white"
              stroke="#e7e5e4"
              strokeWidth="1.5"
            />

            {/* Fill level */}
            <rect
              x={pool.cx - poolWidth / 2 + 1.5}
              y={fillY}
              width={poolWidth - 3}
              height={fillHeight - 1}
              rx="2.5"
              fill={color}
              opacity="0.35"
            />

            {/* Surface line */}
            {fillHeight > 2 && (
              <line
                x1={pool.cx - poolWidth / 2 + 2}
                y1={fillY + 1}
                x2={pool.cx + poolWidth / 2 - 2}
                y2={fillY + 1}
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.6"
              />
            )}

            {/* Label */}
            <text
              x={pool.cx}
              y={poolTop + poolHeight + 10}
              textAnchor="middle"
              fill="#a8a29e"
              fontSize="5.5"
              fontFamily="sans-serif"
            >
              {pool.label}
            </text>
          </g>
        )
      })}

      {/* Score text */}
      <text x="50" y="90" textAnchor="middle" fill="#78716c" fontSize="9" fontFamily="sans-serif">
        {score}
      </text>
    </svg>
  )
}
