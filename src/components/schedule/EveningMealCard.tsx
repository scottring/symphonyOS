import { UtensilsCrossed } from 'lucide-react'

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
 * timeline — warm peach ground, serif title, image affordance, optional recipe
 * link.
 *
 * Sized down a notch (2026-08-31) because atmosphere had turned into rank. At
 * a 56px thumbnail, an 18px serif title and a row of boxed chips, the meal was
 * the largest object on the page — it outweighed a 7:30-to-2:10 school day
 * rendered as a plain line, and the eye read the day's biggest commitment as
 * subordinate to what's for dinner. The card keeps every distinguishing move
 * (the ground, the serif, the image, the diners); what it gives up is the
 * extra size and the chip row, with serves-count folded into the eyebrow it
 * was already sitting under. Warmest thing on Today, no longer the loudest.
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
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[hsl(28_55%_95%)] cursor-pointer hover:bg-[hsl(28_55%_92%)] transition-colors"
    >
      <span className="shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-[hsl(28_45%_88%)] flex items-center justify-center">
        {imageUrl
          ? <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          : <UtensilsCrossed className="w-[18px] h-[18px] text-[hsl(14_45%_50%)]" />}
      </span>
      <div className="min-w-0 flex-1">
        {/* One eyebrow carries the whole metadata row the card used to spend a
            line of chips on. */}
        <p className="text-[11px] font-medium uppercase tracking-wide text-[hsl(14_40%_45%)]">
          Dinner at <span>{timeLabel}</span>
          {hasMeta && <span className="text-[hsl(14_25%_60%)]">
            {fromPlan && ' · Meal plan'}
            {servesCount != null && ` · Serves ${servesCount}`}
          </span>}
        </p>
        <p className="font-display text-base text-neutral-800 leading-tight truncate">{title}</p>
        {sides && <p className="text-[13px] text-neutral-500 truncate">{sides}</p>}
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

function dinerColor(name: string, alpha: number): string {
  const base = (() => {
    switch (name) {
      case 'blue': return 'hsl(217 91% 60%)'
      case 'purple': return 'hsl(271 81% 56%)'
      case 'green': return 'hsl(142 71% 45%)'
      case 'orange': return 'hsl(25 95% 53%)'
      case 'pink': return 'hsl(330 81% 60%)'
      case 'teal': return 'hsl(168 76% 42%)'
      default: return 'hsl(168 45% 30%)'
    }
  })()
  if (alpha >= 1) return base
  return `color-mix(in srgb, ${base} ${Math.round(alpha * 100)}%, white)`
}
