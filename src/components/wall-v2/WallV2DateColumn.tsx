// src/components/wall-v2/WallV2DateColumn.tsx
//
// The left rail: small household avatar (currently a tree mark), weekday
// in giant Fraunces, full date in primary green, and a compact weather
// hero (icon + temp + condition + hi/lo).

import { Sprout } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  weekday: string;        // "Wednesday"
  fullDate: string;       // "May 20, 2026"
  weatherIcon: LucideIcon;
  weatherTint: { bg: string; fg: string };
  temp: number;
  condition: string;
  high: number;
  low: number;
}

export function WallV2DateColumn({
  weekday, fullDate, weatherIcon: WeatherIcon, weatherTint,
  temp, condition, high, low,
}: Props) {
  return (
    <div className="flex flex-col gap-5 pt-2 pl-1">
      <div className="grid place-items-center w-12 h-12 rounded-full bg-emerald-50 text-emerald-700">
        <Sprout className="w-5 h-5" />
      </div>

      <div className="leading-none">
        <div className="font-display text-[3.5rem] text-stone-800 leading-[0.95] tracking-tight">
          {weekday}
        </div>
        <div className="mt-1.5 text-[1.05rem] font-bold text-emerald-800">
          {fullDate}
        </div>
      </div>

      <div className="flex items-end gap-3">
        <div className={`grid place-items-center w-12 h-12 rounded-2xl ${weatherTint.bg} ${weatherTint.fg}`}>
          <WeatherIcon className="w-7 h-7" />
        </div>
        <div className="leading-tight">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-[2.4rem] text-stone-800 leading-none">
              {Math.round(temp)}°
            </span>
            <span className="text-[0.95rem] text-stone-500">{condition}</span>
          </div>
          <div className="text-[0.8rem] text-stone-500 mt-0.5">
            High {Math.round(high)}°  ·  Low {Math.round(low)}°
          </div>
        </div>
      </div>
    </div>
  );
}
