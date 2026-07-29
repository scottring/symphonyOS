//
// The rail: serif weekday/date, tagline, serif clock, weather chip, and the
// daily quote pinned to the bottom. Fills the shell's left grid column.

import type { LucideIcon } from 'lucide-react';
import { WALL, wallQuote } from './wallTheme';
import { WallV2FreshnessLine } from './WallV2FreshnessLine';
import type { Freshness } from './wallFreshness';

interface Props {
  weekday: string;
  fullDate: string;
  time: string;
  date: Date;
  weatherIcon: LucideIcon;
  weatherTint: { bg: string; fg: string };
  temp: number;
  condition: string;
  high: number;
  low: number;
  /** Data freshness, shown under the weather chip. */
  freshness: Freshness;
}

export function WallV2DateColumn({
  weekday, fullDate, time, date, weatherIcon: WeatherIcon, weatherTint,
  temp, condition, high, low, freshness,
}: Props) {
  const quote = wallQuote(date);
  return (
    <div className={`${WALL.rail} rounded-2xl h-full flex flex-col p-5`}>
      <div className="font-display italic text-[2.3rem] leading-[1.05] text-[#2E4638] dark:text-[#4E7261]"><span>{weekday}</span>,<br />{fullDate.replace(/, \d{4}$/, '')}</div>
      <div className={`mt-2 ${WALL.label}`}>Here's the shape of your day</div>
      <div className={`mt-4 font-display text-[2.75rem] leading-none tabular-nums ${WALL.ink}`}>
        {time}
      </div>
      <div className={`mt-4 ${WALL.cardInset} p-3`}>
        <div className="flex items-center gap-2.5">
          <div className={`grid place-items-center w-11 h-11 rounded-xl ${weatherTint.bg} ${weatherTint.fg}`}>
            <WeatherIcon className="w-6 h-6" />
          </div>
          <div className="leading-tight">
            <div className="flex items-baseline gap-1.5">
              <span className={`font-display text-[1.7rem] leading-none ${WALL.inkStrong}`}>{Math.round(temp)}°</span>
              <span className={`text-[0.85rem] ${WALL.muted}`}>{condition}</span>
            </div>
            <div className={`text-[0.75rem] mt-0.5 ${WALL.muted}`}>↑ {Math.round(high)}° · ↓ {Math.round(low)}°</div>
          </div>
        </div>
      </div>
      <WallV2FreshnessLine freshness={freshness} />
      <div className={`mt-auto pt-4 font-display italic text-center text-[0.85rem] leading-relaxed ${WALL.muted}`}>
        "{quote.text}"<br />— {quote.author}
      </div>
    </div>
  );
}
