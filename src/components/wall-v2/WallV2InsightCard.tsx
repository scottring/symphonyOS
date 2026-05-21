// src/components/wall-v2/WallV2InsightCard.tsx
//
// Right-column AI INSIGHT widget — soft pencil/leaf header, paragraph body,
// optional CTA aligned right. Background gets a quiet leaf accent.

import { ArrowRight, Leaf, PencilLine } from 'lucide-react';
import type { WallV2InsightData } from './types';

interface Props {
  data: WallV2InsightData;
  onTap?: () => void;
}

export function WallV2InsightCard({ data, onTap }: Props) {
  return (
    <div className="relative bg-white/85 dark:bg-stone-900/70 border border-stone-200/70 dark:border-stone-700/60 rounded-2xl p-4 overflow-hidden">
      <div className="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400 mb-2">
        <PencilLine className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
        AI insight
      </div>
      <p className="text-[0.95rem] leading-snug text-stone-700 dark:text-stone-200">
        {data.body}
      </p>
      {data.cta && (
        <button
          type="button"
          onClick={onTap}
          disabled={!onTap}
          className="mt-2 inline-flex items-center gap-1.5 text-[0.85rem] font-bold text-emerald-800 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-200"
        >
          {data.cta}
          <ArrowRight className="w-4 h-4" />
        </button>
      )}
      <Leaf className="absolute top-2 right-2 w-10 h-10 text-emerald-200/80 dark:text-emerald-700/40 rotate-12" aria-hidden />
    </div>
  );
}
