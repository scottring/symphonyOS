// src/components/wall-v2/WallV2Header.tsx
//
// The horizontal masthead, replacing the 220px left rail.
//
// The rail plus the 264px right column ate 484px of a 1024px screen — 47% of
// the width — leaving the lanes barely half the wall. Lanes are the wall's
// primary structure and they are horizontal by nature (face, name, time,
// commitment, "then"), so the width belongs to them. Moving the date/weather
// block into a header buys the lanes ~280px and costs ~90px of height, which
// is the trade this screen wants.
//
// The phone is deliberately NOT here — see WallV2Strip for why it lives low
// and left instead of in a top corner.

import type { LucideIcon } from 'lucide-react';
import { WALL } from './wallTheme';
import { WallV2FreshnessLine } from './WallV2FreshnessLine';
import type { Freshness } from './wallFreshness';

interface Props {
  weekday: string;
  fullDate: string;
  time: string;
  weatherIcon: LucideIcon;
  weatherTint: { bg: string; fg: string };
  temp: number;
  condition: string;
  high: number;
  low: number;
  freshness: Freshness;
  /** One line from the at-a-glance rollup — the card's slot went with the
   *  right column, and the signal is worth more than the card was. */
  glance?: string | null;
  actions?: React.ReactNode;
}

export function WallV2Header({
  weekday, fullDate, time, weatherIcon: WeatherIcon, weatherTint,
  temp, condition, high, low, freshness, glance, actions,
}: Props) {
  return (
    <header className={`${WALL.card} shrink-0 h-[92px] flex items-center gap-6 px-6 min-w-0`}>
      <div className="min-w-0">
        <div className={`font-display text-[2.1rem] leading-none truncate ${WALL.inkStrong}`}>
          {weekday}, {fullDate}
        </div>
        {/* Freshness rides directly under the date rather than tucked inside
            the weather chip. A stale or blank wall is this kiosk's most common
            failure, so the line that reveals it is worth real estate. */}
        <div className="mt-1.5 flex items-center gap-3 min-w-0">
          <span className={`text-[1.05rem] font-bold tabular-nums ${WALL.muted}`}>{time}</span>
          <WallV2FreshnessLine freshness={freshness} />
          {glance && (
            <span className={`text-[1.05rem] truncate ${WALL.muted}`}>· {glance}</span>
          )}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-5 shrink-0">
        {actions}

        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl grid place-items-center ${weatherTint.bg}`}>
            <WeatherIcon className={`w-8 h-8 ${weatherTint.fg}`} />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className={`font-display text-[2.4rem] leading-none tabular-nums ${WALL.inkStrong}`}>
                {Math.round(temp)}°
              </span>
              <span className={`text-[1.05rem] font-bold truncate max-w-[9rem] ${WALL.muted}`}>
                {condition}
              </span>
            </div>
            <div className={`text-[1rem] font-bold tabular-nums ${WALL.muted}`}>
              ↑{Math.round(high)}° ↓{Math.round(low)}°
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
