interface Props {
  actual: number
  target: number
  size?: number
  stroke?: number
  showValue?: boolean
}

/** Editorial-calm progress ring. Primary-500 stroke. */
export function GramRing({ actual, target, size = 76, stroke = 6, showValue = true }: Props) {
  const radius = (size - stroke) / 2
  const center = size / 2
  const circumference = 2 * Math.PI * radius
  const safeTarget = target > 0 ? target : 1
  const percent = Math.max(0, Math.min(1, actual / safeTarget))
  const dashOffset = circumference * (1 - percent)

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="flex-shrink-0"
      aria-label={`${actual} of ${target} grams`}
    >
      <circle cx={center} cy={center} r={radius} fill="none"
              stroke="hsl(38 18% 88%)" strokeWidth={stroke} />
      <circle cx={center} cy={center} r={radius} fill="none"
              stroke="hsl(168 45% 30%)" strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${center} ${center})`} />
      {showValue && (
        <text x={center} y={center + size * 0.07} textAnchor="middle"
              className="font-display fill-primary-700"
              fontSize={size * 0.28} fontStyle="italic">
          {actual}g
        </text>
      )}
    </svg>
  )
}
