interface Props {
  stockedPercent: number
  missingCount: number
  totalCount: number
  onSendToGroceries: () => void
}

export function GroceryStatusCard({ stockedPercent, missingCount, totalCount, onSendToGroceries }: Props) {
  const sample = stockedPercent === 100
  const radius = 32
  const circumference = 2 * Math.PI * radius
  const strokePercent = stockedPercent / 100
  const strokeDashoffset = circumference * (1 - strokePercent)

  return (
    <div className="bg-bg-elevated rounded-2xl shadow-card border border-neutral-200 p-6 mb-8 flex items-center gap-6">
      <svg width="76" height="76" viewBox="0 0 76 76" className="flex-shrink-0">
        <circle cx="38" cy="38" r={radius} fill="none" stroke="hsl(38 18% 88%)" strokeWidth="6" />
        <circle cx="38" cy="38" r={radius} fill="none"
                stroke="hsl(168 45% 30%)" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                transform="rotate(-90 38 38)" />
        <text x="38" y="44" textAnchor="middle"
              className="font-display fill-neutral-800" fontSize="20">
          {stockedPercent}%
        </text>
      </svg>
      <div className="flex-1">
        <div className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-neutral-500 mb-1">
          GROCERIES
        </div>
        <p className="font-display text-[1.5rem] text-neutral-800 leading-tight">
          You're <span className="italic text-primary-500">{stockedPercent}%</span> stocked for this week.
        </p>
        <p className="text-[14px] text-neutral-500 mt-1">
          {sample
            ? `${totalCount} planned ingredient${totalCount === 1 ? '' : 's'}.`
            : `${missingCount} item${missingCount === 1 ? '' : 's'} missing.`}
        </p>
      </div>
      <button onClick={onSendToGroceries}
              disabled={missingCount === 0}
              className="px-5 py-2 rounded-full text-[13px] font-medium bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40">
        {missingCount === 0 ? 'All stocked' : `Review the ${missingCount} →`}
      </button>
    </div>
  )
}
