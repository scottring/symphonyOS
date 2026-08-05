//
// Dinner hero for the right column: photo band (or warm gradient), serif meal
// name, prep-window chip. Tap = shell's existing recipe-viewer behavior.
//
// Day arrows page to the previous/next planned dinner. The card is a div, not
// a button — the arrows are real buttons and cannot nest inside one.

import { UtensilsCrossed, ChevronLeft, ChevronRight } from 'lucide-react';
import { WALL } from './wallTheme';
import { computePrepWindow } from './wallV2Rollups';

interface Props {
  mealName: string | null;
  subtitle?: string | null;
  dinnerStart: Date | null;
  prepMinutes?: number;
  photoUrl?: string | null;
  onTap?: () => void;
  /** Set only when showing a day other than today, e.g. "Thu, Aug 6". */
  dayLabel?: string | null;
  /** null = no planned dinner that way; the arrow renders disabled, not hidden,
   *  so the card never changes height under someone's finger. */
  onPrevDay?: (() => void) | null;
  onNextDay?: (() => void) | null;
}

export function WallV2DinnerCard({
  mealName, subtitle, dinnerStart, prepMinutes, photoUrl, onTap,
  dayLabel, onPrevDay, onNextDay,
}: Props) {
  const hasDayNav = onPrevDay !== undefined || onNextDay !== undefined;

  if (!mealName) {
    return (
      <div className={`${WALL.dinnerCard} p-4`}>
        <div className={WALL.dinnerLabel}>Dinner plan</div>
        <div className={`mt-2 text-[0.9rem] ${WALL.muted}`}>No dinner planned — plan on the meals page.</div>
      </div>
    );
  }

  // The prep window is a countdown against tonight's clock — it means nothing
  // on another day, so paging away drops it rather than showing a stale time.
  const prep = dayLabel ? null : (dinnerStart ? computePrepWindow(dinnerStart, prepMinutes) : null);

  return (
    <div className={`${WALL.dinnerCard} overflow-hidden`}>
      <button
        type="button"
        onClick={onTap}
        aria-label={`Open recipe: ${mealName}`}
        className="w-full text-left block"
        style={{ touchAction: 'pan-y' }}
      >
        <div
          className="h-[88px] bg-[radial-gradient(circle_at_30%_35%,#F2C296,transparent_55%),linear-gradient(135deg,#E8A87C,#C9694C)] bg-cover bg-center"
          style={photoUrl ? { backgroundImage: `url(${photoUrl})` } : undefined}
        />
      </button>
      <div className="p-3.5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onTap}
            aria-label={`Open recipe: ${mealName}`}
            className={`flex items-center gap-1.5 ${WALL.dinnerLabel} text-left whitespace-nowrap`}
            style={{ touchAction: 'pan-y' }}
          >
            <UtensilsCrossed className="w-3.5 h-3.5 shrink-0" />
            {/* "Tonight" rather than "Dinner plan" once the arrows are here:
                it's the same word the recipe viewer uses for today, and the
                longer label wrapped to two lines beside them. */}
            {dayLabel ?? (hasDayNav ? 'Tonight' : 'Dinner plan')}
          </button>
          {hasDayNav && (
            <div className="flex items-center gap-1 -my-2 -mr-1.5 shrink-0">
              <DayArrow direction="prev" onClick={onPrevDay ?? null} />
              <DayArrow direction="next" onClick={onNextDay ?? null} />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onTap}
          aria-label={`Open recipe: ${mealName}`}
          className="w-full text-left block"
          style={{ touchAction: 'pan-y' }}
        >
          <div className={`font-display italic text-[1.5rem] leading-tight mt-1 ${WALL.inkStrong}`}>{mealName}</div>
          {subtitle && <div className={`text-[0.8rem] mt-0.5 ${WALL.muted}`}>{subtitle}</div>}
          {prep && <div className={`inline-block mt-2 ${WALL.prepChip}`}>Prep window · {prep.label}</div>}
        </button>
      </div>
    </div>
  );
}

// 48px touch target — the wall's floor for anything a standing adult taps.
function DayArrow({ direction, onClick }: { direction: 'prev' | 'next'; onClick: (() => void) | null }) {
  const isPrev = direction === 'prev';
  const Icon = isPrev ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick ?? undefined}
      disabled={!onClick}
      aria-label={isPrev ? 'Previous day' : 'Next day'}
      style={{ touchAction: 'pan-y' }}
      className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-150
        ${onClick
          ? 'text-[#A8743F] dark:text-[#D8BC85] active:scale-90 active:bg-[#F2E4C4] dark:active:bg-[#4A3D28]'
          : 'text-[#A8743F]/25 dark:text-[#D8BC85]/25'
        }`}
    >
      <Icon className="w-6 h-6" />
    </button>
  );
}
