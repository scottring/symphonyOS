//
// Dinner hero for the right column: photo band (or warm gradient), serif meal
// name, prep-window chip. Tap = shell's existing recipe-viewer behavior.

import { UtensilsCrossed } from 'lucide-react';
import { WALL } from './wallTheme';
import { computePrepWindow } from './wallV2Rollups';

interface Props {
  mealName: string | null;
  subtitle?: string | null;
  dinnerStart: Date | null;
  prepMinutes?: number;
  photoUrl?: string | null;
  onTap?: () => void;
}

export function WallV2DinnerCard({ mealName, subtitle, dinnerStart, prepMinutes, photoUrl, onTap }: Props) {
  if (!mealName) {
    return (
      <div className={`${WALL.dinnerCard} p-4`}>
        <div className={WALL.dinnerLabel}>Dinner plan</div>
        <div className={`mt-2 text-[0.9rem] ${WALL.muted}`}>No dinner planned — plan on the meals page.</div>
      </div>
    );
  }
  const prep = dinnerStart ? computePrepWindow(dinnerStart, prepMinutes) : null;
  return (
    <button type="button" onClick={onTap} className={`${WALL.dinnerCard} w-full text-left overflow-hidden block`} style={{ touchAction: 'pan-y' }}>
      <div
        className="h-[88px] bg-[radial-gradient(circle_at_30%_35%,#F2C296,transparent_55%),linear-gradient(135deg,#E8A87C,#C9694C)] bg-cover bg-center"
        style={photoUrl ? { backgroundImage: `url(${photoUrl})` } : undefined}
      />
      <div className="p-3.5">
        <div className={`flex items-center gap-1.5 ${WALL.dinnerLabel}`}>
          <UtensilsCrossed className="w-3.5 h-3.5" /> Dinner plan
        </div>
        <div className={`font-display italic text-[1.5rem] leading-tight mt-1 ${WALL.inkStrong}`}>{mealName}</div>
        {subtitle && <div className={`text-[0.8rem] mt-0.5 ${WALL.muted}`}>{subtitle}</div>}
        {prep && <div className={`inline-block mt-2 ${WALL.prepChip}`}>Prep window · {prep.label}</div>}
      </div>
    </button>
  );
}
