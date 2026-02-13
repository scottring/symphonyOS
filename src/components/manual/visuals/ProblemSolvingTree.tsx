// ProblemSolvingTree — Decision tree with branches showing resolved/open issues
// Healthy tree = good problem-solving, bare branches = unresolved issues

import type { VisualProps } from './DomainVisual'

export function ProblemSolvingTree({ score, size, className }: VisualProps) {
  const color = score >= 75 ? '#34d399' : score >= 40 ? '#fbbf24' : '#f87171'
  const leafColor = score >= 75 ? '#34d399' : score >= 40 ? '#a3e635' : '#fbbf24'
  const bgColor = score >= 75 ? '#d1fae5' : score >= 40 ? '#fef3c7' : '#fee2e2'

  // Number of leaves (resolved/strengths) vs bare branches (issues)
  const totalBranches = 6
  const leafyBranches = Math.ceil(totalBranches * (score / 100))

  // Branch endpoints (symmetric tree structure)
  const branches = [
    { x1: 50, y1: 50, x2: 28, y2: 28 },  // upper-left
    { x1: 50, y1: 50, x2: 72, y2: 28 },  // upper-right
    { x1: 50, y1: 50, x2: 20, y2: 42 },  // mid-left
    { x1: 50, y1: 50, x2: 80, y2: 42 },  // mid-right
    { x1: 50, y1: 50, x2: 32, y2: 18 },  // top-left
    { x1: 50, y1: 50, x2: 68, y2: 18 },  // top-right
  ]

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      {/* Background glow */}
      <circle cx="50" cy="40" r="36" fill={bgColor} opacity="0.2" />

      {/* Trunk */}
      <line x1="50" y1="50" x2="50" y2="78" stroke="#a8a29e" strokeWidth="3" strokeLinecap="round" />
      {/* Roots */}
      <line x1="50" y1="78" x2="42" y2="82" stroke="#a8a29e" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="50" y1="78" x2="58" y2="82" stroke="#a8a29e" strokeWidth="1.5" strokeLinecap="round" />

      {/* Branches */}
      {branches.map((b, i) => {
        const isLeafy = i < leafyBranches
        return (
          <g key={i}>
            <line
              x1={b.x1} y1={b.y1}
              x2={b.x2} y2={b.y2}
              stroke={isLeafy ? color : '#d6d3d1'}
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity={isLeafy ? 0.7 : 0.4}
            />
            {/* Leaf cluster or bare end */}
            {isLeafy ? (
              <g>
                <circle cx={b.x2} cy={b.y2} r="5" fill={leafColor} opacity="0.3" />
                <circle cx={b.x2} cy={b.y2} r="3" fill={leafColor} opacity="0.5" />
              </g>
            ) : (
              <circle cx={b.x2} cy={b.y2} r="2" fill="none" stroke="#d6d3d1" strokeWidth="1" />
            )}
          </g>
        )
      })}

      {/* Center node */}
      <circle cx="50" cy="50" r="4" fill="white" stroke={color} strokeWidth="1.5" />

      {/* Score text */}
      <text x="50" y="94" textAnchor="middle" fill="#78716c" fontSize="9" fontFamily="sans-serif">
        {score}
      </text>
    </svg>
  )
}
