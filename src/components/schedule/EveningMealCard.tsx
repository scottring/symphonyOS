import { UtensilsCrossed } from 'lucide-react'

interface EveningMealCardProps {
  title: string
  sides?: string
  timeLabel: string
  recipeUrl?: string
  imageUrl?: string
  onSelect: () => void
}

export function EveningMealCard({ title, sides, timeLabel, recipeUrl, imageUrl, onSelect }: EveningMealCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      className="flex items-center gap-4 px-4 py-3 rounded-xl bg-[hsl(28_55%_94%)] cursor-pointer hover:bg-[hsl(28_55%_92%)] transition-colors"
    >
      <span className="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-[hsl(28_45%_86%)] flex items-center justify-center">
        {imageUrl
          ? <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          : <UtensilsCrossed className="w-6 h-6 text-[hsl(14_45%_50%)]" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[hsl(14_40%_45%)]">
          Dinner at <span>{timeLabel}</span>
        </p>
        <p className="font-display text-lg text-neutral-800 leading-tight truncate">{title}</p>
        {sides && <p className="text-[13px] text-neutral-500 truncate">{sides}</p>}
      </div>
      {recipeUrl && (
        <a
          href={recipeUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium bg-white/70 text-[hsl(14_40%_40%)] hover:bg-white"
        >
          View recipe →
        </a>
      )}
    </div>
  )
}
