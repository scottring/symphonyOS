// src/components/wall-v2/WallV2WeatherCard.tsx
//
// Right-column WEATHER widget — icon, big temp, rain chance, and a
// natural-language line. The leaf accent is a small decorative SVG sprite
// pinned bottom-right (no emoji, per project rules).

import { Leaf } from 'lucide-react';
import { TINTS } from './tints';
import type { WallV2WeatherData } from './types';

interface Props {
  data: WallV2WeatherData;
}

export function WallV2WeatherCard({ data }: Props) {
  const Icon = data.icon;
  const tint = TINTS.honey;

  return (
    <div className="relative bg-white/85 dark:bg-stone-900/70 border border-stone-200/70 dark:border-stone-700/60 rounded-2xl p-4 overflow-hidden">
      <div className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400 mb-2">
        Weather
      </div>
      <div className="flex items-center gap-3">
        <div className={`grid place-items-center w-12 h-12 rounded-2xl ${tint.bg} ${tint.fg}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="leading-tight">
          <div className="font-display text-[2.1rem] text-stone-800 dark:text-stone-100 leading-none">
            {Math.round(data.temp)}°
          </div>
          <div className="text-[0.85rem] text-stone-500 dark:text-stone-400">{data.condition}</div>
        </div>
      </div>
      <div className="mt-2.5 text-[0.85rem] text-stone-600 dark:text-stone-300">
        Rain chance {data.rainChance}%
      </div>
      {data.sentence && (
        <div className="mt-0.5 text-[0.85rem] text-stone-500 dark:text-stone-400">
          {data.sentence}
        </div>
      )}
      <Leaf className="absolute bottom-2 right-2 w-12 h-12 text-emerald-200/80 dark:text-emerald-700/40 -rotate-12" aria-hidden />
    </div>
  );
}
