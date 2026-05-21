// src/components/wall-v2/WallV2EventCard.tsx
//
// A single timeline row. Layout left-to-right:
//   [icon chip]  [title / subtitle / detail]  [members]  [chips]  [chevron?]
//
// Optional `highlight` tints the entire card background (used for the
// featured family-dinner row in the mockup).

import { ChevronRight } from 'lucide-react';
import { TINTS } from './tints';
import type { WallV2TimelineEvent } from './types';

interface Props {
  event: WallV2TimelineEvent;
  onTap?: (id: string) => void;
}

export function WallV2EventCard({ event, onTap }: Props) {
  const tint = TINTS[event.tint];
  const highlight = event.highlight ? TINTS[event.highlight] : null;
  const Icon = event.icon;
  const tappable = Boolean(onTap || event.recipeUrl);

  const handleClick = () => {
    if (onTap) onTap(event.id);
  };

  return (
    <button
      type="button"
      onClick={tappable ? handleClick : undefined}
      disabled={!tappable}
      className={[
        'group w-full text-left flex items-center gap-4 rounded-2xl px-4 py-3 border transition-colors',
        highlight
          ? `${highlight.soft} border-stone-200/70 dark:border-stone-700/60`
          : 'bg-white/85 dark:bg-stone-900/70 border-stone-200/60 dark:border-stone-700/60',
        tappable ? 'hover:bg-white dark:hover:bg-stone-900 cursor-pointer' : 'cursor-default',
      ].join(' ')}
    >
      <div
        className={`shrink-0 grid place-items-center w-12 h-12 rounded-xl ${tint.bg} ${tint.fg}`}
        aria-hidden
      >
        <Icon className="w-5 h-5" />
      </div>

      <div className="flex-1 min-w-0 leading-tight">
        <div className="text-[1.05rem] font-bold text-stone-800 dark:text-stone-100 truncate">
          {event.title}
        </div>
        {(event.subtitle || event.meta) && (
          <div className="text-[0.85rem] text-stone-600 dark:text-stone-300 truncate">
            {event.subtitle}
            {event.subtitle && event.meta && (
              <span className="text-stone-400 dark:text-stone-500"> · </span>
            )}
            {event.meta}
          </div>
        )}
        {event.detail && (
          <div className="text-[0.8rem] text-stone-500 dark:text-stone-400 truncate">
            {event.detail}
          </div>
        )}
      </div>

      {event.members && event.members.length > 0 && (
        <div className="shrink-0 flex -space-x-2">
          {event.members.map((m) => {
            const t = TINTS[m.tint];
            return (
              <div
                key={m.id}
                className={`grid place-items-center w-9 h-9 rounded-full ring-2 ring-white dark:ring-stone-900 ${t.bg} ${t.fg} text-[0.72rem] font-bold`}
                title={m.initials}
              >
                {m.initials}
              </div>
            );
          })}
        </div>
      )}

      {event.chips && event.chips.length > 0 && (
        <div className="shrink-0 flex items-center gap-1.5">
          {event.chips.map((chip, i) => {
            const ChipIcon = chip.icon;
            const t = chip.tint ? TINTS[chip.tint] : TINTS.sand;
            return (
              <span
                key={`${chip.label}-${i}`}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${t.bg} ${t.fg} text-[0.72rem] font-bold`}
              >
                {ChipIcon && <ChipIcon className="w-3.5 h-3.5" />}
                {chip.label}
              </span>
            );
          })}
        </div>
      )}

      {tappable && (
        <ChevronRight className="shrink-0 w-5 h-5 text-stone-400 dark:text-stone-500 group-hover:text-stone-600 dark:group-hover:text-stone-300" />
      )}
    </button>
  );
}
