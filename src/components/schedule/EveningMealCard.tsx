import { UtensilsCrossed } from 'lucide-react'
import { dinerColor } from '@/components/meals/shared/avatarColors'

/** Slim avatar shape passed to the dinner card — typically core family members. */
export interface DinerAvatar {
  id: string
  initials: string
  /** Tailwind-style color name from FamilyMember.color (blue/purple/etc) or a CSS color. */
  color: string
}

interface EveningMealCardProps {
  title: string
  sides?: string
  timeLabel: string
  recipeUrl?: string
  imageUrl?: string
  /** When set, renders a "Serves N" pill in the metadata row. */
  servesCount?: number
  /** When the meal originated from the meal plan (not ad-hoc). */
  fromPlan?: boolean
  /** Top-right cluster of small avatars showing intended diners. */
  diners?: DinerAvatar[]
  onSelect: () => void
}

/**
 * Evening dinner card. The intentional "atmosphere-first" surface on the Today
 * timeline — warm peach background, serif title, image affordance, optional
 * recipe link. Phase 2 added meta chips (serves count, "Meal plan") and a
 * stacked avatar cluster for diners.
 */
export function EveningMealCard({
  title,
  sides,
  timeLabel,
  recipeUrl,
  imageUrl,
  servesCount,
  fromPlan,
  diners,
  onSelect,
}: EveningMealCardProps) {
  const hasDiners = !!diners && diners.length > 0
  const hasMeta = servesCount != null || fromPlan

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
        {hasMeta && (
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            {fromPlan && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-white/70 text-[hsl(14_40%_40%)]">
                Meal plan
              </span>
            )}
            {servesCount != null && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-white/70 text-[hsl(14_40%_40%)]">
                Serves {servesCount}
              </span>
            )}
          </div>
        )}
      </div>

      {hasDiners && (
        <div className="shrink-0 flex -space-x-1.5" aria-label="Diners">
          {diners!.slice(0, 4).map((d) => (
            <span
              key={d.id}
              className="inline-flex items-center justify-center w-6 h-6 rounded-full ring-2 ring-[hsl(28_55%_94%)] text-[9px] font-medium"
              style={{
                backgroundColor: dinerColor(d.color, 0.18),
                color: dinerColor(d.color, 1),
              }}
              aria-hidden
            >
              {d.initials}
            </span>
          ))}
        </div>
      )}

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

