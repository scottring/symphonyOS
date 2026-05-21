// src/components/wall-v2/WallV2GlanceCard.tsx
//
// One AT-A-GLANCE card. Renders a tinted icon chip plus three text lines.
// Sized for the top row strip — content is intentionally short so all four
// cards line up visually.

import { TINTS } from './tints';
import type { WallV2GlanceCard } from './types';

interface Props {
  card: WallV2GlanceCard;
}

export function WallV2GlanceCard({ card }: Props) {
  const tint = TINTS[card.tint];
  const Icon = card.icon;

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/80 dark:bg-stone-900/70 px-3.5 py-3 border border-stone-200/70 dark:border-stone-700/70 shadow-[0_1px_2px_rgba(0,0,0,0.02)] min-w-0">
      <div
        className={`shrink-0 grid place-items-center w-11 h-11 rounded-xl ${tint.bg} ${tint.fg}`}
        aria-hidden
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 leading-tight">
        <div className="text-[0.95rem] font-bold text-stone-800 dark:text-stone-100 truncate">
          {card.title}
        </div>
        <div className="text-[0.85rem] text-stone-600 dark:text-stone-300 truncate">
          {card.primary}
        </div>
        {card.secondary && (
          <div className="text-[0.78rem] text-stone-500 dark:text-stone-400 truncate">
            {card.secondary}
          </div>
        )}
      </div>
    </div>
  );
}
