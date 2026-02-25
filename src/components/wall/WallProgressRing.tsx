interface WallProgressRingProps {
  completed: number
  total: number
  size?: number
  strokeWidth?: number
}

export function WallProgressRing({
  completed,
  total,
  size = 56,
  strokeWidth = 5,
}: WallProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = total > 0 ? completed / total : 0
  const offset = circumference * (1 - progress)

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="wall-progress-ring"
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(40 18% 88% / 0.5)"
          strokeWidth={strokeWidth}
        />
        {/* Fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(168 45% 40%)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="wall-progress-fill"
        />
      </svg>
      {/* Center text */}
      <span className="absolute text-[0.9rem] font-medium text-neutral-600 tabular-nums">
        {completed}/{total}
      </span>
    </div>
  )
}
