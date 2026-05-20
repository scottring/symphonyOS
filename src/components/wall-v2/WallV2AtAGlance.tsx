// src/components/wall-v2/WallV2AtAGlance.tsx
//
// The top strip above TODAY'S PLAN: a small "AT A GLANCE" label,
// a centered serif tagline, then up to four signal cards in a row.

import { WallV2GlanceCard } from './WallV2GlanceCard';
import type { WallV2GlanceCard as GlanceCardData } from './types';

interface Props {
  tagline: string;
  cards: GlanceCardData[];
}

export function WallV2AtAGlance({ tagline, cards }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-6">
        <div className="text-[0.72rem] font-bold uppercase tracking-[0.22em] text-stone-500">
          At a glance
        </div>
        <div className="font-display italic text-[1.35rem] leading-tight text-stone-700 truncate">
          {tagline}
        </div>
        <div className="w-[6rem]" aria-hidden />
      </div>
      <div className="grid grid-cols-4 gap-3">
        {cards.map((c) => (
          <WallV2GlanceCard key={c.id} card={c} />
        ))}
      </div>
    </div>
  );
}
