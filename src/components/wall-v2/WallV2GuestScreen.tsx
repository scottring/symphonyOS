// src/components/wall-v2/WallV2GuestScreen.tsx
//
// Guest mode: a full-screen ambient cover that hides all private content
// (tasks, family names, glance cards) when guests are over. Shows only a
// large clock, date, and weather over a calm gradient. Tap anywhere to exit.

import type { LucideIcon } from 'lucide-react';
import { WALL } from './wallTheme';

interface Props {
  time: string;       // "9:41 AM"
  weekday: string;    // "Sunday"
  fullDate: string;   // "May 24, 2026"
  temp: number;
  condition: string;
  weatherIcon: LucideIcon;
  onExit: () => void;
}

export function WallV2GuestScreen({
  time, weekday, fullDate, temp, condition, weatherIcon: WeatherIcon, onExit,
}: Props) {
  return (
    <button
      type="button"
      onClick={onExit}
      aria-label="Exit guest mode"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 cursor-pointer ${WALL.root}`}
    >
      <div className="font-display text-[10rem] leading-none tabular-nums drop-shadow-lg">
        {time}
      </div>
      <div className={`font-display text-3xl font-medium ${WALL.inkStrong}`}>
        {weekday}, {fullDate}
      </div>
      <div className={`flex items-center gap-3 text-2xl ${WALL.muted}`}>
        <WeatherIcon className="w-8 h-8" />
        <span>{Math.round(temp)}°</span>
        <span>{condition}</span>
      </div>
      <div className={`absolute bottom-10 text-sm uppercase tracking-[0.25em] ${WALL.muted}`}>
        Tap to exit guest mode
      </div>
    </button>
  );
}
