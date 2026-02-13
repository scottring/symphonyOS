// CommunicationNetwork — Network threads showing connection quality
// Nodes represent family members; thread thickness/color reflects harmony

import type { VisualProps } from './DomainVisual'

export function CommunicationNetwork({ score, strengths, issues, size, className }: VisualProps) {
  const color = score >= 75 ? '#34d399' : score >= 40 ? '#fbbf24' : '#f87171'
  const bgColor = score >= 75 ? '#d1fae5' : score >= 40 ? '#fef3c7' : '#fee2e2'

  // Node positions (pentagon layout for 5 connection points)
  const nodes = [
    { x: 50, y: 18 },  // top
    { x: 78, y: 38 },  // right-top
    { x: 68, y: 72 },  // right-bottom
    { x: 32, y: 72 },  // left-bottom
    { x: 22, y: 38 },  // left-top
  ]

  // Determine which connections are "strong" vs "weak"
  const totalFindings = strengths + issues
  const strongRatio = totalFindings > 0 ? strengths / totalFindings : score / 100

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      {/* Background glow */}
      <circle cx="50" cy="48" r="36" fill={bgColor} opacity="0.3" />

      {/* Connection threads between all nodes */}
      {nodes.map((from, i) =>
        nodes.slice(i + 1).map((to, j) => {
          const connectionIndex = i * nodes.length + j
          const isStrong = (connectionIndex / (nodes.length * (nodes.length - 1) / 2)) < strongRatio
          return (
            <line
              key={`${i}-${i + j + 1}`}
              x1={from.x} y1={from.y}
              x2={to.x} y2={to.y}
              stroke={isStrong ? color : '#d6d3d1'}
              strokeWidth={isStrong ? 1.5 : 0.8}
              opacity={isStrong ? 0.6 : 0.3}
            />
          )
        })
      )}

      {/* Nodes */}
      {nodes.map((node, i) => (
        <g key={i}>
          <circle cx={node.x} cy={node.y} r="6" fill="white" stroke={color} strokeWidth="1.5" />
          <circle cx={node.x} cy={node.y} r="3" fill={i < Math.ceil(nodes.length * score / 100) ? color : '#d6d3d1'} />
        </g>
      ))}

      {/* Score text */}
      <text x="50" y="94" textAnchor="middle" fill="#78716c" fontSize="9" fontFamily="sans-serif">
        {score}
      </text>
    </svg>
  )
}
