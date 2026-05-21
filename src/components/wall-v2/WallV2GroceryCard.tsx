// src/components/wall-v2/WallV2GroceryCard.tsx
//
// Right-column GROCERY widget — count of missing ingredients with a bulleted
// preview list. Chevron hints at tap-through (wired in a future pass).

import { ChevronRight, ShoppingBag } from 'lucide-react';
import { TINTS } from './tints';
import type { WallV2GroceryData } from './types';

interface Props {
  data: WallV2GroceryData;
  onTap?: () => void;
}

export function WallV2GroceryCard({ data, onTap }: Props) {
  const tint = TINTS.peach;

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!onTap}
      className="group w-full text-left bg-white/85 dark:bg-stone-900/70 border border-stone-200/70 dark:border-stone-700/60 rounded-2xl p-4 hover:bg-white dark:hover:bg-stone-900 disabled:hover:bg-white/85 dark:disabled:hover:bg-stone-900/70 transition-colors"
    >
      <div className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400 mb-2">
        Grocery update
      </div>
      <div className="flex items-center gap-3">
        <div className={`grid place-items-center w-12 h-12 rounded-2xl ${tint.bg} ${tint.fg}`}>
          <ShoppingBag className="w-6 h-6" />
        </div>
        <div className="flex-1 leading-tight">
          {data.count > 0 ? (
            <>
              <div className="text-[1rem] font-bold text-stone-800 dark:text-stone-100">
                {data.count} ingredient{data.count === 1 ? '' : 's'} missing
              </div>
              <ul className="mt-1 text-[0.85rem] text-stone-600 dark:text-stone-300 space-y-0.5">
                {data.items.slice(0, 3).map((item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-stone-400 dark:bg-stone-500 inline-block" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <div className="text-[1rem] font-bold text-stone-800 dark:text-stone-100">All set</div>
              <div className="text-[0.85rem] text-stone-500 dark:text-stone-400">{data.items[0]}</div>
            </>
          )}
        </div>
        {onTap && (
          <ChevronRight className="w-5 h-5 text-stone-400 dark:text-stone-500 group-hover:text-stone-600 dark:group-hover:text-stone-300" />
        )}
      </div>
    </button>
  );
}
