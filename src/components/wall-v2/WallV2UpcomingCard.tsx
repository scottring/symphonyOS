// src/components/wall-v2/WallV2UpcomingCard.tsx
//
// Right-column UPCOMING widget — colored dot + day label + detail line per
// upcoming item.

import { TINTS } from './tints';
import type { WallV2UpcomingItem } from './types';

interface Props {
  items: WallV2UpcomingItem[];
}

export function WallV2UpcomingCard({ items }: Props) {
  return (
    <div className="bg-white/85 dark:bg-stone-900/70 border border-stone-200/70 dark:border-stone-700/60 rounded-2xl p-4">
      <div className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400 mb-2.5">
        Upcoming
      </div>
      {items.length === 0 ? (
        <div className="text-[0.85rem] text-stone-500 dark:text-stone-400">
          Nothing on the calendar yet.
        </div>
      ) : (
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => {
          const tint = TINTS[item.tint];
          return (
            <li key={item.id} className="flex items-start gap-3 leading-tight">
              <span
                className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${tint.dot}`}
                aria-hidden
              />
              <div className="min-w-0">
                <div className="text-[0.95rem] font-bold text-stone-800 dark:text-stone-100 truncate">
                  {item.label}
                </div>
                <div className="text-[0.82rem] text-stone-500 dark:text-stone-400 truncate">
                  {item.detail}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}
