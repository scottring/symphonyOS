import { Sun, Utensils, Flame, Leaf, Users } from 'lucide-react'
import { type AvatarColorName, avatarBg, avatarFg } from '@/components/meals/shared/avatarColors'

export type MealCardState = 'empty' | 'drafted' | 'cooked'
export type MealPrepLabel = 'Quick prep' | 'Medium prep' | 'Long prep'

export interface MealCardAvatar {
  id: string
  initials: string
  color: AvatarColorName
}

interface TodayMealCardProps {
  dayLabel: string           // "Monday"
  title: string              // "Dutch Oven Barley Risotto"
  sides?: string             // "Asparagus + Parmesan"
  methodLabel?: string       // "HANDS-OFF OVEN METHOD"
  methodBody?: string        // free text — instructions/highlights
  kidsLine?: string          // "Plain barley + parmesan, asparagus on the side."
  servesCount?: number       // 4
  prepLabel?: MealPrepLabel
  nutritionLabel?: string    // "Nutritious & satisfying"
  diners?: MealCardAvatar[]
  state: MealCardState
  /** Click handler for the "Generate plan" CTA (only active when state is 'empty'). */
  onGeneratePlan: () => void
  /** Demoted CTA: regenerate this meal (visible when state !== 'empty'). */
  onRegenerate: () => void
  /** View the underlying recipe (visible when state !== 'empty'). */
  onViewRecipe: () => void
}

/**
 * Hero card for the Today meals tab. One meal at a time, presented as an
 * editorial unit — serif title, method-named callout, kids adaptation, the
 * "Serves / Prep / Nutrition" metadata triplet, and an avatar stack of who's
 * eating. CTA stack adapts to plan state: 'empty' surfaces "Generate plan"
 * as primary; 'drafted' and 'cooked' surface "View recipe" instead.
 */
export function TodayMealCard({
  dayLabel,
  title,
  sides,
  methodLabel,
  methodBody,
  kidsLine,
  servesCount,
  prepLabel,
  nutritionLabel,
  diners,
  state,
  onGeneratePlan,
  onRegenerate,
  onViewRecipe,
}: TodayMealCardProps) {
  // 'cooked' is treated the same as 'drafted' for CTA purposes — once a plan
  // exists, regenerating is a demoted action; viewing the recipe is primary.
  const primaryIsGenerate = state === 'empty'

  return (
    <section
      aria-label="Today's meal"
      className="rounded-2xl border border-neutral-200/70 bg-bg-elevated p-6 shadow-sm"
    >
      {/* Day label */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-neutral-600">
          <Sun className="w-4 h-4 text-amber-500" aria-hidden />
          {dayLabel}
        </p>
        {diners && diners.length > 0 && (
          <div
            className="flex -space-x-1.5"
            aria-label={`Diners: ${diners.slice(0, 5).map((d) => d.initials).join(', ')}`}
          >
            {diners.slice(0, 5).map((d) => (
              <span
                key={d.id}
                className="inline-flex items-center justify-center w-7 h-7 rounded-full ring-2 ring-bg-elevated text-[10px] font-medium"
                style={{
                  backgroundColor: avatarBg(d.color),
                  color: avatarFg(d.color),
                }}
                aria-hidden
              >
                {d.initials}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Title + sides */}
      <h2 className="font-display text-2xl text-neutral-800 leading-tight">{title}</h2>
      {sides && (
        <p className="font-display italic text-lg text-primary-600 mt-1">
          with {sides}
        </p>
      )}

      {/* Method body */}
      {methodLabel && (
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-primary-700">
          {methodLabel}
        </p>
      )}
      {methodBody && (
        <p className="mt-2 text-[14px] text-neutral-700 leading-relaxed whitespace-pre-wrap">
          {methodBody}
        </p>
      )}

      {/* Kids line */}
      {kidsLine && (
        <div className="mt-4 flex items-start gap-2 text-[13px]">
          <Users className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" aria-hidden />
          <p className="text-neutral-700">
            <span className="font-medium text-neutral-800">Kids:</span> {kidsLine}
          </p>
        </div>
      )}

      {/* Metadata triplet */}
      {(servesCount != null || prepLabel || nutritionLabel) && (
        <div className="mt-5 flex items-center gap-4 text-[12px] text-neutral-500 flex-wrap">
          {servesCount != null && (
            <span className="flex items-center gap-1.5">
              <Utensils className="w-3.5 h-3.5" aria-hidden />
              Serves {servesCount}
            </span>
          )}
          {prepLabel && (
            <span className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5" aria-hidden />
              {prepLabel}
            </span>
          )}
          {nutritionLabel && (
            <span className="flex items-center gap-1.5">
              <Leaf className="w-3.5 h-3.5" aria-hidden />
              {nutritionLabel}
            </span>
          )}
        </div>
      )}

      {/* Action row */}
      <div className="mt-6 flex items-center gap-2">
        {primaryIsGenerate ? (
          <button
            type="button"
            onClick={onGeneratePlan}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors"
          >
            Generate plan
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onViewRecipe}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors"
            >
              View recipe
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              className="px-4 py-2 rounded-lg text-[13px] font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              Regenerate
            </button>
          </>
        )}
      </div>
    </section>
  )
}

