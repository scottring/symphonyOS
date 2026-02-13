// AdaptabilityWave — Wave meter showing stress amplitude + resilience capacity
// Calm waves = high adaptability, choppy waves = low

import type { VisualProps } from './DomainVisual'

export function AdaptabilityWave({ score, strengths, issues, size, className }: VisualProps) {
  const color = score >= 75 ? '#34d399' : score >= 40 ? '#fbbf24' : '#f87171'
  const bgColor = score >= 75 ? '#d1fae5' : score >= 40 ? '#fef3c7' : '#fee2e2'

  // Wave amplitude: high score = calm (small waves), low score = choppy (big waves)
  const amplitude = 4 + (100 - score) * 0.16 // 4-20 range
  const frequency = 0.08 + (100 - score) * 0.001 // Slightly faster when stressed

  // Generate wave paths
  const generateWave = (baseY: number, amp: number, phase: number) => {
    const points: string[] = []
    for (let x = 0; x <= 100; x += 2) {
      const y = baseY + amp * Math.sin((x * frequency * Math.PI * 2) + phase)
      points.push(`${x === 0 ? 'M' : 'L'} ${x} ${y.toFixed(1)}`)
    }
    return points.join(' ')
  }

  // Resilience bar — how many strengths vs issues
  const resilienceRatio = (strengths + issues) > 0 ? strengths / (strengths + issues) : score / 100
  const barWidth = 60 * resilienceRatio

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      {/* Background */}
      <rect x="5" y="10" width="90" height="65" rx="8" fill={bgColor} opacity="0.15" />

      {/* Wave layers (3 waves at different depths) */}
      <path
        d={generateWave(35, amplitude * 0.6, 0)}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        opacity="0.3"
      />
      <path
        d={generateWave(45, amplitude * 0.8, 1.5)}
        fill="none"
        stroke={color}
        strokeWidth="2"
        opacity="0.5"
      />
      <path
        d={generateWave(55, amplitude, 3)}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        opacity="0.7"
      />

      {/* Baseline (calm reference) */}
      <line x1="8" y1="45" x2="92" y2="45" stroke="#e7e5e4" strokeWidth="0.5" strokeDasharray="3 3" />

      {/* Resilience capacity bar */}
      <rect x="20" y="70" width="60" height="4" rx="2" fill="#e7e5e4" />
      <rect x="20" y="70" width={barWidth} height="4" rx="2" fill={color} opacity="0.6" />
      <text x="20" y="68" fill="#a8a29e" fontSize="4.5" fontFamily="sans-serif">resilience</text>

      {/* Score text */}
      <text x="50" y="90" textAnchor="middle" fill="#78716c" fontSize="9" fontFamily="sans-serif">
        {score}
      </text>
    </svg>
  )
}
