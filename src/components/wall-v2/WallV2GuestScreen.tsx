// src/components/wall-v2/WallV2GuestScreen.tsx
//
// Guest mode: a full-screen ambient cover that hides all private content
// (tasks, family names, glance cards) when guests are over. Shows only a
// large clock, date, and weather over a calm gradient. Tap anywhere to exit.

import type { LucideIcon } from 'lucide-react';

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
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 text-white cursor-pointer bg-gradient-to-br from-emerald-900 via-stone-900 to-stone-950"
    >
      <div className="font-display text-[10rem] leading-none tabular-nums drop-shadow-lg">
        {time}
      </div>
      <div className="text-3xl font-medium text-white/90">
        {weekday}, {fullDate}
      </div>
      <div className="flex items-center gap-3 text-2xl text-white/80">
        <WeatherIcon className="w-8 h-8" />
        <span>{Math.round(temp)}°</span>
        <span className="text-white/60">{condition}</span>
      </div>
      <div className="absolute bottom-10 text-sm uppercase tracking-[0.25em] text-white/40">
        Tap to exit guest mode
      </div>
    </button>
  );
}
