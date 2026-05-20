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
  // Use the actual card count for the column grid so 1–4 cards each fill the
  // row evenly. Anything beyond 4 wraps onto a second row at 4 per row.
  const cols = Math.min(Math.max(cards.length, 1), 4);
  const gridColsClass =
    cols === 1 ? 'grid-cols-1'
    : cols === 2 ? 'grid-cols-2'
    : cols === 3 ? 'grid-cols-3'
    : 'grid-cols-4';

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
      {cards.length > 0 ? (
        <div className={`grid ${gridColsClass} gap-3`}>
          {cards.map((c) => (
            <WallV2GlanceCard key={c.id} card={c} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-white/60 border border-stone-200/60 px-4 py-3 text-[0.9rem] text-stone-500">
          Everyone's set — no scheduled items right now.
        </div>
      )}
    </div>
  );
}
