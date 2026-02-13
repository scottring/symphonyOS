// AssessmentDepthMeter — Quality tier stepper for domain assessment conversations
// Shows milestone-based progression: Gathering → Baseline → Strong → Comprehensive
// Each tier communicates what depth of results the user will get at that level
// Designed to encourage deeper sharing without making users feel "not done enough"

interface AssessmentDepthMeterProps {
  turnCount: number
  minTurns: number
  maxTurns: number
}

type DepthTier = {
  id: string
  label: string
  description: string
  unlocks: string
  accentColor: string
  textColor: string
  bgColor: string
  dotBg: string
  ringColor: string
}

const TIERS: DepthTier[] = [
  {
    id: 'gathering',
    label: 'Gathering',
    description: 'Building your picture',
    unlocks: 'Keep sharing to unlock initial results',
    accentColor: 'border-stone-300',
    textColor: 'text-stone-500',
    bgColor: 'bg-stone-100',
    dotBg: 'bg-stone-300',
    ringColor: 'ring-stone-200',
  },
  {
    id: 'baseline',
    label: 'Baseline',
    description: 'Initial assessment ready',
    unlocks: 'You can synthesize — or go deeper for better results',
    accentColor: 'border-amber-400',
    textColor: 'text-amber-600',
    bgColor: 'bg-amber-50',
    dotBg: 'bg-amber-400',
    ringColor: 'ring-amber-200',
  },
  {
    id: 'strong',
    label: 'Strong',
    description: 'Meaningful recommendations',
    unlocks: 'Great detail — a few more turns will unlock comprehensive depth',
    accentColor: 'border-emerald-400',
    textColor: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    dotBg: 'bg-emerald-400',
    ringColor: 'ring-emerald-200',
  },
  {
    id: 'comprehensive',
    label: 'Comprehensive',
    description: 'Highly actionable results',
    unlocks: 'Excellent depth — synthesize anytime for top-quality output',
    accentColor: 'border-emerald-600',
    textColor: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    dotBg: 'bg-emerald-600',
    ringColor: 'ring-emerald-300',
  },
]

function getThresholds(minTurns: number, maxTurns: number) {
  return {
    baseline: Math.floor(minTurns * 0.5),      // ~3 for a 6-turn min
    strong: minTurns,                            // 6 — can synthesize here
    comprehensive: Math.floor((minTurns + maxTurns) / 2),  // ~8 for 6-10 range
  }
}

function getTierIndex(turnCount: number, thresholds: ReturnType<typeof getThresholds>): number {
  if (turnCount >= thresholds.comprehensive) return 3
  if (turnCount >= thresholds.strong) return 2
  if (turnCount >= thresholds.baseline) return 1
  return 0
}

// How far through the current tier (0-1)
function getTierProgress(turnCount: number, thresholds: ReturnType<typeof getThresholds>): number {
  const boundaries = [0, thresholds.baseline, thresholds.strong, thresholds.comprehensive]
  const tierIndex = getTierIndex(turnCount, thresholds)

  if (tierIndex >= 3) return 1 // At max tier

  const tierStart = boundaries[tierIndex]
  const tierEnd = boundaries[tierIndex + 1]
  const range = tierEnd - tierStart

  if (range <= 0) return 1
  return Math.min(1, (turnCount - tierStart) / range)
}

export function AssessmentDepthMeter({ turnCount, minTurns, maxTurns }: AssessmentDepthMeterProps) {
  const thresholds = getThresholds(minTurns, maxTurns)
  const currentTierIndex = getTierIndex(turnCount, thresholds)
  const currentTier = TIERS[currentTierIndex]
  const tierProgress = getTierProgress(turnCount, thresholds)

  return (
    <div className="mt-3">
      {/* Stepper: nodes connected by progress lines */}
      <div className="flex items-center gap-0">
        {TIERS.map((tier, i) => {
          const isCompleted = i < currentTierIndex
          const isCurrent = i === currentTierIndex
          const isFuture = i > currentTierIndex

          return (
            <div key={tier.id} className="flex items-center" style={{ flex: i < TIERS.length - 1 ? 1 : 0 }}>
              {/* Node */}
              <div className="relative flex flex-col items-center" style={{ zIndex: 1 }}>
                <div
                  className={`
                    w-3.5 h-3.5 rounded-full border-2 transition-all duration-500
                    ${isCompleted ? `${tier.dotBg} border-transparent` : ''}
                    ${isCurrent ? `${tier.dotBg} border-transparent ring-[3px] ring-offset-1 ${tier.ringColor}` : ''}
                    ${isFuture ? 'bg-white border-stone-200' : ''}
                  `}
                >
                  {/* Checkmark for completed tiers */}
                  {isCompleted && (
                    <svg className="w-full h-full text-white p-[1px]" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2.5-2.5a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z" />
                    </svg>
                  )}
                  {/* Pulse for current */}
                  {isCurrent && turnCount > 0 && (
                    <div className={`absolute inset-0 rounded-full ${tier.dotBg} opacity-30 animate-ping`} />
                  )}
                </div>
              </div>

              {/* Connecting line to next node */}
              {i < TIERS.length - 1 && (
                <div className="flex-1 h-[3px] bg-stone-100 rounded-full mx-1 relative overflow-hidden">
                  {/* Fill: full for completed segments, partial for current */}
                  {isCompleted && (
                    <div className={`absolute inset-0 ${TIERS[i + 1].dotBg} rounded-full transition-all duration-700`} />
                  )}
                  {isCurrent && (
                    <div
                      className={`absolute inset-y-0 left-0 ${tier.dotBg} rounded-full transition-all duration-500`}
                      style={{ width: `${tierProgress * 100}%` }}
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Tier labels underneath stepper */}
      <div className="flex items-start mt-1.5" style={{ marginLeft: '-2px', marginRight: '-2px' }}>
        {TIERS.map((tier, i) => {
          const isCurrent = i === currentTierIndex
          const isFuture = i > currentTierIndex
          return (
            <div
              key={tier.id}
              className="flex-1 text-center"
              style={{ minWidth: 0 }}
            >
              <span className={`text-[9px] leading-tight font-medium block ${
                isCurrent ? tier.textColor : isFuture ? 'text-stone-300' : 'text-stone-400'
              }`}>
                {tier.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Current status card */}
      <div className={`mt-2 px-3 py-2 rounded-lg border ${currentTier.accentColor} ${currentTier.bgColor} transition-all duration-500`}>
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <span className={`text-[11px] font-semibold ${currentTier.textColor}`}>
              {currentTier.description}
            </span>
            <p className="text-[10px] text-stone-400 mt-0.5 leading-snug">
              {currentTier.unlocks}
            </p>
          </div>
          <div className="flex items-center gap-1.5 ml-3 shrink-0">
            {/* Turn counter */}
            <span className={`text-[10px] tabular-nums font-medium ${currentTier.textColor}`}>
              {turnCount}
            </span>
            <span className="text-[10px] text-stone-300">/</span>
            <span className="text-[10px] text-stone-300 tabular-nums">{maxTurns}</span>
          </div>
        </div>
      </div>

      {/* Auto-save indicator */}
      {turnCount > 0 && (
        <div className="flex items-center gap-1 mt-1.5">
          <div className="w-1 h-1 rounded-full bg-emerald-400" />
          <span className="text-[9px] text-stone-400">Progress saved</span>
        </div>
      )}
    </div>
  )
}
